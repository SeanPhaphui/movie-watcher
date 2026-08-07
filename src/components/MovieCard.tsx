import { Link } from 'react-router-dom'
import { imageUrl, type MovieSummary } from '../lib/tmdb'
import { useApp } from '../context/AppContext'
import { BookmarkIcon } from './Icons'

export function MovieCard({ movie }: { movie: MovieSummary }) {
  const { isTracked, track, untrack } = useApp()
  const tracked = isTracked(movie.id)
  const poster = imageUrl(movie.poster_path)
  const year = movie.release_date?.slice(0, 4)

  return (
    <div className="movie-card">
      <Link to={`/movie/${movie.id}`}>
        <div className="poster-frame">
          {poster ? (
            <img src={poster} alt={movie.title} loading="lazy" />
          ) : (
            <div className="poster-fallback">{movie.title}</div>
          )}
        </div>
        <div className="movie-card-title">{movie.title}</div>
        {year && <div className="movie-card-year">{year}</div>}
      </Link>
      <button
        className={`track-btn${tracked ? ' on' : ''}`}
        aria-label={tracked ? 'Untrack movie' : 'Track movie'}
        onClick={() => (tracked ? untrack(movie.id) : track(movie))}
      >
        <BookmarkIcon size={17} filled={tracked} />
      </button>
    </div>
  )
}

export function MovieGrid({ movies }: { movies: MovieSummary[] }) {
  return (
    <div className="movie-grid">
      {movies.map((m) => (
        <MovieCard key={m.id} movie={m} />
      ))}
    </div>
  )
}
