import { useMemo, useState } from 'react'
import { getProviderCatalog, imageUrl, type ProviderCatalogEntry } from '../lib/tmdb'
import { useTmdbQuery } from '../hooks/useTmdbQuery'
import { useApp } from '../context/AppContext'

// The US catalogue runs to ~200 entries, most of them resold add-ons
// ("Starz Amazon Channel") nobody thinks of as a subscription they hold.
const RESOLD = /\bchannel\b/i
const INITIAL_COUNT = 21

export function ServicePicker() {
  const { services, toggleService } = useApp()
  const [showAll, setShowAll] = useState(false)
  const { data, loading, error } = useTmdbQuery('provider-catalog', getProviderCatalog)

  const providers = useMemo(() => {
    const all = (data?.results ?? [])
      .filter((p) => !RESOLD.test(p.provider_name))
      .sort((a, b) => a.display_priority - b.display_priority)
    // Always keep already-selected services visible, even if they rank low.
    const selected = all.filter((p) => services.includes(p.provider_id))
    const top = all.slice(0, INITIAL_COUNT)
    const merged = [...new Set([...selected, ...top])]
    return showAll ? all : merged
  }, [data, services, showAll])

  if (loading) return <div className="spinner" />
  if (error) return <p className="t-sub">Couldn&rsquo;t load the provider list — {error}</p>

  return (
    <>
      <div className="service-grid">
        {providers.map((p: ProviderCatalogEntry) => {
          const on = services.includes(p.provider_id)
          return (
            <button
              key={p.provider_id}
              className={`service-chip${on ? ' on' : ''}`}
              aria-pressed={on}
              title={p.provider_name}
              onClick={() => toggleService(p.provider_id)}
            >
              {p.logo_path ? (
                <img src={imageUrl(p.logo_path, 'w92') ?? ''} alt="" />
              ) : (
                <span className="service-chip-fallback">{p.provider_name.slice(0, 2)}</span>
              )}
              <span className="service-chip-name">{p.provider_name}</span>
            </button>
          )
        })}
      </div>
      {!showAll && (
        <button className="link-btn" onClick={() => setShowAll(true)}>
          Show all services
        </button>
      )}
    </>
  )
}
