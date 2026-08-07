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

export interface MovieDetail extends MovieSummary {
  runtime: number | null
  genres: Array<{ id: number; name: string }>
  release_dates: ReleaseDatesResult
  'watch/providers': WatchProvidersResult
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

export const getNowPlaying = (page = 1) =>
  tmdbFetch<Paged<MovieSummary>>('/movie/now_playing', { region: 'US', page: String(page) })

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
    append_to_response: 'release_dates,watch/providers',
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
