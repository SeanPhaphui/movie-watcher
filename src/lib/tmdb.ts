const API = 'https://api.themoviedb.org/3'
const TOKEN = import.meta.env.VITE_TMDB_TOKEN as string | undefined

export interface MovieSummary {
  id: number
  title: string
  poster_path: string | null
  backdrop_path: string | null
  release_date: string
  overview: string
  vote_average: number
}

export interface ReleaseDatesResult {
  results: Array<{
    iso_3166_1: string
    release_dates: Array<{ type: number; release_date: string; note: string }>
  }>
}

export interface WatchProviderEntry {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority: number
}

export interface WatchProvidersResult {
  results: Record<
    string,
    {
      link?: string
      flatrate?: WatchProviderEntry[]
      free?: WatchProviderEntry[]
      ads?: WatchProviderEntry[]
      rent?: WatchProviderEntry[]
      buy?: WatchProviderEntry[]
    }
  >
}

export interface VideoEntry {
  key: string
  site: string
  type: string
  name: string
  official: boolean
  published_at: string
}

export interface MovieDetail extends MovieSummary {
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  vote_count: number
  release_dates: ReleaseDatesResult
  'watch/providers': WatchProvidersResult
  videos: { results: VideoEntry[] }
}

/** Best YouTube trailer: official trailers first, then teasers, newest wins. */
export function pickTrailer(videos: VideoEntry[] | undefined): VideoEntry | null {
  const rank = (v: VideoEntry) =>
    (v.type === 'Trailer' ? 0 : v.type === 'Teaser' ? 1 : 2) + (v.official ? 0 : 0.5)
  const usable = (videos ?? []).filter((v) => v.site === 'YouTube' && v.key)
  if (!usable.length) return null
  return [...usable].sort(
    (a, b) => rank(a) - rank(b) || (b.published_at ?? '').localeCompare(a.published_at ?? ''),
  )[0]
}

export interface Paged<T> {
  page: number
  results: T[]
  total_pages: number
}

async function tmdbFetch<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  if (!TOKEN) throw new Error('Missing VITE_TMDB_TOKEN — copy .env.example to .env.local')
  const url = new URL(API + path)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`TMDB ${res.status} on ${path}`)
  return res.json() as Promise<T>
}

const daysAgo = (n: number) =>
  new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

/**
 * What's actually in US theaters. `/movie/now_playing` returns ~275 titles
 * because TMDB counts every micro and festival release — past page 4 they have
 * zero votes and nobody has heard of them. Discover with a vote floor cuts that
 * to the couple of dozen films really on screens.
 */
export const getNowPlaying = (page = 1) =>
  tmdbFetch<Paged<MovieSummary>>('/discover/movie', {
    region: 'US',
    with_release_type: '3|2', // theatrical + limited
    'release_date.gte': daysAgo(45),
    'release_date.lte': daysAgo(0),
    'vote_count.gte': '25',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: String(page),
  })

export const getUpcoming = (page = 1) =>
  tmdbFetch<Paged<MovieSummary>>('/movie/upcoming', { region: 'US', page: String(page) })

export const searchMovies = (query: string, page = 1) =>
  tmdbFetch<Paged<MovieSummary>>('/search/movie', {
    query,
    region: 'US',
    include_adult: 'false',
    page: String(page),
  })

export const getMovieDetail = (id: number) =>
  tmdbFetch<MovieDetail>(`/movie/${id}`, {
    append_to_response: 'release_dates,watch/providers,videos',
  })

export interface ProviderCatalogEntry {
  provider_id: number
  provider_name: string
  logo_path: string | null
  display_priority: number
}

/** Full catalogue of US providers, for the "services I have" picker. */
export const getProviderCatalog = () =>
  tmdbFetch<{ results: ProviderCatalogEntry[] }>('/watch/providers/movie', {
    watch_region: 'US',
  })

export const imageUrl = (path: string | null, size = 'w342') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null
