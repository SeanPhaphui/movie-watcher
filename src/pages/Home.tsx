import { useState } from 'react'
import { getNowPlaying, getUpcoming } from '../lib/tmdb'
import { useTmdbQuery } from '../hooks/useTmdbQuery'
import { MovieGrid } from '../components/MovieCard'
import { AdSlot } from '../components/AdSlot'

type Tab = 'theaters' | 'upcoming'

export function Home() {
  const [tab, setTab] = useState<Tab>('theaters')
  const { data, loading, error } = useTmdbQuery(tab, () =>
    tab === 'theaters' ? getNowPlaying() : getUpcoming(),
  )

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
      {error && (
        <div className="empty-state">
          <div className="big">Couldn&rsquo;t load movies</div>
          {error}
        </div>
      )}
      {data && <MovieGrid movies={data.results} />}

      <AdSlot slot="home-feed" />
    </div>
  )
}
