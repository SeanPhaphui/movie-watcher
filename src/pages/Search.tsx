import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { searchMovies } from '../lib/tmdb'
import { usePagedTmdb, useInfiniteScroll } from '../hooks/usePagedTmdb'
import { MovieGrid } from '../components/MovieCard'
import { SearchIcon } from '../components/Icons'

const DEBOUNCE_MS = 350

export function Search() {
  // The query lives in the URL, not component state. Opening a movie unmounts
  // this page, so anything held locally is gone on the way back — you'd return
  // to an empty box. In the URL it survives, and because the results cache is
  // keyed on the query, coming back re-renders the same list instantly.
  const [params, setParams] = useSearchParams()
  const query = params.get('q')?.trim() ?? ''

  const [input, setInput] = useState(query)
  const lastSynced = useRef(query)

  // Push typing into the URL, replacing rather than pushing so the back button
  // steps out of search rather than walking back through every keystroke.
  useEffect(() => {
    const t = setTimeout(() => {
      const next = input.trim()
      if (next === lastSynced.current) return
      lastSynced.current = next
      setParams(next ? { q: next } : {}, { replace: true })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [input, setParams])

  // Keep the box in step when the URL changes from navigation rather than
  // typing (back, forward, a shared link).
  useEffect(() => {
    if (query !== lastSynced.current) {
      lastSynced.current = query
      setInput(query)
    }
  }, [query])

  const { items, loading, loadingMore, hasMore, loadMore } = usePagedTmdb(
    query ? `search:${query}` : null,
    (page) => searchMovies(query, page),
  )
  const sentinel = useInfiniteScroll(loadMore, hasMore && !loading && !loadingMore)

  return (
    <div className="page">
      <h1 className="page-title">Find a movie</h1>
      <div className="search-box">
        <SearchIcon size={19} />
        <input
          type="search"
          placeholder="Title, e.g. Dune"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          // Only steal focus on a genuinely fresh search, never when returning
          // to results — the keyboard covering them would be worse than useless.
          autoFocus={!query}
        />
      </div>

      {loading && <div className="spinner" />}
      {items.length > 0 && (
        <>
          <MovieGrid movies={items} />
          <div ref={sentinel} />
          {loadingMore && <div className="spinner" />}
        </>
      )}
      {query && !loading && items.length === 0 && (
        <div className="empty-state">
          <div className="big">No matches</div>
          Try a different title.
        </div>
      )}
      {!query && !loading && (
        <div className="empty-state">
          Search any movie to see where it&rsquo;s streaming — or track it until it is.
        </div>
      )}
    </div>
  )
}
