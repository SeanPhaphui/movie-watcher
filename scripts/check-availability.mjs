// Availability checker — run by GitHub Actions on a schedule (or locally).
// For every movie anyone tracks: fetch TMDB availability, then push FCM
// notifications for any newly-true event the user hasn't been told about.
//
// Env: TMDB_TOKEN (v4 read token), FIREBASE_SERVICE_ACCOUNT (service-account
// JSON, either raw JSON or a path to a .json file).
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import {
  computeState,
  composeMessage,
  deriveStatus,
  isOnMyServices,
  sameStatus,
  shouldCheck,
  NOTIFY_TYPES,
} from './lib/availability.mjs'

// A movie with nothing left to notify still gets re-checked this often, so
// badges stay honest and no TMDB content is cached beyond its 6-month limit.
const STALE_DAYS = 14
const FETCH_CONCURRENCY = 8 // TMDB allows ~50 req/s; this is deliberately gentle
const GET_ALL_CHUNK = 300

// Diagnostics describe the shape of the value, never its contents — these
// messages end up in public CI logs.
function loadServiceAccount() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT
  if (!raw || !raw.trim()) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set. In CI, add it as a repository secret ' +
        '(Settings > Secrets and variables > Actions) containing the whole ' +
        'service-account JSON. Locally, set it to the JSON or a path to the file.',
    )
  }

  const looksLikeJson = raw.trim().startsWith('{')
  let text = raw
  if (!looksLikeJson) {
    try {
      text = readFileSync(raw.trim(), 'utf8')
    } catch {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT is set (${raw.length} chars) but is neither JSON ` +
          `(it starts with "${raw.trim()[0]}") nor a readable file path. Paste the raw ` +
          'JSON file contents — not base64, not a quoted string.',
      )
    }
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${err.message}`)
  }
  for (const field of ['project_id', 'private_key', 'client_email']) {
    if (!parsed[field]) throw new Error(`FIREBASE_SERVICE_ACCOUNT is missing "${field}"`)
  }
  return parsed
}

async function fetchMovie(id, token) {
  const res = await fetch(
    `https://api.themoviedb.org/3/movie/${id}?append_to_response=release_dates,watch/providers`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`TMDB ${res.status} for movie ${id}`)
  return res.json()
}

/** Run `fn` over `items` with bounded concurrency, preserving input order. */
async function mapPool(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++
        results[i] = await fn(items[i], i)
      }
    }),
  )
  return results
}

const chunk = (arr, size) =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) =>
    arr.slice(i * size, i * size + size),
  )

