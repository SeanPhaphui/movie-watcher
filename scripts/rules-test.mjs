// End-to-end security-rules test against the live project, driving the same
// REST endpoints the web SDK uses. Verifies a user can manage their own
// watchlist and cannot touch anyone else's or forge checker-owned fields.
import { readFileSync } from 'node:fs'

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => {
      const i = l.indexOf('=')
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    }),
)
const KEY = env.VITE_FIREBASE_API_KEY
const PROJECT = env.VITE_FIREBASE_PROJECT_ID
const DOCS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`

const signIn = async () => {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  })
  if (!r.ok) throw new Error(`sign-in failed: ${await r.text()}`)
  return r.json()
}

const req = (token, method, path, body) =>
  fetch(`${DOCS}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })

const results = []
const check = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const alice = await signIn()
const bob = await signIn()
const MOVIE = '999999'

const watchlistDoc = {
  fields: {
    movieId: { integerValue: MOVIE },
    title: { stringValue: 'Rules Test Movie' },
    posterPath: { nullValue: null },
    releaseDate: { nullValue: null },
    notify: {
      mapValue: {
        fields: {
          digital: { booleanValue: true },
          rentBuy: { booleanValue: false },
          free: { booleanValue: true },
        },
      },
    },
    notified: {
      mapValue: {
        fields: {
          digital: { nullValue: null },
          rentBuy: { nullValue: null },
          free: { nullValue: null },
        },
      },
    },
  },
}

// 1. Own watchlist write
let r = await req(alice.idToken, 'PATCH', `/users/${alice.localId}/watchlist/${MOVIE}`, watchlistDoc)
check('user can create their own watchlist entry', r.ok, r.ok ? '' : await r.text())

// 2. Own read
r = await req(alice.idToken, 'GET', `/users/${alice.localId}/watchlist/${MOVIE}`)
check('user can read their own watchlist entry', r.ok)

// 3. Cross-user read is denied
r = await req(bob.idToken, 'GET', `/users/${alice.localId}/watchlist/${MOVIE}`)
check('another user CANNOT read it', r.status === 403, `got HTTP ${r.status}`)

// 4. Cross-user write is denied
r = await req(bob.idToken, 'PATCH', `/users/${alice.localId}/watchlist/${MOVIE}`, watchlistDoc)
check('another user CANNOT overwrite it', r.status === 403, `got HTTP ${r.status}`)

// 5. Toggling own notify prefs is allowed
r = await req(
  alice.idToken,
  'PATCH',
  `/users/${alice.localId}/watchlist/${MOVIE}?updateMask.fieldPaths=notify`,
  { fields: { notify: { mapValue: { fields: { digital: { booleanValue: false }, rentBuy: { booleanValue: true }, free: { booleanValue: true } } } } } },
)
check('user can change their own notify toggles', r.ok, r.ok ? '' : await r.text())

// 6. Forging `notified` is denied — this is the checker's field
r = await req(
  alice.idToken,
  'PATCH',
  `/users/${alice.localId}/watchlist/${MOVIE}?updateMask.fieldPaths=notified`,
  { fields: { notified: { mapValue: { fields: { digital: { timestampValue: '2026-01-01T00:00:00Z' }, rentBuy: { nullValue: null }, free: { nullValue: null } } } } } },
)
check('user CANNOT forge the `notified` send-guard', r.status === 403, `got HTTP ${r.status}`)

// 7. Forging `status` is denied
r = await req(
  alice.idToken,
  'PATCH',
  `/users/${alice.localId}/watchlist/${MOVIE}?updateMask.fieldPaths=status`,
  { fields: { status: { mapValue: { fields: { kind: { stringValue: 'streaming' }, service: { stringValue: 'Fake' } } } } } },
)
check('user CANNOT forge the `status` badge', r.status === 403, `got HTTP ${r.status}`)

// 8. movies/{id} is read-only to clients
r = await req(alice.idToken, 'PATCH', `/movies/${MOVIE}`, { fields: { title: { stringValue: 'hacked' } } })
check('client CANNOT write the global movies snapshot', r.status === 403, `got HTTP ${r.status}`)

// 9. movies/{id} is publicly readable (missing doc = 404, not 403)
r = await req(alice.idToken, 'GET', `/movies/${MOVIE}`)
check('client CAN read the global movies snapshot', r.status === 404 || r.ok, `got HTTP ${r.status}`)

// The alert history is checker-written; a client must never be able to invent
// an update, and must never see anyone else's.
r = await req(alice.idToken, 'PATCH', `/users/${alice.localId}/events/fake1`, {
  fields: { headline: { stringValue: 'Free money' }, movieId: { integerValue: '1' } },
})
check('client CANNOT fabricate an update event', r.status === 403, `got HTTP ${r.status}`)

r = await req(bob.idToken, 'GET', `/users/${alice.localId}/events/anything`)
check('another user CANNOT read your updates', r.status === 403, `got HTTP ${r.status}`)

// 10. Own delete (also cleans up)
r = await req(alice.idToken, 'DELETE', `/users/${alice.localId}/watchlist/${MOVIE}`)
check('user can remove their own watchlist entry', r.ok)

// Clean up the two throwaway anonymous accounts
for (const u of [alice, bob]) {
  await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken: u.idToken }),
  })
}

const failed = results.filter((r) => !r.pass)
console.log(`\n${results.length - failed.length}/${results.length} passed`)
process.exit(failed.length ? 1 : 0)
