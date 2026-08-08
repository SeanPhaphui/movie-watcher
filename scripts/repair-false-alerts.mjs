// One-off repair for alerts sent before pre-orders were distinguished from
// real availability.
//
//   npm run repair            # dry run — shows what it would change
//   npm run repair -- --apply
//
// A storefront listing a still-theatrical film for pre-order used to read as
// "you can buy this now", which both sent a false push and set the `notified`
// send-guard — meaning the genuine alert could never fire later. This finds
// entries marked notified for something the film is not actually available
// for, clears those flags so the real alert can still land, and removes the
// false entry from the user's Updates history.
//
// It only clears a flag when the film is currently NOT available for that
// type, so a correctly-sent alert is never re-armed.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { computeState, NOTIFY_TYPES } from './lib/availability.mjs'
import { loadServiceAccount, loadTmdbToken } from './lib/credentials.mjs'

const apply = process.argv.includes('--apply')

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()
const token = loadTmdbToken()

const stateCache = new Map()
async function stateFor(movieId) {
  if (!stateCache.has(movieId)) {
    const res = await fetch(
      `https://api.themoviedb.org/3/movie/${movieId}?append_to_response=release_dates,watch/providers`,
      { headers: { Authorization: `Bearer ${token}` } },
    )
    stateCache.set(movieId, res.ok ? computeState(await res.json()) : null)
    await new Promise((r) => setTimeout(r, 60))
  }
  return stateCache.get(movieId)
}

let repaired = 0
let eventsRemoved = 0

for (const doc of (await db.collectionGroup('watchlist').get()).docs) {
  const entry = doc.data()
  const marked = NOTIFY_TYPES.filter((t) => entry.notified?.[t])
  if (!marked.length) continue

  const state = await stateFor(entry.movieId)
  if (!state) continue

  const availableNow = {
    digital: state.digitalReleased,
    rentBuy: state.rentBuy,
    // Checked against any service: if it is on nothing at all, no user's
    // selection could make the alert legitimate.
    free: state.freeWithSub,
  }
  const bogus = marked.filter((t) => !availableNow[t])
  if (!bogus.length) continue

  const uid = doc.ref.parent.parent.id
  console.log(`${apply ? 'FIXING' : 'would fix'}  ${entry.title}  (uid ${uid})`)
  console.log(`   clearing: ${bogus.join(', ')}  — film is not actually available for these`)

  const events = await db
    .collection('users')
    .doc(uid)
    .collection('events')
    .where('movieId', '==', entry.movieId)
    .get()
  const staleEvents = events.docs.filter((e) => bogus.includes(e.data().type))
  for (const e of staleEvents) console.log(`   removing update: "${e.data().headline}"`)

  if (apply) {
    const patch = {}
    for (const t of bogus) patch[`notified.${t}`] = null
    await doc.ref.update(patch)
    for (const e of staleEvents) await e.ref.delete()
  }
  repaired++
  eventsRemoved += staleEvents.length
}

console.log(
  `\n${apply ? 'Repaired' : 'Would repair'} ${repaired} watchlist entr${repaired === 1 ? 'y' : 'ies'}` +
    `, ${apply ? 'removed' : 'would remove'} ${eventsRemoved} false update(s).`,
)
if (!apply && repaired) console.log('Re-run with --apply to make the changes.')
