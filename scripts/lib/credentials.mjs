// Shared service-account loading for the admin scripts.
//
// Looks at FIREBASE_SERVICE_ACCOUNT (raw JSON or a path), then a
// FIREBASE_SERVICE_ACCOUNT= line in .env.local, then ./service-account.json.
//
// Diagnostics describe the shape of the value, never its contents — these
// messages end up in public CI logs.
import { existsSync, readFileSync } from 'node:fs'

function fromEnvFile() {
  if (!existsSync('.env.local')) return undefined
  const line = readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .find((l) => l.startsWith('FIREBASE_SERVICE_ACCOUNT='))
  const value = line?.slice('FIREBASE_SERVICE_ACCOUNT='.length).trim()
  return value || undefined
}

export function loadServiceAccount() {
  const raw =
    process.env.FIREBASE_SERVICE_ACCOUNT?.trim() ||
    fromEnvFile() ||
    (existsSync('service-account.json') ? 'service-account.json' : undefined)

  if (!raw) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT is not set. In CI, add it as a repository secret ' +
        '(Settings > Secrets and variables > Actions) containing the whole ' +
        'service-account JSON. Locally, set the env var, add a ' +
        'FIREBASE_SERVICE_ACCOUNT=<path> line to .env.local, or drop the key at ' +
        './service-account.json',
    )
  }

  let text = raw
  if (!raw.startsWith('{')) {
    try {
      text = readFileSync(raw, 'utf8')
    } catch {
      throw new Error(
        `FIREBASE_SERVICE_ACCOUNT is set (${raw.length} chars) but is neither JSON ` +
          `(it starts with "${raw[0]}") nor a readable file path. Paste the raw JSON ` +
          'file contents — not base64, not a quoted string.',
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

export function loadTmdbToken() {
  let token = process.env.TMDB_TOKEN?.trim()
  if (!token && existsSync('.env.local')) {
    const line = readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('VITE_TMDB_TOKEN='))
    token = line?.slice('VITE_TMDB_TOKEN='.length).trim()
  }
  if (!token) {
    throw new Error(
      'TMDB_TOKEN is not set. In CI, add it as a repository secret. It must be the ' +
        'v4 "API Read Access Token" (a long JWT), not the short v3 API key.',
    )
  }
  if (!token.startsWith('ey')) {
    throw new Error(
      `TMDB_TOKEN does not look like a v4 read token (${token.length} chars, expected ` +
        'a JWT starting "ey"). The short v3 API key will not work — it is sent as a ' +
        'Bearer token.',
    )
  }
  return token
}
