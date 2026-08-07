// US availability classification. The GitHub Actions checker mirrors this logic
// in scripts/check-availability.mjs — keep the two in sync if rules change.
import type { MovieDetail, WatchProviderEntry } from './tmdb'
import type { ProviderInfo } from '../types/models'

export interface UsAvailability {
  theatricalDate: string | null
  digitalDate: string | null
  streaming: ProviderInfo[] // flatrate — included with a subscription
  freeAds: ProviderInfo[] // free or ad-supported
  rentBuy: ProviderInfo[]
  link: string | null
}

const toInfo = (p: WatchProviderEntry): ProviderInfo => ({
  id: p.provider_id,
  name: p.provider_name,
  logoPath: p.logo_path,
})

// Mirrors the ranking in scripts/lib/availability.mjs — see the note there on
// why TMDB's display_priority can't be used on its own.
const RESOLD = /\bchannel\b/i
const LIVE_TV = /^(youtube tv|fubotv|sling tv|directv(\s|$)|philo|hulu with live tv|spectrum on demand)/i

const tier = (p: WatchProviderEntry) =>
  RESOLD.test(p.provider_name) ? 2 : LIVE_TV.test(p.provider_name) ? 1 : 0

function dedupe(lists: WatchProviderEntry[][]): ProviderInfo[] {
  const seen = new Map<number, WatchProviderEntry>()
  for (const list of lists)
    for (const p of list) if (!seen.has(p.provider_id)) seen.set(p.provider_id, p)
  return [...seen.values()]
    .sort((a, b) => tier(a) - tier(b) || (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map(toInfo)
}

export function classifyUsAvailability(detail: MovieDetail): UsAvailability {
  const usDates = detail.release_dates?.results?.find((r) => r.iso_3166_1 === 'US')
  const dateOf = (type: number) => {
    const entries = (usDates?.release_dates ?? []).filter((d) => d.type === type)
    if (!entries.length) return null
    return entries.map((d) => d.release_date).sort()[0].slice(0, 10)
  }

  const us = detail['watch/providers']?.results?.US
  return {
    theatricalDate: dateOf(3) ?? dateOf(2), // theatrical, else limited
    digitalDate: dateOf(4),
    streaming: dedupe([us?.flatrate ?? []]),
    freeAds: dedupe([us?.free ?? [], us?.ads ?? []]),
    rentBuy: dedupe([us?.rent ?? [], us?.buy ?? []]),
    link: us?.link ?? null,
  }
}

export const isDigitallyAvailable = (a: UsAvailability) =>
  a.streaming.length > 0 ||
  a.freeAds.length > 0 ||
  a.rentBuy.length > 0 ||
  (a.digitalDate !== null && a.digitalDate <= new Date().toISOString().slice(0, 10))

export function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso + 'T12:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
