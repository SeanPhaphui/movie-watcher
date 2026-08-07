import { useEffect, useState } from 'react'
import { searchMovies } from '../lib/tmdb'
import { useTmdbQuery } from '../hooks/useTmdbQuery'
import { MovieGrid } from '../components/MovieCard'
import { SearchIcon } from '../components/Icons'

export function Search() {
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQuery(input.trim()), 350)
    return () => clearTimeout(t)
  }, [input])

  const { data, loading } = useTmdbQuery(query ? `search:${query}` : null, () =>
    searchMovies(query),
  )

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
      {data && data.results.length > 0 && <MovieGrid movies={data.results} />}
      {data && data.results.length === 0 && (
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
