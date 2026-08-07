import { useCallback, useEffect, useRef, useState } from 'react'
import type { Paged } from '../lib/tmdb'

interface PageCacheEntry<T> {
  items: T[]
  page: number
  totalPages: number
  at: number
}

// Module-level so it survives unmount. Without this, going back to a list you
// had scrolled deep into rebuilds it from page 1 — the content collapses to a
// fraction of its height and the restored scroll position lands in emptiness.
const cache = new Map<string, PageCacheEntry<unknown>>()
const TTL = 10 * 60 * 1000

const read = <T,>(key: string | null): PageCacheEntry<T> | undefined => {
  if (!key) return undefined
  const hit = cache.get(key) as PageCacheEntry<T> | undefined
  if (!hit) return undefined
  if (Date.now() - hit.at > TTL) {
    cache.delete(key)
    return undefined
  }
  return hit
}

interface PagedState<T> {
  items: T[]
  loading: boolean
  loadingMore: boolean
  error: string | null
  hasMore: boolean
  loadMore: () => void
}

/**
 * Accumulating pager for TMDB list endpoints. `key` identifies the query and
 * resets everything when it changes; a null key means idle. Results are cached
 * per key for the session so returning to a list restores it whole.
 */
export function usePagedTmdb<T extends { id: number }>(
  key: string | null,
  fetchPage: (page: number) => Promise<Paged<T>>,
): PagedState<T> {
  const cached = read<T>(key)
  const [items, setItems] = useState<T[]>(cached?.items ?? [])
  const [page, setPage] = useState(cached?.page ?? 1)
  const [totalPages, setTotalPages] = useState(cached?.totalPages ?? 1)
  const [loading, setLoading] = useState(Boolean(key) && !cached)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // `page` belongs to whichever key was active when it was set. Tracking that
  // stops a stale page number from firing a request against a new key.
  const owner = useRef(key)
  const runId = useRef(0)

  if (owner.current !== key) {
    owner.current = key
    const next = read<T>(key)
    setItems(next?.items ?? [])
    setPage(next?.page ?? 1)
    setTotalPages(next?.totalPages ?? 1)
    setError(null)
    setLoading(Boolean(key) && !next)
  }

  useEffect(() => {
    if (!key) return
    // Already have this exact page cached; nothing to fetch.
    const hit = read<T>(key)
    if (hit && hit.page >= page) return

    const id = ++runId.current
    if (page > 1) setLoadingMore(true)

    fetchPage(page)
      .then((res) => {
        if (id !== runId.current) return
        setTotalPages(res.total_pages)
        setItems((prev) => {
          // TMDB pages can repeat a title near boundaries; dedupe by id.
          const seen = new Set(prev.map((m) => m.id))
          const merged = page === 1 ? res.results : [...prev, ...res.results.filter((m) => !seen.has(m.id))]
          cache.set(key, { items: merged, page, totalPages: res.total_pages, at: Date.now() })
          return merged
        })
      })
      .catch((err: Error) => {
        if (id === runId.current) setError(err.message)
      })
      .finally(() => {
        if (id !== runId.current) return
        setLoading(false)
        setLoadingMore(false)
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, page])

  const loadMore = useCallback(() => setPage((p) => p + 1), [])

  return { items, loading, loadingMore, error, hasMore: page < totalPages, loadMore }
}

/** Calls `onVisible` when the returned ref scrolls into view. */
export function useInfiniteScroll(onVisible: () => void, enabled: boolean) {
  const ref = useRef<HTMLDivElement | null>(null)
  const cb = useRef(onVisible)
  cb.current = onVisible

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    const io = new IntersectionObserver(
      (entries) => entries[0]?.isIntersecting && cb.current(),
      { rootMargin: '600px' }, // start fetching before the user hits the end
    )
    io.observe(el)
    return () => io.disconnect()
  }, [enabled])

  return ref
}
