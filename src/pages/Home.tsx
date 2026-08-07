import { useState } from 'react'
import { getNowPlaying, getUpcoming } from '../lib/tmdb'
import { usePagedTmdb, useInfiniteScroll } from '../hooks/usePagedTmdb'
import { MovieGrid } from '../components/MovieCard'
import { AdSlot } from '../components/AdSlot'

type Tab = 'theaters' | 'upcoming'

export function Home() {
  const [tab, setTab] = useState<Tab>('theaters')
  const { items, loading, loadingMore, error, hasMore, loadMore } = usePagedTmdb(tab, (page) =>
    tab === 'theaters' ? getNowPlaying(page) : getUpcoming(page),
  )
  const sentinel = useInfiniteScroll(loadMore, hasMore && !loading && !loadingMore)

  return (
    <div className="page">
      <div className="tabs">
        <button
          className={`tab${tab === 'theaters' ? ' active' : ''}`}
          onClick={() => setTab('theaters')}
        >
          In Theaters
        </button>
        <button
          className={`tab${tab === 'upcoming' ? ' active' : ''}`}
          onClick={() => setTab('upcoming')}
        >
          Coming Soon
        </button>
      </div>

      {loading && <div className="spinner" />}
      {error && !items.length && (
        <div className="empty-state">
          <div className="big">Couldn&rsquo;t load movies</div>
          {error}
        </div>
      )}

      {items.length > 0 && (
        <>
          <MovieGrid movies={items} />
          <div ref={sentinel} />
          {loadingMore && <div className="spinner" />}
          {!hasMore && <p className="list-end">That&rsquo;s everything.</p>}
        </>
      )}

      <AdSlot slot="home-feed" />
    </div>
  )
}
