import { useMemo, useState } from 'react'
import { getProviderCatalog, imageUrl, type ProviderCatalogEntry } from '../lib/tmdb'
import { useTmdbQuery } from '../hooks/useTmdbQuery'
import { useApp } from '../context/AppContext'

/**
 * The services most US viewers actually subscribe to, in roughly that order.
 *
 * TMDB's own `display_priority` is unusable for this: it puts HBO Max 53rd,
 * behind "Sun Nxt", "DOCSVILLE" and "Shahid VIP".
 *
 * Each entry lists every provider id that means "I have this subscription".
 * That matters for correctness, not just tidiness — TMDB treats "Netflix" and
 * "Netflix Standard with Ads" as different providers, so a viewer who picked
 * only one would silently miss alerts for a film listed under the other.
 */
const FAMILIES: Array<{ name: string; ids: number[] }> = [
  { name: 'Netflix', ids: [8, 1796] },
  { name: 'Prime Video', ids: [9, 2100] },
  { name: 'Disney+', ids: [337] },
  { name: 'Hulu', ids: [15] },
  { name: 'HBO Max', ids: [1899] },
  { name: 'Paramount+', ids: [2616, 2303] },
  { name: 'Peacock', ids: [386, 387] },
  { name: 'Apple TV+', ids: [350] },
  { name: 'Starz', ids: [43] },
  { name: 'Crunchyroll', ids: [283] },
  { name: 'AMC+', ids: [526] },
  { name: 'Tubi', ids: [73] },
  { name: 'Pluto TV', ids: [300] },
  { name: 'Plex', ids: [538] },
  { name: 'MUBI', ids: [11] },
  { name: 'Shudder', ids: [99] },
  { name: 'BritBox', ids: [151] },
  { name: 'Philo', ids: [2383] },
  { name: 'fuboTV', ids: [257] },
  { name: 'Kanopy', ids: [191] },
  { name: 'Hoopla', ids: [212] },
]

const FAMILY_IDS = new Set(FAMILIES.flatMap((f) => f.ids))

// Resold add-ons ("Starz Apple TV Channel") aren't subscriptions people think
// of holding, and storefronts are rent/buy rather than something you subscribe
// to — neither belongs in "what do you pay for".
const RESOLD = /\bchannel\b/i
const STOREFRONT = /^(apple tv store|google play movies|amazon video|fandango at home|youtube|microsoft store|spectrum on demand)/i

function Chip({
  label,
  logoPath,
  on,
  onClick,
}: {
  label: string
  logoPath: string | null
  on: boolean
  onClick: () => void
}) {
  return (
    <button className={`service-chip${on ? ' on' : ''}`} aria-pressed={on} title={label} onClick={onClick}>
      {logoPath ? (
        <img src={imageUrl(logoPath, 'w92') ?? ''} alt="" />
      ) : (
        <span className="service-chip-fallback">{label.slice(0, 2)}</span>
      )}
      <span className="service-chip-name">{label}</span>
    </button>
  )
}

export function ServicePicker() {
  const { services, toggleService } = useApp()
  const [showAll, setShowAll] = useState(false)
  const { data, loading, error } = useTmdbQuery('provider-catalog', getProviderCatalog)

  const catalog = useMemo(() => {
    const byId = new Map<number, ProviderCatalogEntry>()
    for (const p of data?.results ?? []) byId.set(p.provider_id, p)
    return byId
  }, [data])

  // Everything else, for people on something niche.
  const rest = useMemo(() => {
    return (data?.results ?? [])
      .filter(
        (p) =>
          !FAMILY_IDS.has(p.provider_id) &&
          !RESOLD.test(p.provider_name) &&
          !STOREFRONT.test(p.provider_name),
      )
      .sort((a, b) => a.display_priority - b.display_priority)
  }, [data])

  if (loading) return <div className="spinner" />
  if (error) return <p className="t-sub">Couldn&rsquo;t load the provider list — {error}</p>

  const selectedOutsideFamilies = rest.filter((p) => services.includes(p.provider_id))

  return (
    <>
      <div className="service-grid">
        {FAMILIES.map((f) => (
          <Chip
            key={f.name}
            label={f.name}
            logoPath={catalog.get(f.ids[0])?.logo_path ?? null}
            on={f.ids.some((id) => services.includes(id))}
            onClick={() => toggleService(f.ids)}
          />
        ))}
        {/* Anything already picked from the long tail stays visible when collapsed. */}
        {!showAll &&
          selectedOutsideFamilies.map((p) => (
            <Chip
              key={p.provider_id}
              label={p.provider_name}
              logoPath={p.logo_path}
              on
              onClick={() => toggleService([p.provider_id])}
            />
          ))}
      </div>

      {showAll ? (
        <>
          <div className="section-label">Everything else</div>
          <div className="service-grid">
            {rest.map((p) => (
              <Chip
                key={p.provider_id}
                label={p.provider_name}
                logoPath={p.logo_path}
                on={services.includes(p.provider_id)}
                onClick={() => toggleService([p.provider_id])}
              />
            ))}
          </div>
        </>
      ) : (
        <button className="link-btn" onClick={() => setShowAll(true)}>
          Show all services
        </button>
      )}
    </>
  )
}
