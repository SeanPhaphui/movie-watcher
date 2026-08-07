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
  /** True when `service` is one the user told us they subscribe to. */
  mine?: boolean
} | null

export interface WatchlistEntry {
  movieId: number
  title: string
  posterPath: string | null
  releaseDate: string | null
  addedAt: Timestamp | null
  /** Set once the user has seen it; excludes the film from all future alerts. */
  watchedAt?: Timestamp | null
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

/**
 * One delivered alert, written by the checker to `users/{uid}/events`.
 * Push is fire-and-forget; this is the durable record so a notification missed
 * on a lock screen is still discoverable in the app.
 */
export interface UpdateEvent {
  movieId: number
  title: string
  posterPath: string | null
  type: NotifyType
  headline: string
  body: string
  createdAt: Timestamp | null
  readAt?: Timestamp | null
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
