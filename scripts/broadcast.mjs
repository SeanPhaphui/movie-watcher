// Send a one-off push to everyone who has notifications turned on — an
// announcement, or a test to your own device.
//
// Dry run by default. It prints who would receive it and sends nothing until
// you add --send, because the failure mode here is messaging real people.
//
//   npm run announce -- "Heads up" "Marquee just got faster"
//   npm run announce -- "Heads up" "Marquee just got faster" --send
//   npm run announce -- "Test" "Hello" --uid <uid> --send
//   npm run announce -- "New" "Take a look" --url my-movies --send
//
// Credentials come from FIREBASE_SERVICE_ACCOUNT, or a FIREBASE_SERVICE_ACCOUNT
// line in .env.local, or ./service-account.json — whichever it finds first.
import { initializeApp, cert } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getMessaging } from 'firebase-admin/messaging'
import { loadServiceAccount } from './lib/credentials.mjs'

const MULTICAST_LIMIT = 500

const argv = process.argv.slice(2)
function opt(name) {
  const i = argv.indexOf(`--${name}`)
  return i !== -1 ? argv[i + 1] : undefined
}
const flag = (name) => argv.includes(`--${name}`)

// Positional "title" "body" are the short form; --title/--body still work.
const positional = []
for (let i = 0; i < argv.length; i++) {
  if (argv[i].startsWith('--')) {
    if (!['send'].includes(argv[i].slice(2))) i++ // skip this flag's value
    continue
  }
  positional.push(argv[i])
}

const title = opt('title') ?? positional[0]
const body = opt('body') ?? positional[1]
const url = opt('url')
const onlyUid = opt('uid')
const send = flag('send')

if (!title || !body) {
  console.error('Usage: npm run announce -- "Title" "Body" [--url path] [--uid <uid>] [--send]')
  process.exit(1)
}

// Git Bash rewrites a leading-slash argument into a Windows path, so "/my-movies"
// silently arrives as "C:/Program Files/Git/my-movies" — and we would ship that
// broken link to every device. Reject that, and accept the slash-less form
// ("my-movies") so there's a spelling that works in every shell.
let target
if (url !== undefined) {
  if (/^[A-Za-z]:[/\\]/.test(url)) {
    console.error(`--url looks like a Windows path ("${url}") — Git Bash rewrote it.`)
    console.error('Pass it without the leading slash instead, e.g. --url my-movies')
    process.exit(1)
  }
  target = '/' + url.replace(/^\/+/, '')
}

initializeApp({ credential: cert(loadServiceAccount()) })
const db = getFirestore()
const messaging = getMessaging()

// Every registered device, or just one user's when --uid is given.
const snap = onlyUid
  ? await db.collection('users').doc(onlyUid).collection('fcmTokens').get()
  : await db.collectionGroup('fcmTokens').get()

const targets = snap.docs
  .map((d) => ({ ref: d.ref, uid: d.ref.parent.parent.id, token: d.data().token }))
  .filter((t) => t.token)

const users = new Set(targets.map((t) => t.uid))
console.log(`${targets.length} device(s) across ${users.size} user(s)${onlyUid ? ` (uid ${onlyUid})` : ''}`)
console.log(`  title: ${title}`)
console.log(`  body:  ${body}`)
if (target) console.log(`  opens: ${target}`)

if (!targets.length) {
  console.log('\nNobody has notifications enabled yet — nothing to send.')
  process.exit(0)
}

if (!send) {
  console.log(`\nDry run — nothing sent. Add --send to deliver to ${targets.length} device(s).`)
  process.exit(0)
}

// Data-only payload so the service worker builds the notification itself;
// a `notification` block here would double up with onBackgroundMessage.
const data = { title, body, tag: `broadcast-${Date.now()}` }
if (target) data.url = target

let ok = 0
let failed = 0
for (let i = 0; i < targets.length; i += MULTICAST_LIMIT) {
  const batch = targets.slice(i, i + MULTICAST_LIMIT)
  const res = await messaging.sendEachForMulticast({ tokens: batch.map((t) => t.token), data })
  res.responses.forEach((r, j) => {
    if (r.success) return ok++
    failed++
    const code = r.error?.code
    if (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-argument'
    ) {
      console.log(`  pruning dead token for ${batch[j].uid}`)
      batch[j].ref.delete().catch(() => {})
    } else {
      console.warn(`  failed for ${batch[j].uid}: ${code ?? r.error?.message}`)
    }
  })
}

console.log(`\nDelivered ${ok}, failed ${failed}.`)
