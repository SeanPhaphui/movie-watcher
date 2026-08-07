import { useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/tmdb'
import { useApp } from '../context/AppContext'
import { NotificationToggles } from '../components/NotificationToggles'
import { AdSlot } from '../components/AdSlot'
import type { WatchlistEntry } from '../types/models'

interface Badge {
  tone: 'gold' | 'green' | 'blue' | 'dim'
  text: string
}

// Reads only from the watchlist doc the realtime listener already delivers —
// the checker denormalizes `status` onto it, so badges cost zero extra reads.
function badgeFor(entry: WatchlistEntry): Badge {
  const status = entry.status
  if (status?.kind === 'streaming')
    return { tone: 'green', text: status.service ? `Streaming on ${status.service}` : 'Streaming now' }
  if (status?.kind === 'rentBuy')
    return { tone: 'blue', text: status.service ? `Rent or buy on ${status.service}` : 'Available to rent or buy' }
  if (status?.kind === 'digital') return { tone: 'green', text: 'Digital release out' }

  const today = new Date().toISOString().slice(0, 10)
  if (entry.releaseDate && entry.releaseDate > today) return { tone: 'dim', text: 'Coming soon' }
  return { tone: 'gold', text: 'In theaters' }
}

function WatchRow({ entry }: { entry: WatchlistEntry }) {
  const { untrack } = useApp()
  const [expanded, setExpanded] = useState(false)
  const badge = badgeFor(entry)
  const poster = imageUrl(entry.posterPath, 'w154')

  return (
    <div>
      <div className="watch-row">
        <Link to={`/movie/${entry.movieId}`} className="thumb">
          {poster && <img src={poster} alt="" loading="lazy" />}
        </Link>
        <div className="watch-body">
          <Link to={`/movie/${entry.movieId}`} className="watch-title">
            {entry.title}
          </Link>
          <div>
            <span className={`badge ${badge.tone}`}>{badge.text}</span>
          </div>
          <div className="watch-actions">
            <button onClick={() => setExpanded((e) => !e)}>
              {expanded ? 'Hide alerts' : 'Alerts'}
            </button>
            <button className="danger" onClick={() => untrack(entry.movieId)}>
              Remove
            </button>
          </div>
        </div>
      </div>
      {expanded && <NotificationToggles entry={entry} />}
    </div>
  )
}

export function Watchlist() {
  const { watchlist, ready } = useApp()
  const entries = [...watchlist.values()].sort(
    (a, b) => (b.addedAt?.toMillis() ?? 0) - (a.addedAt?.toMillis() ?? 0),
  )

  return (
    <div className="page">
      <h1 className="page-title">My Movies</h1>
      {!ready && <div className="spinner" />}
      {ready && entries.length === 0 && (
        <div className="empty-state">
          <div className="big">Nothing tracked yet</div>
          Tap the bookmark on any movie and we&rsquo;ll watch for its streaming release.
        </div>
      )}
      {entries.map((e) => (
        <WatchRow key={e.movieId} entry={e} />
      ))}
      {entries.length > 0 && <AdSlot slot="watchlist" />}
    </div>
  )
}
