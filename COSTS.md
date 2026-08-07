# Cost model

Researched August 2026. Every figure is sourced; assumptions and unverifiable numbers are
marked as such. The short version: **infrastructure is not the problem — data licensing is.**

## Modelling assumptions

| Variable | Value | Note |
| --- | --- | --- |
| Movies tracked per user | 15 | |
| App opens per user per day | 3 | |
| Distinct movies across all users | ~2,000 | Grows sublinearly — everyone tracks the same recent releases |
| Checker runs | 4× daily | `.github/workflows/check-availability.yml` |
| Share of tracked movies still "pending" | ~20% | The rest are settled and skipped by `shouldCheck` |

## What is free at any scale

- **Firebase Cloud Messaging** — no per-message charge at any volume. Only operational
  quotas apply (600K quota tokens/minute, 1,000 concurrent topic fanouts), which this app
  comes nowhere near. [Source](https://firebase.google.com/pricing)
- **Anonymous Authentication** — plain Firebase Auth has no MAU charge on either plan.
  (Only if you later upgrade to Identity Platform does a 50K-MAU free band apply — and even
  then, enabling automatic clean-up excludes anonymous users from billing entirely.)
  [Source](https://cloud.google.com/identity-platform/pricing)
- **TMDB images** — served from `image.tmdb.org`, so poster bandwidth never touches your
  hosting bill.
- **GitHub Actions on a public repo** — standard runners are free and do not consume quota.
  On a private repo you get 2,000 min/month, then $0.006/min. This app's checker runs about
  1 minute per invocation (~120 min/month), so it fits either way.
  [Source](https://docs.github.com/en/billing/reference/actions-minute-multipliers)

## The binding constraint: Firestore reads

Reads per day ≈ `4 × U × 15` (checker scans every watchlist doc) + `4 × 2,000` (snapshot
lookup) + `U × 15 × 3` (client listener), where `U` = users.

The free tier is **50,000 reads/day**, which lands at roughly **400 users**. Past that you're on
Blaze, where `us-central1` charges **$0.03 per 100K reads**.

| Users | Reads/day | Firestore cost/month |
| --- | --- | --- |
| 400 | 50,000 | $0 (free tier) |
| 1,000 | 113,000 | ~$0.60 |
| 5,000 | 533,000 | ~$4 |
| 25,000 | 2.6M | ~$23 |
| 100,000 | 10.5M | ~$94 |

Writes are negligible — `shouldCheck` keeps the checker off settled movies, and `status`
only rewrites on an actual transition. Hosting egress is a rounding error (~$1.50 per 10,000
new users).

**These numbers double in `nam5`.** That is the most expensive decision in this project and it
is irreversible after database creation — see the README setup step.

The client-side term is largely eliminated by the IndexedDB cache now enabled in
[src/lib/firebase.ts](src/lib/firebase.ts); repeat app opens resolve from disk and pull only
deltas. At 100,000 users that's roughly $94 → $54/month.

If reads ever do become the bottleneck, the next lever is dropping the checker from 4 runs a
day to 1. Streaming releases are daily events, not hourly, and it cuts the dominant term by 75%.

## What monetization actually costs

Turning on ads means you need a data provider whose terms permit commercial use.

| Provider | Commercial floor | Notes |
| --- | --- | --- |
| **TMDB** (current) | **Unpublished** | No public pricing anywhere. Negotiated per customer via sales@themoviedb.org. The widely-repeated "$149/month" is community speculation that TMDB has never confirmed. |
| **[Streaming Availability API](https://www.movieofthenight.com/about/api/pricing)** | **$0–$99/mo** | Free 1K req/mo · Starter $49/25K · Growth $99/100K · Scale $299/1M. [Terms](https://github.com/movieofthenight/streaming-availability-api/blob/main/TERMS.md) state plainly: *"The API User can use the data provided for commercial purposes."* |
| **[Watchmode](https://api.watchmode.com/)** | **$349/mo** | Free tier is explicitly non-commercial. Startup $349/40K · Business $599/100K. |

### The architectural catch

Right now the browser calls TMDB directly, and TMDB doesn't meter you. **A paid API does.**
At 5,000 users, client-side calls would run ~2.25M requests/month — past even the $299 tier.

So monetizing forces a change: cache movie data in Firestore and serve the client from there,
letting only the checker touch the paid API (~48K requests/month, comfortably inside Growth).
Firestore reads cost $0.0003 per thousand against roughly $0.99 per thousand for API calls —
about 3,000× cheaper. At that point caching isn't an optimization, it's the whole design.

### Break-even

Ad revenue at **$3 RPM** — an *unverified* planning assumption; Google publishes no niche
benchmarks and third-party figures for entertainment range $2–$5, skewing low on mobile.
Model on **ad impressions, not sessions**: a PWA has few page transitions per visit, so
session-based estimates overstate revenue badly. At ~40 impressions/user/month that's roughly
**$0.12 per user per month**.

| Users | Est. ad revenue | Data + infra cost | Net |
| --- | --- | --- | --- |
| 500 | ~$60 | ~$49 | break-even |
| 1,000 | ~$120 | ~$50 | ~$70 |
| 5,000 | ~$600 | ~$104 | ~$500 |

**Below roughly 500 users, ads do not cover the license they require.** That is the real
argument for staying non-commercial during the PoC — not caution, just arithmetic.

Note: AdSense publishes **no minimum traffic or pageview threshold** for approval. The bar is
qualitative — "high-quality, original" content that "attracts an audience".
[Source](https://support.google.com/adsense/answer/9724)

## Operational risk, not a cost

GitHub **disables scheduled workflows on public repos after 60 days with no repository
activity**. Your notifications would stop silently. Either commit periodically or trigger the
workflow manually from the Actions tab to keep it alive.
[Source](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows)
