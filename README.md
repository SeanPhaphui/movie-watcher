# Marquee — Movie Watcher PWA

Track movies from theater to streaming. Get a push notification the moment a tracked movie:

1. **Leaves theaters for digital** (streaming/digital release)
2. **Becomes available to buy or rent**
3. **Lands "free"** — included with a subscription (Netflix, Max, …) or free with ads

Also shows, for any movie, exactly which US services carry it (data: TMDB + JustWatch).

## Architecture

- **Frontend:** React + Vite + TypeScript PWA (`vite-plugin-pwa`, single service worker in
  `src/sw.ts` combining Workbox caching and FCM background push). Deployed on Firebase Hosting.
- **Data:** TMDB API, client-side (`src/lib/tmdb.ts`).
- **State:** Firebase Anonymous Auth + Firestore (watchlist, notification prefs, FCM tokens).
- **Notification backend:** `.github/workflows/check-availability.yml` runs
  `scripts/check-availability.mjs` 4× daily — checks TMDB for tracked movies and sends FCM
  pushes. No paid Firebase plan needed.
- **Ads:** `AdSlot` renders placeholders until `VITE_ADSENSE_CLIENT` is set. **Read
  [Monetization](#monetization) before setting it** — it is not just an AdSense question.

### Two things that keep cost flat as it grows

Both matter more than they look, because the naive version of each scales linearly with
users × movies × page views:

1. **The checker skips settled movies.** A movie is only fetched from TMDB when some watcher
   could still be notified about it, or when its snapshot is older than 14 days. Once everyone
   tracking a title has been told it's streaming, it drops out of the working set. Without this,
   every movie anyone ever tracked is re-fetched four times a day forever. See `shouldCheck` in
   [scripts/lib/availability.mjs](scripts/lib/availability.mjs).
2. **Badge status is denormalized onto the watchlist doc.** The checker writes a compact
   `status` field, so My Movies renders badges from the realtime listener it already has.
   The obvious alternative — reading `movies/{id}` per row — costs one Firestore read per
   tracked movie on every single page view, which becomes the app's dominant cost.

The `notified` map is the send-guard: each event fires at most once per user per movie, so a
provider flapping or a missed run never double-notifies.

## Setup

```sh
npm install
cp .env.example .env.local   # then fill in the blanks (see below)
npm run dev
```

`.env.local` needs:

| Var | Where to get it |
| --- | --- |
| `VITE_TMDB_TOKEN` | themoviedb.org → Settings → API → **API Read Access Token** (free) |
| `VITE_FIREBASE_*` | Firebase Console → Project settings → Your apps (already filled in) |
| `VITE_FCM_VAPID_KEY` | Firebase Console → Project settings → Cloud Messaging → **Web Push certificates** → Generate key pair |
| `VITE_ADSENSE_CLIENT` | AdSense publisher ID (`ca-pub-…`) — leave empty until approved |

One-time Firebase Console steps (project `marquee-movie-watcher`):

1. **Firestore**: Console → Build → Firestore Database → Create database → **production mode**,
   location **`us-central1` (Iowa)**. Creating it must be done in the console: the CLI/API path
   (`firestore:databases:create`) requires billing to be enabled, while the console works on
   the free Spark plan. Once it exists:

   ```sh
   firebase deploy --only firestore     # pushes rules + indexes
   ```

   > **Pick `us-central1`, not `nam5`.** The location is permanent and cannot be changed after
   > creation, and `nam5` — the multi-region often preselected — costs exactly 2× on every
   > read, write and delete, forever. See [COSTS.md](COSTS.md).
2. **Anonymous auth**: Build → Authentication → Sign-in method → enable **Anonymous**.
3. **VAPID key**: see table above.

## Tests

```sh
npm test          # unit tests for availability classification + checker skip logic
npm run test:rules  # live security-rules test against the real project
```

`test:rules` signs in two throwaway anonymous users and asserts that each can manage only
their own watchlist, cannot read or write another user's, and cannot forge the checker-owned
`notified` and `status` fields. It cleans up the documents and accounts it creates. It runs
against the **live** database, so expect a handful of reads/writes on the quota.

## Deploy

```sh
npm run deploy    # build + firebase deploy (hosting + firestore rules)
```

## Notification checker (GitHub Actions)

Push this repo to GitHub, then add two **repository secrets** (Settings → Secrets and
variables → Actions → *Repository secrets*):

- `TMDB_TOKEN` — same TMDB read token
- `FIREBASE_SERVICE_ACCOUNT` — Firebase Console → Project settings → Service accounts →
  **Generate new private key**; paste the entire JSON as the secret value

> These must be **Secrets**, not **Variables**. Variables are stored unencrypted and are
> never masked in workflow logs — and this repo is public, so a service-account key placed
> there is one careless `${{ vars.* }}` reference away from being published. They must also
> be *repository* secrets, not *environment* secrets, since this workflow declares no
> environment. The `Preflight` step in the workflow fails with a precise message if either
> is missing or malformed.

Setting them from PowerShell? Pipe with a BOM-free encoding — PowerShell 5.1 otherwise
prefixes stdin with a UTF-8 BOM and `JSON.parse` chokes on it:

```powershell
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::ReadAllText("key.json") | gh secret set FIREBASE_SERVICE_ACCOUNT
```

The workflow runs on a schedule and can be fired manually from the Actions tab
(**Check streaming availability → Run workflow**) — useful for end-to-end testing.
Run it locally with `TMDB_TOKEN=... FIREBASE_SERVICE_ACCOUNT=path\to\key.json npm run check`.

### Sending an announcement to everyone

```sh
npm run announce -- "Search just got faster" "Results now load instantly."          # dry run
npm run announce -- "Search just got faster" "Results now load instantly." --send   # deliver
npm run announce -- "Push is working" "You're all set." --uid <your-uid> --send     # your device only
npm run announce -- "3 films hit streaming" "Take a look." --url my-movies --send   # deep-link the tap
```

**Don't put "Marquee" in the title.** iOS adds its own mandatory `from Marquee` attribution
line to every web push, so an app-name title renders as "Marquee / from Marquee" and wastes
the most valuable line. Lead with the news instead — that's why the checker titles alerts
with the film ("Dune: Part Two is streaming now").

It is a **dry run unless you pass `--send`** — it prints the audience size and exits,
because the failure mode is messaging real people with no undo. Dead tokens are pruned
automatically from the send result, and sends are batched at FCM's 500-token limit.

Credentials are picked up from `FIREBASE_SERVICE_ACCOUNT`, or a `FIREBASE_SERVICE_ACCOUNT=`
line in `.env.local`, or `./service-account.json`. That variable has no `VITE_` prefix, so
Vite never exposes it to the browser bundle.

Pass `--url` **without** a leading slash. Git Bash rewrites `/my-movies` into a Windows path,
and the script refuses that rather than shipping a broken link to every device.

To see what the checker has recorded and why a notification did or didn't fire:

```sh
FIREBASE_SERVICE_ACCOUNT=path\to\key.json npm run inspect -- <uid>
```

### Quiet hours

`users/{uid}.timezone` (refreshed every launch, so it follows the user when they travel) plus
`users/{uid}.quietHours` gate delivery. Inside the window the checker **skips the send without
marking `notified`**, so a later run delivers it — deferring must never look like sending, or
the alert is lost forever. With runs every 6 hours, any window under ~18 hours is guaranteed a
delivery slot. See `isQuietNow` in [scripts/lib/quiet-hours.mjs](scripts/lib/quiet-hours.mjs).

### Alert history

Push is fire-and-forget, so the checker also appends every alert to
`users/{uid}/events`. That's the durable record behind the Updates screen — a notification
missed on a lock screen is still findable. Rules let clients read and mark items read but
never create one.

### Per-user services

`users/{uid}.services` holds the TMDB provider ids a user says they subscribe to. The
**"free with subscription" alert is the one event that depends on who is asking** — a film
landing on Max means nothing to someone without Max — so the checker resolves it per watcher
via `isOnMyServices`, and names the service *they* have via `pickSubscription`.

An empty or absent `services` list means "hasn't told us" and falls back to alerting on any
service. That fallback is deliberate: the failure mode of guessing wrong here is silently
never notifying someone, which is worse than an occasional irrelevant alert.

### Provider ranking

TMDB's `display_priority` cannot be used on its own to pick which service to name in a
notification: for *Dune: Part Two* it ranks "HBO Max Amazon Channel" at 11 and actual HBO Max
at 152. `dedupe` in [scripts/lib/availability.mjs](scripts/lib/availability.mjs) therefore
ranks direct services above live-TV bundles above resold add-ons, using `display_priority`
only to break ties within a tier. If a notification ever names a weird reseller, that ranking
is the place to look.

> GitHub disables scheduled workflows after ~60 days without repo activity; an occasional
> commit or manual run keeps it alive.

## Monetization

**Do not set `VITE_ADSENSE_CLIENT` while this app runs on TMDB's free API key.**

TMDB's [API Terms of Use](https://www.themoviedb.org/api-terms-of-use) §2.A lists as an example
of commercial use: *"driving traffic or generating revenue for a website ... (including from
advertising displayed on or by the website)."* Commercial use "is only permitted under a
separate written agreement between You and TMDB." Running AdSense on a free developer key is
therefore a breach, and TMDB reserves the right to terminate API access without notice.

The ad slots exist and reserve their layout so switching monetization on later causes no layout
shift — but switching it on requires **first** doing one of:

- signing a commercial agreement with TMDB, or
- moving the data layer to a provider whose terms permit commercial use.

All TMDB access is confined to [src/lib/tmdb.ts](src/lib/tmdb.ts),
[src/lib/availability.ts](src/lib/availability.ts) and
[scripts/lib/availability.mjs](scripts/lib/availability.mjs), so a provider swap is a contained
change rather than a rewrite.

### Caching rule

TMDB §1.C forbids caching TMDB content for longer than 6 months. This is handled by the
14-day staleness recheck in `shouldCheck` — the checker refreshes `title`, `posterPath` and
`status` on both `movies/{id}` and every watchlist doc, so no stored TMDB content goes more
than two weeks without revalidation. If you change `STALE_DAYS`, keep it well under 180.

## iOS notes

Web push requires iOS 16.4+ **and** the app added to the home screen (Share → Add to Home
Screen). The Settings page detects this and walks users through it.

## Attribution

Movie data from [TMDB](https://www.themoviedb.org/). Streaming availability by
[JustWatch](https://www.justwatch.com/), via TMDB. This product uses the TMDB API but is not
endorsed or certified by TMDB.
