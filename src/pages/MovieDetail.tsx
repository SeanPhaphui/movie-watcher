import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { getMovieDetail, imageUrl, pickTrailer } from '../lib/tmdb'
import { Rating } from '../components/Rating'
import { Trailer } from '../components/Trailer'
import { useTmdbQuery } from '../hooks/useTmdbQuery'
import { classifyUsAvailability, formatDate, isDigitallyAvailable } from '../lib/availability'
import { useApp } from '../context/AppContext'
import { ProviderList } from '../components/ProviderList'
import { NotificationToggles } from '../components/NotificationToggles'
import { NotifyPrompt } from '../components/NotifyPrompt'
import { AdSlot } from '../components/AdSlot'
import { BookmarkIcon } from '../components/Icons'

function BackButton() {
  const navigate = useNavigate()
  const location = useLocation()

  // Arriving from a notification tap or a shared link means there is no history
  // entry to pop — React Router marks that first entry with key 'default'.
  // Without this the button would look broken exactly when it matters most,
  // since an installed PWA has no browser chrome to fall back on.
  const canGoBack = location.key !== 'default'

  return (
    <button
      className="back-btn"
      aria-label="Back"
      onClick={() => (canGoBack ? navigate(-1) : navigate('/'))}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
    </button>
  )
}

export function MovieDetail() {
  const { id } = useParams()
  const movieId = Number(id)
  const { watchlist, isTracked, track, untrack } = useApp()

  const { data: movie, loading, error } = useTmdbQuery(
    Number.isFinite(movieId) ? `movie:${movieId}` : null,
    () => getMovieDetail(movieId),
  )

  if (loading)
    return (
      <div className="page">
        <BackButton />
        <div className="spinner" />
      </div>
    )
  if (error || !movie)
    return (
      <div className="page">
        <BackButton />
        <div className="empty-state">
          <div className="big">Couldn&rsquo;t load this movie</div>
          {error}
        </div>
      </div>
    )

  const availability = classifyUsAvailability(movie)
  const trailer = pickTrailer(movie.videos?.results)
  const digital = isDigitallyAvailable(availability)
  const tracked = isTracked(movie.id)
  const entry = watchlist.get(movie.id)
  const backdrop = imageUrl(movie.backdrop_path, 'w780')
  const poster = imageUrl(movie.poster_path)
  const year = movie.release_date?.slice(0, 4)

  return (
    <div className="page">
      <BackButton />
      {backdrop && (
        <div className="backdrop">
          <img src={backdrop} alt="" />
        </div>
      )}

      <div className="detail-head">
        {poster && (
          <div className="detail-poster">
            <img src={poster} alt={movie.title} />
          </div>
        )}
        <h1 className="detail-title">{movie.title}</h1>
      </div>

      <div className="detail-meta-row">
        <div className="detail-meta">
          {[year, movie.runtime ? `${movie.runtime} min` : null, movie.genres?.map((g) => g.name).slice(0, 3).join(' · ')]
            .filter(Boolean)
            .join('  ·  ')}
        </div>
        <Rating score={movie.vote_average} votes={movie.vote_count} />
      </div>

      <div className="date-strip">
        <div className="date-chip">
          <div className="k">In theaters</div>
          <div className="v gold">{formatDate(availability.theatricalDate) ?? '—'}</div>
        </div>
        <div className="date-chip">
          <div className="k">Streaming / digital</div>
          <div className={`v${digital ? ' green' : ''}`}>
            {digital
              ? 'Available now'
              : (formatDate(availability.digitalDate) ?? 'TBA — track it')}
          </div>
        </div>
      </div>

      {movie.overview && <p className="overview">{movie.overview}</p>}

      {trailer && <Trailer video={trailer} />}

      <ProviderList availability={availability} />

      <div style={{ marginTop: 22 }}>
        <button
          className={`btn ${tracked ? 'btn-ghost' : 'btn-gold'}`}
          onClick={() => (tracked ? untrack(movie.id) : track(movie))}
        >
          <BookmarkIcon size={17} filled={tracked} />
          {tracked ? 'Tracking — tap to remove' : 'Track this movie'}
        </button>
        {tracked && entry && (
          <>
            <NotifyPrompt compact />
            <div className="section-label">Notify me</div>
            <NotificationToggles entry={entry} />
          </>
        )}
      </div>

      <AdSlot slot="movie-detail" />
    </div>
  )
}
