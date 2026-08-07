import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/tmdb'
import { useApp } from '../context/AppContext'
import { NotificationToggles } from '../components/NotificationToggles'
import { NotifyPrompt } from '../components/NotifyPrompt'
import { AdSlot } from '../components/AdSlot'
import type { WatchlistEntry } from '../types/models'

interface Badge {
  tone: 'gold' | 'green' | 'blue' | 'dim'
  text: string
  mine?: boolean
}

// Reads only from the watchlist doc the realtime listener already delivers —
// the checker denormalizes `status` onto it, so badges cost zero extra reads.
function badgeFor(entry: WatchlistEntry): Badge {
  const status = entry.status
  if (status?.kind === 'streaming') {
    if (status.mine && status.service)
      return { tone: 'green', text: `On your ${status.service}`, mine: true }
    return { tone: 'green', text: status.service ? `Streaming on ${status.service}` : 'Streaming now' }
  }
  if (status?.kind === 'rentBuy')
    return { tone: 'blue', text: status.service ? `Rent or buy on ${status.service}` : 'Available to rent or buy' }
  if (status?.kind === 'digital') return { tone: 'green', text: 'Digital release out' }

  const today = new Date().toISOString().slice(0, 10)
  if (entry.releaseDate && entry.releaseDate > today) return { tone: 'dim', text: 'Coming soon' }
  return { tone: 'gold', text: 'In theaters' }
}

type Filter = 'all' | 'ready' | 'waiting' | 'watched'
type Sort = 'added' | 'release' | 'title'

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'ready', label: 'Ready to watch' },
  { id: 'waiting', label: 'Waiting' },
  { id: 'watched', label: 'Watched' },
]

const SORTS: Array<{ id: Sort; label: string }> = [
  { id: 'added', label: 'Recently added' },
  { id: 'release', label: 'Release date' },
  { id: 'title', label: 'A–Z' },
]

/** "Ready" means you can actually press play on something you subscribe to. */
const isReady = (e: WatchlistEntry) => e.status?.kind === 'streaming'

function WatchRow({ entry }: { entry: WatchlistEntry }) {
  const { untrack, setWatched } = useApp()
  const [expanded, setExpanded] = useState(false)
  const badge = badgeFor(entry)
  const poster = imageUrl(entry.posterPath, 'w154')
  const watched = Boolean(entry.watchedAt)

  return (
    <div className={watched ? 'watch-item watched' : 'watch-item'}>
      <div className="watch-row">
        <Link to={`/movie/${entry.movieId}`} className="thumb">
          {poster && <img src={poster} alt="" loading="lazy" />}
        </Link>
        <div className="watch-body">
          <Link to={`/movie/${entry.movieId}`} className="watch-title">
            {entry.title}
          </Link>
          <div>
            {watched ? (
              <span className="badge dim">Watched</span>
            ) : (
              <span className={`badge ${badge.tone}${badge.mine ? ' mine-badge' : ''}`}>
                {badge.text}
              </span>
            )}
          </div>
          <div className="watch-actions">
            <button onClick={() => setWatched(entry.movieId, !watched)}>
              {watched ? 'Mark unwatched' : 'Mark watched'}
            </button>
            {!watched && (
              <button onClick={() => setExpanded((e) => !e)}>
                {expanded ? 'Hide alerts' : 'Alerts'}
              </button>
            )}
            <button className="danger" onClick={() => untrack(entry.movieId)}>
              Remove
            </button>
          </div>
        </div>
      </div>
      {expanded && !watched && <NotificationToggles entry={entry} />}
    </div>
  )
}

export function Watchlist() {
  const { watchlist, ready } = useApp()
  const [filter, setFilter] = useState<Filter>('all')
  const [sort, setSort] = useState<Sort>('added')

  const all = useMemo(() => [...watchlist.values()], [watchlist])

  const counts = useMemo(
    () => ({
      all: all.filter((e) => !e.watchedAt).length,
      ready: all.filter((e) => !e.watchedAt && isReady(e)).length,
      waiting: all.filter((e) => !e.watchedAt && !isReady(e)).length,
      watched: all.filter((e) => e.watchedAt).length,
    }),
    [all],
  )

  const entries = useMemo(() => {
    const matches = all.filter((e) => {
      const watched = Boolean(e.watchedAt)
      if (filter === 'watched') return watched
      if (watched) return false // watched films stay out of the active views
      if (filter === 'ready') return isReady(e)
      if (filter === 'waiting') return !isReady(e)
      return true
    })

    return matches.sort((a, b) => {
      if (sort === 'title') return a.title.localeCompare(b.title)
      if (sort === 'release') return (b.releaseDate ?? '').localeCompare(a.releaseDate ?? '')
      return (b.addedAt?.toMillis() ?? 0) - (a.addedAt?.toMillis() ?? 0)
    })
  }, [all, filter, sort])

  return (
    <div className="page">
      <h1 className="page-title">My Movies</h1>
      {!ready && <div className="spinner" />}

      {ready && all.length === 0 && (
        <div className="empty-state">
          <div className="big">Nothing tracked yet</div>
          Tap the bookmark on any movie and we&rsquo;ll watch for its streaming release.
        </div>
      )}

      {all.length > 0 && (
        <>
          <NotifyPrompt />

          <div className="chip-row" role="tablist">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                className={`chip${filter === f.id ? ' on' : ''}`}
                onClick={() => setFilter(f.id)}
              >
                {f.label}
                <span className="chip-count">{counts[f.id]}</span>
              </button>
            ))}
          </div>

          <div className="sort-row">
            <label htmlFor="wl-sort">Sort</label>
            <select id="wl-sort" value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              {SORTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>

          {entries.length === 0 ? (
            <div className="empty-state">
              {filter === 'ready'
                ? 'Nothing you can stream yet — we’ll tell you the moment that changes.'
                : filter === 'watched'
                  ? 'Nothing marked watched yet.'
                  : counts.watched > 0
                    ? 'Everything you’re tracking has been watched. Check the Watched tab.'
                    : 'Nothing here.'}
            </div>
          ) : (
            entries.map((e) => <WatchRow key={e.movieId} entry={e} />)
          )}

          <AdSlot slot="watchlist" />
        </>
      )}
    </div>
  )
}
