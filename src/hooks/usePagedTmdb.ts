import { useCallback, useEffect, useRef, useState } from 'react'
import type { Paged } from '../lib/tmdb'

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
 * resets everything when it changes; a null key means idle.
 */
export function usePagedTmdb<T extends { id: number }>(
  key: string | null,
  fetchPage: (page: number) => Promise<Paged<T>>,
): PagedState<T> {
  const [items, setItems] = useState<T[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Guards against a stale response from a previous key overwriting results.
  const runId = useRef(0)

  useEffect(() => {
    setItems([])
    setPage(1)
    setTotalPages(1)
    setError(null)
    setLoading(Boolean(key))
  }, [key])

  useEffect(() => {
    if (!key) return
    const id = ++runId.current
    if (page > 1) setLoadingMore(true)

    fetchPage(page)
      .then((res) => {
        if (id !== runId.current) return
        setTotalPages(res.total_pages)
        setItems((prev) => {
          if (page === 1) return res.results
          // TMDB pages can repeat a title near boundaries; dedupe by id.
          const seen = new Set(prev.map((m) => m.id))
          return [...prev, ...res.results.filter((m) => !seen.has(m.id))]
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

  const loadMore = useCallback(() => {
    setPage((p) => p + 1)
  }, [])

  return {
    items,
    loading,
    loadingMore,
    error,
    hasMore: page < totalPages,
    loadMore,
  }
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
