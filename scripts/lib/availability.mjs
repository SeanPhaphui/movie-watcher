// Pure US-availability classification used by the checker.
// Mirrors src/lib/availability.ts — keep the two in sync if the rules change.

export const NOTIFY_TYPES = ['digital', 'rentBuy', 'free']

/**
 * True if any watcher of this movie could still receive an alert. Films the
 * user has marked watched are done — no alert could be useful, and dropping
 * them here also removes them from the checker's working set.
 */
export const hasPendingWatcher = (watchers) =>
  watchers.some(
    (w) => !w.watchedAt && NOTIFY_TYPES.some((t) => w.notify?.[t] && !w.notified?.[t]),
  )

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
  const digitalDatePassed = digitalDates.length > 0 && digitalDates[0] <= today

  const onSubscription =
    providers.flatrate.length > 0 || providers.free.length > 0 || providers.ads.length > 0

  // Storefronts list films for PRE-ORDER while they are still theatrical-only.
  // Spider-Man: Brand New Day showed up under `buy` on Fandango nine days after
  // its theatrical release, with no digital release date at all — treating that
  // as availability fires "you can watch this now" for a film you cannot.
  //
  // You can never rent a film that has not been released, so a rental listing
  // is trustworthy on its own. A purchase listing is only trustworthy once a
  // digital release date has actually passed.
  const purchasable = providers.rent.length > 0 || (providers.buy.length > 0 && digitalDatePassed)

  return {
    providers,
    digitalReleased: onSubscription || purchasable || digitalDatePassed,
    rentBuy: purchasable,
    freeWithSub: onSubscription,
  }
}

/** Every provider that carries the title on a subscription/free/ad-supported tier. */
export const subscriptionProviders = (state) => [
  ...state.providers.flatrate,
  ...state.providers.free,
  ...state.providers.ads,
]

/**
 * Which subscription provider to name for this user. Prefers one they actually
 * subscribe to; `mine` says whether we found such a match. An empty `services`
 * list means "hasn't told us" — we fall back to naming the best provider
 * overall rather than silently telling them nothing.
 */
export function pickSubscription(state, services = []) {
  const subs = subscriptionProviders(state)
  if (!subs.length) return null
  const owned = services.length ? subs.find((p) => services.includes(p.id)) : null
  return { provider: owned ?? subs[0], mine: Boolean(owned) }
}

/**
 * Can this user watch it without paying anything extra?
 *
 * Free and ad-supported tiers count for everyone: Tubi or Pluto costs nothing,
 * so gating those behind "did you tick this service" would silently withhold
 * an alert for something the user can watch right now. Only paid subscriptions
 * are matched against what they actually pay for.
 *
 * An empty `services` list means "hasn't told us" and falls back to any service.
 */
export const isOnMyServices = (state, services = []) => {
  if (state.providers.free.length > 0 || state.providers.ads.length > 0) return true
  return services.length
    ? state.providers.flatrate.some((p) => services.includes(p.id))
    : state.freeWithSub
}

/**
 * Compact badge status denormalized onto each watchlist doc, so the client
 * renders badges from its existing realtime listener instead of doing one
 * extra Firestore read per tracked movie on every page view.
 * Returns null when the movie has no digital presence yet — the client falls
 * back to in-theaters/coming-soon using the release date it already holds.
 */
export function deriveStatus(state, services = []) {
  const first = (lists) => lists.flat().find(Boolean)?.name ?? null
  if (state.freeWithSub) {
    const pick = pickSubscription(state, services)
    return { kind: 'streaming', service: pick?.provider.name ?? null, mine: pick?.mine ?? false }
  }
  if (state.rentBuy)
    return { kind: 'rentBuy', service: first([state.providers.rent, state.providers.buy]), mine: false }
  if (state.digitalReleased) return { kind: 'digital', service: null, mine: false }
  return null
}

export const sameStatus = (a, b) =>
  (a?.kind ?? null) === (b?.kind ?? null) &&
  (a?.service ?? null) === (b?.service ?? null) &&
  Boolean(a?.mine) === Boolean(b?.mine)

export function composeMessage(type, title, state, services = []) {
  const first = (lists) => lists.flat().find(Boolean)?.name

  if (type === 'free') {
    const pick = pickSubscription(state, services)
    if (!pick) return { title: `${title} is streaming now`, body: 'Included on a streaming service now.' }
    return {
      title: `${title} is streaming now`,
      body: pick.mine
        ? `It's on your ${pick.provider.name} — watch it tonight.`
        : `Watch it on ${pick.provider.name} — included with a subscription.`,
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
