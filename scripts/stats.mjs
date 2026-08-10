// Usage snapshot.  npm run stats
//
// Raw account count overstates reality: sign-in is anonymous, so every fresh
// browser, incognito window or cleared-data visit mints a new uid. What matters
// is how many of those actually did something.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { loadServiceAccount } from './lib/credentials.mjs'

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

const DAY = 86_400_000
const now = Date.now()
const ms = (ts) => (ts?.toMillis ? ts.toMillis() : 0)
const pct = (n, of) => (of ? ` (${Math.round((n / of) * 100)}%)` : '')

const users = (await db.collection('users').get()).docs
const watchlist = (await db.collectionGroup('watchlist').get()).docs
const tokens = (await db.collectionGroup('fcmTokens').get()).docs
const events = (await db.collectionGroup('events').get()).docs

const trackedBy = new Map()
for (const d of watchlist) {
  const uid = d.ref.parent.parent.id
  trackedBy.set(uid, (trackedBy.get(uid) ?? 0) + 1)
}
const tokensBy = new Map()
for (const d of tokens) {
  const uid = d.ref.parent.parent.id
  tokensBy.set(uid, (tokensBy.get(uid) ?? 0) + 1)
}

const engaged = users.filter((u) => trackedBy.has(u.id))
const withPush = users.filter((u) => tokensBy.has(u.id))
const ghosts = users.filter((u) => !trackedBy.has(u.id) && !tokensBy.has(u.id))
const seen = (days) => users.filter((u) => now - ms(u.data().lastSeenAt) < days * DAY)

console.log('\n═══ PEOPLE ═══')
console.log(`  Tracked at least one film   ${engaged.length}${pct(engaged.length, users.length)}   <- the real number`)
console.log(`  Turned on notifications     ${withPush.length}${pct(withPush.length, users.length)}`)
console.log(`  Anonymous accounts total    ${users.length}`)
console.log(`    of which never did anything  ${ghosts.length}  (fresh browsers, incognito, cleared data)`)
console.log(`  Opened the app in last 24h  ${seen(1).length}`)
console.log(`  Opened the app in last 7d   ${seen(7).length}`)

console.log('\n═══ DEVICES ═══')
const platforms = { iOS: 0, Android: 0, desktop: 0 }
for (const t of tokens) {
  const ua = t.data().userAgent ?? ''
  platforms[/iPhone|iPad/i.test(ua) ? 'iOS' : /Android/i.test(ua) ? 'Android' : 'desktop']++
}
console.log(`  Registered for push         ${tokens.length}   ${Object.entries(platforms).filter(([, n]) => n).map(([k, n]) => `${k}: ${n}`).join(', ') || '—'}`)

console.log('\n═══ TRACKING ═══')
const watched = watchlist.filter((d) => d.data().watchedAt).length
const byMovie = new Map()
for (const d of watchlist) {
  const t = d.data().title ?? '?'
  byMovie.set(t, (byMovie.get(t) ?? 0) + 1)
}
console.log(`  Films tracked (entries)     ${watchlist.length}`)
console.log(`  Distinct films              ${byMovie.size}`)
console.log(`  Marked watched              ${watched}`)
if (engaged.length) {
  console.log(`  Average per engaged person  ${(watchlist.length / engaged.length).toFixed(1)}`)
}
const top = [...byMovie.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
if (top.length) {
  console.log('  Most tracked:')
  for (const [title, n] of top) console.log(`    ${String(n).padStart(2)}x  ${title}`)
}

console.log('\n═══ ALERTS ═══')
const sent24 = events.filter((e) => now - ms(e.data().createdAt) < DAY).length
const byType = {}
for (const e of events) byType[e.data().type] = (byType[e.data().type] ?? 0) + 1
console.log(`  Sent all time               ${events.length}${events.length ? '   ' + Object.entries(byType).map(([k, n]) => `${k}: ${n}`).join(', ') : ''}`)
console.log(`  Sent in last 24h            ${sent24}`)

const snaps = (await db.collection('movies').get()).docs
const available = snaps.filter((s) => s.data().state?.digitalReleased).length
console.log(`  Films being watched for     ${snaps.length}  (${available} already available, ${snaps.length - available} still waiting)`)
console.log('')