async function main() {
  const tmdbToken = process.env.TMDB_TOKEN?.trim()
  if (!tmdbToken) {
    throw new Error(
      'TMDB_TOKEN is not set. In CI, add it as a repository secret. It must be the ' +
        'v4 "API Read Access Token" (a long JWT), not the short v3 API key.',
    )
  }
  if (!tmdbToken.startsWith('ey')) {
    throw new Error(
      `TMDB_TOKEN does not look like a v4 read token (${tmdbToken.length} chars, ` +
        'expected a JWT starting "ey"). The short v3 API key will not work — this ' +
        'script sends it as a Bearer token.',
    )
  }

  initializeApp({ credential: cert(loadServiceAccount()) })
  const db = getFirestore()
  const messaging = getMessaging()

  // Every tracked movie across every user, grouped so each is fetched once.
  const watchSnap = await db.collectionGroup('watchlist').get()
  const byMovie = new Map()
  for (const doc of watchSnap.docs) {
    const data = doc.data()
    const id = data.movieId ?? Number(doc.id)
    if (!Number.isFinite(id)) continue
    if (!byMovie.has(id)) byMovie.set(id, [])
    byMovie.get(id).push({ uid: doc.ref.parent.parent.id, ref: doc.ref, ...data })
  }

  const allIds = [...byMovie.keys()]
  console.log(`${allIds.length} unique movies across ${watchSnap.size} watchlist entries`)
  if (!allIds.length) return

  // Existing snapshots tell us which movies are settled and how stale they are.
  const snapshots = new Map()
  for (const ids of chunk(allIds, GET_ALL_CHUNK)) {
    const docs = await db.getAll(...ids.map((id) => db.collection('movies').doc(String(id))))
    docs.forEach((d, i) => d.exists && snapshots.set(ids[i], d.data()))
  }

  // Skip movies where nobody can be notified and the snapshot is still fresh.
  // In steady state most of a mature watchlist is already-streaming titles that
  // everyone has been told about, so this is the difference between checking
  // every movie forever and checking only the ones that can still change.
  const now = Date.now()
  const toCheck = allIds.filter((id) =>
    shouldCheck(byMovie.get(id), snapshots.get(id)?.lastCheckedAt?.toMillis(), now, STALE_DAYS),
  )
  console.log(`${toCheck.length} need checking, ${allIds.length - toCheck.length} settled/skipped`)

  const fetched = await mapPool(toCheck, FETCH_CONCURRENCY, async (id) => {
    try {
      return { id, movie: await fetchMovie(id, tmdbToken) }
    } catch (err) {
      console.warn(`skip ${id}: ${err.message}`)
      return { id, movie: null }
    }
  })

  // Which services each user subscribes to; empty/absent means "any service".
  const servicesCache = new Map()
  async function servicesFor(uid) {
    if (!servicesCache.has(uid)) {
      const doc = await db.collection('users').doc(uid).get()
      servicesCache.set(uid, doc.exists ? (doc.data().services ?? []) : [])
    }
    return servicesCache.get(uid)
  }

  const tokenCache = new Map()
  async function tokensFor(uid) {
    if (!tokenCache.has(uid)) {
      const snap = await db.collection('users').doc(uid).collection('fcmTokens').get()
      tokenCache.set(
        uid,
        snap.docs.map((d) => ({ ref: d.ref, token: d.data().token })).filter((t) => t.token),
      )
    }
    return tokenCache.get(uid)
  }

  let checked = 0
  let sent = 0

  for (const { id: movieId, movie } of fetched) {
    if (!movie) continue
    checked++

    const state = computeState(movie)
    const posterPath = movie.poster_path ?? null

    for (const watcher of byMovie.get(movieId)) {
      // "Free with subscription" is the one event that depends on who's asking:
      // landing on Max means nothing to someone who doesn't have Max.
      const services = await servicesFor(watcher.uid)
      const flags = {
        digital: state.digitalReleased,
        rentBuy: state.rentBuy,
        free: isOnMyServices(state, services),
      }
      const status = deriveStatus(state, services)

      for (const type of NOTIFY_TYPES) {
        // `notified` is the send-guard: an event fires at most once per user per
        // movie, so a provider flapping or a missed run never double-notifies.
        if (!flags[type] || !watcher.notify?.[type] || watcher.notified?.[type]) continue

        const tokens = await tokensFor(watcher.uid)
        if (tokens.length) {
          const msg = composeMessage(type, movie.title, state, services)
          const res = await messaging.sendEachForMulticast({
            tokens: tokens.map((t) => t.token),
            data: { title: msg.title, body: msg.body, movieId: String(movieId), type },
          })
          res.responses.forEach((r, i) => {
            const code = r.error?.code
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-argument'
            ) {
              tokens[i].ref.delete().catch(() => {})
            }
          })
          sent += res.successCount
          console.log(
            `notify uid=${watcher.uid} "${movie.title}" type=${type} ok=${res.successCount}/${tokens.length}`,
          )
        }
        // Marked even with zero tokens: the event has passed, so don't ambush
        // them with a stale alert the day they finally enable notifications.
        await watcher.ref.update({ [`notified.${type}`]: FieldValue.serverTimestamp() })
      }

      // Refresh the TMDB content and badge status held on the watchlist doc.
      // None of these change often, so this is normally zero writes — but it
      // saves the client a read per tracked movie on every single page view.
      if (
        watcher.title !== movie.title ||
        watcher.posterPath !== posterPath ||
        !sameStatus(watcher.status, status)
      ) {
        await watcher.ref.update({ title: movie.title, posterPath, status })
      }
    }

    await db.collection('movies').doc(String(movieId)).set(
      {
        title: movie.title,
        posterPath,
        state,
        lastCheckedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    )
  }

  console.log(`Done. Checked ${checked} movies, sent ${sent} notifications.`)
}

await main()
