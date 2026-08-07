// Debugging tool: dumps what the checker has recorded, so you can see why a
// notification did or didn't fire.
//
//   FIREBASE_SERVICE_ACCOUNT=path\to\key.json npm run inspect          # all movie snapshots
//   FIREBASE_SERVICE_ACCOUNT=path\to\key.json npm run inspect -- <uid> # plus one user's watchlist
import { readFileSync } from 'node:fs'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const raw = process.env.FIREBASE_SERVICE_ACCOUNT
if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT not set')
initializeApp({
  credential: cert(JSON.parse(raw.trim().startsWith('{') ? raw : readFileSync(raw, 'utf8'))),
})
const db = getFirestore()

const names = (l = []) => (l.length ? l.map((p) => p.name).join(', ') : '—')

console.log('=== movies/{id} availability snapshots ===\n')
const snaps = await db.collection('movies').orderBy('title').get()
if (snaps.empty) console.log('(none yet — the checker has not run, or nobody is tracking anything)\n')
for (const d of snaps.docs) {
  const { title, state, lastCheckedAt } = d.data()
  console.log(`${title}  (id ${d.id})`)
  console.log(`  digital=${state.digitalReleased}  rentBuy=${state.rentBuy}  free=${state.freeWithSub}`)
  console.log(`  subscription: ${names(state.providers.flatrate)}`)
  console.log(`  free/ads:     ${names(state.providers.free)} / ${names(state.providers.ads)}`)
  console.log(`  rent/buy:     ${names(state.providers.rent)}`)
  console.log(`  checked:      ${lastCheckedAt?.toDate().toISOString() ?? 'never'}\n`)
}

const uid = process.argv[2]
if (uid) {
  console.log(`=== watchlist for ${uid} ===\n`)
  const wl = await db.collection('users').doc(uid).collection('watchlist').get()
  if (wl.empty) console.log('(empty)')
  for (const d of wl.docs) {
    const w = d.data()
    const n = w.notified ?? {}
    const flag = (v) => (v ? 'notified' : '   —    ')
    console.log(`${w.title}`)
    console.log(`  status:   ${JSON.stringify(w.status ?? null)}`)
    console.log(`  notify:   ${JSON.stringify(w.notify)}`)
    console.log(`  sent:     digital=${flag(n.digital)} rentBuy=${flag(n.rentBuy)} free=${flag(n.free)}\n`)
  }

  const tokens = await db.collection('users').doc(uid).collection('fcmTokens').get()
  console.log(`push tokens registered: ${tokens.size}`)
}
