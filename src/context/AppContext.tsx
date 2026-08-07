import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { auth, db, firebaseReady } from '../lib/firebase'
import { refreshTokenIfGranted } from '../lib/messaging'
import type { NotifyPrefs, NotifyType, UpdateEvent, WatchlistEntry } from '../types/models'

export type StoredEvent = UpdateEvent & { id: string }

export interface QuietHours {
  enabled: boolean
  start: number
  end: number
}

const DEFAULT_QUIET: QuietHours = { enabled: false, start: 22, end: 8 }

interface TrackableMovie {
  id: number
  title: string
  poster_path: string | null
  release_date?: string
}

interface AppState {
  uid: string | null
  ready: boolean
  watchlist: Map<number, WatchlistEntry>
  /** TMDB provider ids the user says they subscribe to. Empty = not specified. */
  services: number[]
  /** Alert history, newest first. */
  events: StoredEvent[]
  unreadCount: number
  quietHours: QuietHours
  setQuietHours: (q: QuietHours) => Promise<void>
  isTracked: (movieId: number) => boolean
  track: (movie: TrackableMovie) => Promise<void>
  untrack: (movieId: number) => Promise<void>
  setNotify: (movieId: number, type: NotifyType, value: boolean) => Promise<void>
  setWatched: (movieId: number, watched: boolean) => Promise<void>
  toggleService: (providerId: number) => Promise<void>
}

const DEFAULT_PREFS: NotifyPrefs = { digital: true, rentBuy: false, free: true }

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [uid, setUid] = useState<string | null>(null)
  const [ready, setReady] = useState(!firebaseReady)
  const [watchlist, setWatchlist] = useState<Map<number, WatchlistEntry>>(new Map())
  const [services, setServices] = useState<number[]>([])
  const [events, setEvents] = useState<StoredEvent[]>([])
  const [quiet, setQuiet] = useState<QuietHours>(DEFAULT_QUIET)

  useEffect(() => {
    if (!firebaseReady) return
    return onAuthStateChanged(auth, (user) => {
      if (user) {
        setUid(user.uid)
        setReady(true)
        setDoc(
          doc(db, 'users', user.uid),
          {
            lastSeenAt: serverTimestamp(),
            defaults: DEFAULT_PREFS,
            // Refreshed every launch so quiet hours follow the user when they travel.
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
          },
          { merge: true },
        ).catch(() => {})
        refreshTokenIfGranted(user.uid)
      } else {
        signInAnonymously(auth).catch((err) => {
          console.error('anonymous sign-in failed', err)
          setReady(true)
        })
      }
    })
  }, [])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'watchlist'),
      (snap) => {
        const next = new Map<number, WatchlistEntry>()
        snap.forEach((d) => {
          const data = d.data() as WatchlistEntry
          next.set(data.movieId, data)
        })
        setWatchlist(next)
      },
      // Without this the SDK throws an unhandled rejection when Firestore is
      // unreachable or rules reject the read; the app should just show an
      // empty list instead.
      (err) => console.error('watchlist listener failed', err),
    )
  }, [uid])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      query(collection(db, 'users', uid, 'events'), orderBy('createdAt', 'desc'), limit(50)),
      (snap) =>
        setEvents(snap.docs.map((d) => ({ id: d.id, ...(d.data() as UpdateEvent) }))),
      (err) => console.error('events listener failed', err),
    )
  }, [uid])

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        setServices((snap.data()?.services as number[] | undefined) ?? [])
        setQuiet({ ...DEFAULT_QUIET, ...(snap.data()?.quietHours as QuietHours | undefined) })
      },
      (err) => console.error('user prefs listener failed', err),
    )
  }, [uid])

  const value = useMemo<AppState>(
    () => ({
      uid,
      ready,
      watchlist,
      services,
      events,
      unreadCount: events.filter((e) => !e.readAt).length,
      quietHours: quiet,
      setQuietHours: async (q) => {
        if (!uid) return
        await setDoc(doc(db, 'users', uid), { quietHours: q }, { merge: true })
      },
      isTracked: (movieId) => watchlist.has(movieId),
      toggleService: async (providerId) => {
        if (!uid) return
        const next = services.includes(providerId)
          ? services.filter((id) => id !== providerId)
          : [...services, providerId]
        await setDoc(doc(db, 'users', uid), { services: next }, { merge: true })
      },
      track: async (movie) => {
        if (!uid) return
        await setDoc(doc(db, 'users', uid, 'watchlist', String(movie.id)), {
          movieId: movie.id,
          title: movie.title,
          posterPath: movie.poster_path ?? null,
          releaseDate: movie.release_date ?? null,
          addedAt: serverTimestamp(),
          notify: DEFAULT_PREFS,
          notified: { digital: null, rentBuy: null, free: null },
        })
      },
      untrack: async (movieId) => {
        if (!uid) return
        await deleteDoc(doc(db, 'users', uid, 'watchlist', String(movieId)))
      },
      setNotify: async (movieId, type, val) => {
        if (!uid) return
        await updateDoc(doc(db, 'users', uid, 'watchlist', String(movieId)), {
          [`notify.${type}`]: val,
        })
      },
      setWatched: async (movieId, watched) => {
        if (!uid) return
        await updateDoc(doc(db, 'users', uid, 'watchlist', String(movieId)), {
          watchedAt: watched ? serverTimestamp() : null,
        })
      },
    }),
    [uid, ready, watchlist, services, events, quiet],
  )

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
