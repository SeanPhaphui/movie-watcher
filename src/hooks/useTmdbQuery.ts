import { useEffect, useState } from 'react'

const cache = new Map<string, { at: number; data: unknown }>()
const TTL = 10 * 60 * 1000

interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
}

/** Tiny fetch-with-cache hook. `key` identifies the query; null key = idle. */
export function useTmdbQuery<T>(key: string | null, fetcher: () => Promise<T>): QueryState<T> {
  const [state, setState] = useState<QueryState<T>>(() => {
    const hit = key ? cache.get(key) : undefined
    return hit && Date.now() - hit.at < TTL
      ? { data: hit.data as T, loading: false, error: null }
      : { data: null, loading: key !== null, error: null }
  })

  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null })
      return
    }
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < TTL) {
      setState({ data: hit.data as T, loading: false, error: null })
      return
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true, error: null }))
    fetcher()
      .then((data) => {
        cache.set(key, { at: Date.now(), data })
        if (!cancelled) setState({ data, loading: false, error: null })
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ data: null, loading: false, error: err.message })
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return state
}
