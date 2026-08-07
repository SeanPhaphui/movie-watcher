import { useEffect, useState } from 'react'
import { searchMovies } from '../lib/tmdb'
import { usePagedTmdb, useInfiniteScroll } from '../hooks/usePagedTmdb'
import { MovieGrid } from '../components/MovieCard'
import { SearchIcon } from '../components/Icons'

export function Search() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 350)
    return () => clearTimeout(t)
  }, [input])

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
          autoFocus
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
