// Prove the "it hit streaming" notification really lands on a real device.
//
//   npm run test:push                    # list devices that could be tested
//   npm run test:push -- --uid <uid>     # dry run: show exactly what would happen
//   npm run test:push -- --uid <uid> --send
//
// It does NOT reimplement the notification logic — that would only test itself.
// It temporarily tracks a film that is genuinely streaming, then invokes the
// real scripts/check-availability.mjs, so the classification, message wording,
// FCM send, and history write are all the production code path. Afterwards it
// removes only what it added.
import { spawnSync } from 'node:child_process'
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore, FieldValue } from 'firebase-admin/firestore'
import { loadServiceAccount } from './lib/credentials.mjs'

// Long-since-streaming, so the checker will always classify it as available.
const FIXTURE = { id: 693134, title: 'Dune: Part Two' }

const argv = process.argv.slice(2)
const opt = (n) => (argv.indexOf(`--${n}`) !== -1 ? argv[argv.indexOf(`--${n}`) + 1] : undefined)
const uid = opt('uid')
const send = argv.includes('--send')
// Prove the *scheduled* job works, not just the script on this laptop.
const viaActions = argv.includes('--via-actions')

const sh = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf8' })

/** Fires the real workflow on GitHub and waits for it, returning its log. */
function runOnGitHub() {
  const remote = sh('git', ['remote', 'get-url', 'origin']).stdout?.trim() ?? ''
  const repo = remote.replace(/^.*github\.com[/:]/, '').replace(/\.git$/, '')
  if (!repo) throw new Error('Could not determine the GitHub repo from git remote origin.')

  const localHead = sh('git', ['rev-parse', 'HEAD']).stdout?.trim()
  const remoteHead = sh('git', ['rev-parse', 'origin/main']).stdout?.trim()
  if (localHead && remoteHead && localHead !== remoteHead) {
    console.log('\n!! Local HEAD differs from origin/main — GitHub will run the PUSHED code,')
    console.log('   not what is on this machine. Push first for this test to mean anything.\n')
  }

  console.log(`Triggering the workflow on ${repo}...`)
  const before = sh('gh', ['run', 'list', '--repo', repo, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId']).stdout?.trim()
  const fired = sh('gh', ['workflow', 'run', 'check-availability.yml', '--repo', repo])
  if (fired.status !== 0) throw new Error(`gh workflow run failed: ${fired.stderr}`)

  let runId = before
  for (let i = 0; i < 20 && runId === before; i++) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 3000)
    runId = sh('gh', ['run', 'list', '--repo', repo, '--limit', '1', '--json', 'databaseId', '--jq', '.[0].databaseId']).stdout?.trim()
  }
  console.log(`  run ${runId} started; waiting for it to finish...`)
  const watched = sh('gh', ['run', 'watch', runId, '--repo', repo, '--exit-status'])
  const conclusion = sh('gh', ['run', 'view', runId, '--repo', repo, '--json', 'conclusion', '--jq', '.conclusion']).stdout?.trim()
  console.log(`  conclusion: ${conclusion}`)
  if (watched.status !== 0 && conclusion !== 'success') {
    console.log(watched.stdout ?? '')
  }
  const jobId = sh('gh', ['api', `repos/${repo}/actions/runs/${runId}/jobs`, '--jq', '.jobs[0].id']).stdout?.trim()
  return sh('gh', ['api', `repos/${repo}/actions/jobs/${jobId}/logs`]).stdout ?? ''
}

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()

if (!uid) {
  const tokens = await db.collectionGroup('fcmTokens').get()
  const byUser = new Map()
  for (const d of tokens.docs) {
    const u = d.ref.parent.parent.id
    byUser.set(u, (byUser.get(u) ?? 0) + 1)
  }
  if (!byUser.size) {
    console.log('No devices have notifications enabled yet.')
    console.log('Install the PWA, turn on alerts in Settings, then re-run this.')
    process.exit(0)
  }
  console.log('Devices that can be tested:\n')
  for (const [u, n] of byUser) {
    const wl = await db.collection('users').doc(u).collection('watchlist').get()
    const ua = (await db.collection('users').doc(u).collection('fcmTokens').get()).docs[0]?.data()
      ?.userAgent
    const device = /iPhone|iPad/i.test(ua ?? '') ? 'iOS' : /Android/i.test(ua ?? '') ? 'Android' : 'desktop'
    console.log(`  ${u}   ${n} device(s), ${wl.size} tracked   [${device}]`)
  }
  console.log('\nThen: npm run test:push -- --uid <uid> --send')
  process.exit(0)
}

