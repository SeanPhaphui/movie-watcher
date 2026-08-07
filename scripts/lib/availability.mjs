// Pure US-availability classification used by the checker.
// Mirrors src/lib/availability.ts — keep the two in sync if the rules change.

export const NOTIFY_TYPES = ['digital', 'rentBuy', 'free']

/** True if any watcher of this movie could still receive an alert. */
export const hasPendingWatcher = (watchers) =>
  watchers.some((w) => NOTIFY_TYPES.some((t) => w.notify?.[t] && !w.notified?.[t]))

/**
 * Whether a movie needs a TMDB fetch this run. Movies nobody can be notified
 * about are re-checked only every `staleDays`, which is what keeps cost flat as
 * watchlists grow. Erring toward `true` costs an API call; erring toward
 * `false` silently drops a notification — so unknowns always return true.
 */
export function shouldCheck(watchers, lastCheckedMs, nowMs, staleDays = 14) {
  if (hasPendingWatcher(watchers)) return true
  if (!lastCheckedMs) return true
  return (nowMs - lastCheckedMs) / 86_400_000 >= staleDays
}

const toInfo = (p) => ({ id: p.provider_id, name: p.provider_name, logoPath: p.logo_path ?? null })

// Resold add-ons ("HBO Max Amazon Channel") and live-TV bundles carry the title
// but aren't the service a viewer thinks of as its home. TMDB's own
// display_priority actively prefers them — it ranks the Amazon reseller of HBO
// Max at 11 and HBO Max itself at 152 — so we rank direct services first and
// only use display_priority to break ties within a tier.
const RESOLD = /\bchannel\b/i
const LIVE_TV = /^(youtube tv|fubotv|sling tv|directv(\s|$)|philo|hulu with live tv|spectrum on demand)/i

const tier = (p) => (RESOLD.test(p.provider_name) ? 2 : LIVE_TV.test(p.provider_name) ? 1 : 0)

export function dedupe(lists) {
  const seen = new Map()
  for (const list of lists)
    for (const p of list ?? []) if (!seen.has(p.provider_id)) seen.set(p.provider_id, p)
  return [...seen.values()]
    .sort((a, b) => tier(a) - tier(b) || (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map(toInfo)
}

/** @param today ISO yyyy-mm-dd; injectable so tests are deterministic. */
export function computeState(movie, today = new Date().toISOString().slice(0, 10)) {
  const us = movie['watch/providers']?.results?.US ?? {}
  const providers = {
    flatrate: dedupe([us.flatrate]),
    free: dedupe([us.free]),
    ads: dedupe([us.ads]),
    rent: dedupe([us.rent]),
    buy: dedupe([us.buy]),
  }
  const usDates = (movie.release_dates?.results ?? []).find((r) => r.iso_3166_1 === 'US')
  const digitalDates = (usDates?.release_dates ?? [])
    .filter((d) => d.type === 4)
    .map((d) => d.release_date.slice(0, 10))
    .sort()
  const anyProvider = Object.values(providers).some((l) => l.length > 0)

  return {
    providers,
    digitalReleased: anyProvider || (digitalDates.length > 0 && digitalDates[0] <= today),
    rentBuy: providers.rent.length > 0 || providers.buy.length > 0,
    freeWithSub:
      providers.flatrate.length > 0 || providers.free.length > 0 || providers.ads.length > 0,
  }
}

/**
 * Compact badge status denormalized onto each watchlist doc, so the client
 * renders badges from its existing realtime listener instead of doing one
 * extra Firestore read per tracked movie on every page view.
 * Returns null when the movie has no digital presence yet — the client falls
 * back to in-theaters/coming-soon using the release date it already holds.
 */
export function deriveStatus(state) {
  const first = (lists) => lists.flat().find(Boolean)?.name ?? null
  if (state.freeWithSub) {
    return { kind: 'streaming', service: first([state.providers.flatrate, state.providers.free, state.providers.ads]) }
  }
  if (state.rentBuy) return { kind: 'rentBuy', service: first([state.providers.rent, state.providers.buy]) }
  if (state.digitalReleased) return { kind: 'digital', service: null }
  return null
}

export const sameStatus = (a, b) =>
  (a?.kind ?? null) === (b?.kind ?? null) && (a?.service ?? null) === (b?.service ?? null)

export function composeMessage(type, title, state) {
  const first = (lists) => lists.flat().find(Boolean)?.name

  if (type === 'free') {
    const svc = first([state.providers.flatrate, state.providers.free, state.providers.ads])
    return {
      title: `${title} is streaming now`,
      body: svc
        ? `Watch it on ${svc} — included with your subscription.`
        : 'Included on a streaming service now.',
    }
  }

  if (type === 'rentBuy') {
    const svc = first([state.providers.rent, state.providers.buy])
    return {
      title: `${title} is available to buy or rent`,
      body: svc ? `Rent or buy it on ${svc}.` : 'You can buy or rent it digitally now.',
    }
  }

  const svc = first([
    state.providers.flatrate,
    state.providers.free,
    state.providers.ads,
    state.providers.rent,
    state.providers.buy,
  ])
  return {
    title: `${title} left theaters for streaming`,
    body: svc ? `Now available digitally — first spotted on ${svc}.` : 'Its digital release is out now.',
  }
}
