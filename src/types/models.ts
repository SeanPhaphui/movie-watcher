import type { Timestamp } from 'firebase/firestore'

export type NotifyType = 'digital' | 'rentBuy' | 'free'

export interface NotifyPrefs {
  digital: boolean
  rentBuy: boolean
  free: boolean
}

export type WatchStatus = {
  kind: 'streaming' | 'rentBuy' | 'digital'
  service: string | null
} | null

export interface WatchlistEntry {
  movieId: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  addedAt: Timestamp | null
  /** Denormalized by the checker so badges cost no extra reads. */
  status?: WatchStatus
  notify: NotifyPrefs
  notified: {
    digital: Timestamp | null
    rentBuy: Timestamp | null
    free: Timestamp | null
  }
}

export interface ProviderInfo {
  id: number
  name: string
  logoPath: string | null
}

/** Global `movies/{id}` snapshot written by the availability checker. */
export interface MovieSnapshot {
  title: string
  posterPath: string | null
  state: {
    digitalReleased: boolean
    rentBuy: boolean
    freeWithSub: boolean
    providers: {
      flatrate: ProviderInfo[]
      free: ProviderInfo[]
      ads: ProviderInfo[]
      rent: ProviderInfo[]
      buy: ProviderInfo[]
    }
  }
  lastCheckedAt: Timestamp | null
}