const userRef = db.collection('users').doc(uid)
const tokens = await userRef.collection('fcmTokens').get()
if (tokens.empty) {
  console.error(`User ${uid} has no registered devices — nothing could be delivered.`)
  console.error('Open the app on the phone, Settings > Enable notifications, then retry.')
  process.exit(1)
}

const prefs = (await userRef.get()).data() ?? {}
const quiet = prefs.quietHours
console.log(`Target:   ${uid}`)
console.log(`Devices:  ${tokens.size}`)
console.log(`Timezone: ${prefs.timezone ?? 'unset'}`)
if (quiet?.enabled) {
  console.log(
    `\n!! Quiet hours are on (${quiet.start}:00–${quiet.end}:00). If "now" falls inside that\n` +
      '   window the checker will correctly hold the push back and this test will show\n' +
      '   nothing delivered. Turn them off in Settings to test right now.',
  )
}
console.log(`\nWill temporarily track "${FIXTURE.title}", which is streaming, then run the`)
console.log('real checker. Expected result: one push, worded exactly as a genuine alert.')

if (!send) {
  console.log('\nDry run — nothing changed. Re-run with --send to actually do it.')
  process.exit(0)
}

const entryRef = userRef.collection('watchlist').doc(String(FIXTURE.id))
const existing = await entryRef.get()
if (existing.exists) {
  console.error(`\nYou already track "${FIXTURE.title}". Pick a different fixture or untrack it`)
  console.error('first — this script refuses to overwrite a real watchlist entry.')
  process.exit(1)
}

console.log('\nSeeding...')
await entryRef.set({
  movieId: FIXTURE.id,
  title: FIXTURE.title,
  posterPath: null,
  releaseDate: null,
  addedAt: FieldValue.serverTimestamp(),
  watchedAt: null,
  notify: { digital: true, rentBuy: false, free: true },
  notified: { digital: null, rentBuy: null, free: null },
})

// Force a fresh evaluation even if the snapshot is recent.
await db.collection('movies').doc(String(FIXTURE.id)).delete().catch(() => {})

let output = ''
if (viaActions) {
  output = runOnGitHub()
} else {
  console.log('Running the real checker locally...\n')
  const run = spawnSync(process.execPath, ['scripts/check-availability.mjs'], {
    encoding: 'utf8',
    env: process.env,
  })
  output = run.stdout ?? ''
  process.stdout.write(output)
  if (run.stderr) process.stderr.write(run.stderr)
}

const after = (await entryRef.get()).data()
const events = await userRef
  .collection('events')
  .where('movieId', '==', FIXTURE.id)
  .get()

console.log('\n--- result ---')
const delivered = /ok=[1-9]/.test(output)
console.log(`push sent to a device:      ${delivered ? 'YES' : 'no'}`)
console.log(`marked as notified:         ${after?.notified?.free ? 'YES' : 'no'}`)
console.log(`badge on My Movies:         ${JSON.stringify(after?.status ?? null)}`)
console.log(`appears in Updates:         ${events.size > 0 ? 'YES' : 'no'}`)
if (events.size) {
  const e = events.docs[0].data()
  console.log(`\nthe notification your phone received:`)
  console.log(`   ${e.headline}`)
  console.log(`   ${e.body}`)
}

console.log('\nCleaning up what this test added...')
await entryRef.delete()
for (const d of events.docs) await d.ref.delete()
await db.collection('movies').doc(String(FIXTURE.id)).delete().catch(() => {})
console.log('  removed the temporary watchlist entry and its update')

if (!delivered) {
  console.log('\nNo push went out. Common causes:')
  console.log('  - quiet hours are active (see the warning above)')
  console.log('  - the device token expired; open the app once to re-register it')
  process.exit(1)
}
console.log('\nCheck the phone — the notification should be on the lock screen.')
