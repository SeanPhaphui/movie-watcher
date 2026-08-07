// Manual end-to-end test of the notification pipeline against the real project.
//
//   node scripts/e2e-check.mjs
//
// Creates three throwaway anonymous users, runs the real checker, asserts the
// outcomes, and removes everything it created. It never touches other users'
// data, and only deletes the movies/{id} snapshot for its own fixture film.
import { spawnSync } from 'node:child_process'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { getAuth } from 'firebase-admin/auth'
import { loadServiceAccount } from './lib/credentials.mjs'

// A film that is unambiguously streaming, and that no real user tracks.
const FIXTURE = { id: 693134, title: 'Dune: Part Two' }

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()
const auth = getAuth()

// Tracked from the first moment a user exists, so a mid-run failure still
// leaves nothing behind in a project that has real users in it.
const created = []
const results = []
const check = (name, pass, detail = '') => {
  results.push(pass)
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

async function makeUser(label, { watched = false, quiet = false } = {}) {
  const user = await auth.createUser({})
  created.push(user.uid)
  await db.collection('users').doc(user.uid).set({
    createdAt: FieldValue.serverTimestamp(),
    timezone: 'UTC',
    // A window covering the whole day except one hour, so "now" is always inside.
    ...(quiet ? { quietHours: { enabled: true, start: 0, end: 23 } } : {}),
  })
  await db.collection('users').doc(user.uid).collection('watchlist').doc(String(FIXTURE.id)).set({
    movieId: FIXTURE.id,
    title: FIXTURE.title,
    posterPath: null,
    releaseDate: null,
    addedAt: FieldValue.serverTimestamp(),
    watchedAt: watched ? FieldValue.serverTimestamp() : null,
    notify: { digital: true, rentBuy: true, free: true },
    notified: { digital: null, rentBuy: null, free: null },
  })
  console.log(`  seeded ${label}: ${user.uid}`)
  return user.uid
}

console.log('Seeding throwaway users...')
const normal = await makeUser('normal', {})
const watched = await makeUser('watched', { watched: true })
const quiet = await makeUser('quiet-hours', { quiet: true })

console.log('\nRunning the real checker...\n')
const run = spawnSync(process.execPath, ['scripts/check-availability.mjs'], {
  encoding: 'utf8',
  env: process.env,
})
process.stdout.write(run.stdout)
if (run.status !== 0) {
  console.error(run.stderr)
  process.exit(1)
}

const wl = async (uid) =>
  (await db.collection('users').doc(uid).collection('watchlist').doc(String(FIXTURE.id)).get()).data()
const events = async (uid) => (await db.collection('users').doc(uid).collection('events').get()).docs

console.log('')
const a = await wl(normal)
check('normal user was notified it is streaming free', Boolean(a.notified?.free))
check('normal user got a status badge', a.status?.kind === 'streaming', JSON.stringify(a.status))
const normalEvents = await events(normal)
check('normal user has an update in their history', normalEvents.length > 0)
// A film reaching streaming trips digital + rentBuy + free at once. The user
// should hear about that once, not three times.
check(
  'one real-world event produced exactly one notification',
  normalEvents.length === 1,
  `got ${normalEvents.length}: ${normalEvents.map((d) => d.data().type).join(', ')}`,
)
check(
  'it sent the most specific alert (free), not the vaguest',
  normalEvents[0]?.data().type === 'free',
  normalEvents[0]?.data().type,
)
check(
  'the redundant types were still marked so they never fire later',
  Boolean(a.notified?.digital) && Boolean(a.notified?.rentBuy),
)

const b = await wl(watched)
check('watched film sent nothing', !b.notified?.free && !b.notified?.digital)
check('watched film wrote no update history', (await events(watched)).length === 0)

const c = await wl(quiet)
check('quiet hours suppressed the send', !c.notified?.free)
check(
  'quiet hours did NOT mark it notified, so a later run still delivers',
  c.notified?.free == null,
)
check('quiet hours wrote no update history', (await events(quiet)).length === 0)

const snap = await db.collection('movies').doc(String(FIXTURE.id)).get()
check('global snapshot was written', snap.exists && snap.data().state?.freeWithSub === true)

console.log('\nCleaning up...')
for (const uid of created) {
  for (const c of ['watchlist', 'events', 'fcmTokens']) {
    const docs = await db.collection('users').doc(uid).collection(c).get()
    for (const d of docs.docs) await d.ref.delete()
  }
  await db.collection('users').doc(uid).delete()
  await auth.deleteUser(uid).catch(() => {})
}
// Only this fixture's snapshot — never a real user's.
await db.collection('movies').doc(String(FIXTURE.id)).delete()
console.log('  removed 3 test users and the fixture snapshot')

const failed = results.filter((r) => !r).length
console.log(`\n${results.length - failed}/${results.length} passed`)
process.exit(failed ? 1 : 0)
