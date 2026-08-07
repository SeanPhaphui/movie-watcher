// Availability checker — run by GitHub Actions on a schedule (or locally).
// For every movie anyone tracks: fetch TMDB availability, then push FCM
// notifications for any newly-true event the user hasn't been told about.
//
// Env: TMDB_TOKEN (v4 read token), FIREBASE_SERVICE_ACCOUNT (service-account
// JSON, either raw JSON or a path to a .json file).
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
import { isQuietNow } from './lib/quiet-hours.mjs'
import { loadServiceAccount, loadTmdbToken } from './lib/credentials.mjs'

// A movie with nothing left to notify still gets re-checked this often, so
// badges stay honest and no TMDB content is cached beyond its 6-month limit.
const STALE_DAYS = 14
const FETCH_CONCURRENCY = 8 // TMDB allows ~50 req/s; this is deliberately gentle
const GET_ALL_CHUNK = 300

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
  const tmdbToken = loadTmdbToken()

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

  // Per-user prefs: subscribed services (empty means "any"), plus timezone and
  // quiet hours. One read per user per run, cached.
  const prefsCache = new Map()
  async function prefsFor(uid) {
    if (!prefsCache.has(uid)) {
      const doc = await db.collection('users').doc(uid).get()
      const d = doc.exists ? doc.data() : {}
      prefsCache.set(uid, {
        services: d.services ?? [],
        timezone: d.timezone ?? 'UTC',
        quietHours: d.quietHours,
      })
    }
    return prefsCache.get(uid)
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

  const runAt = new Date()
  let checked = 0
  let sent = 0
  let deferred = 0

  for (const { id: movieId, movie } of fetched) {
    if (!movie) continue
    checked++

    const state = computeState(movie)
    const posterPath = movie.poster_path ?? null

    for (const watcher of byMovie.get(movieId)) {
      // Already seen it — never alert, but keep the badge fresh below.
      const done = Boolean(watcher.watchedAt)

      // "Free with subscription" is the one event that depends on who's asking:
      // landing on Max means nothing to someone who doesn't have Max.
      const { services, timezone, quietHours } = await prefsFor(watcher.uid)
      const quiet = isQuietNow(quietHours, timezone, runAt)
      const flags = {
        digital: state.digitalReleased,
        rentBuy: state.rentBuy,
        free: isOnMyServices(state, services),
      }
      const status = deriveStatus(state, services)

      // `notified` is the send-guard: an event fires at most once per user per
      // movie, so a provider flapping or a missed run never double-notifies.
      const firing = done
        ? []
        : NOTIFY_TYPES.filter(
            (t) => flags[t] && watcher.notify?.[t] && !watcher.notified?.[t],
          )

      // Inside quiet hours we hold everything back — crucially without marking
      // anything notified, so a later run delivers it rather than the alert
      // being silently swallowed.
      if (firing.length && quiet) deferred += firing.length

      if (firing.length && !quiet) {
        // A film reaching streaming makes several flags true in the same run —
        // it is simultaneously "out digitally", "rentable" and "free on a
        // service". Sending one push per flag means three near-identical
        // notifications for a single real-world event, so send only the most
        // specific one and mark the rest as told.
        const type = ['free', 'rentBuy', 'digital'].find((t) => firing.includes(t))
        const msg = composeMessage(type, movie.title, state, services)

        const tokens = await tokensFor(watcher.uid)
        if (tokens.length) {
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
        // Durable record of the alert, whether or not a push went out — a
        // notification missed on a lock screen is still findable in the app.
        await db
          .collection('users')
          .doc(watcher.uid)
          .collection('events')
          .add({
            movieId,
            title: movie.title,
            posterPath,
            type,
            headline: msg.title,
            body: msg.body,
            createdAt: FieldValue.serverTimestamp(),
            readAt: null,
          })

        // Every firing type is marked, not just the one we sent — the user has
        // been told the film is available, so the others would be redundant
        // later. Marked even with zero tokens, so nobody is ambushed by a stale
        // alert the day they finally enable notifications.
        const marks = {}
        for (const t of firing) marks[`notified.${t}`] = FieldValue.serverTimestamp()
        await watcher.ref.update(marks)
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

  console.log(
    `Done. Checked ${checked} movies, sent ${sent} notifications` +
      (deferred ? `, deferred ${deferred} for quiet hours.` : "."),
  )
}

await main()
