import { imageUrl } from '../lib/tmdb'
import { useApp } from '../context/AppContext'
import type { ProviderInfo } from '../types/models'
import type { UsAvailability } from '../lib/availability'

function ProviderGroup({
  label,
  providers,
  markMine = false,
}: {
  label: string
  providers: ProviderInfo[]
  markMine?: boolean
}) {
  const { services } = useApp()
  if (!providers.length) return null

  // Services the user has come first — that's the answer they're looking for.
  const ordered = markMine
    ? [...providers].sort(
        (a, b) => Number(services.includes(b.id)) - Number(services.includes(a.id)),
      )
    : providers

  return (
    <div className="provider-group">
      <div className="section-label">{label}</div>
      <div className="provider-row">
        {ordered.map((p) => {
          const mine = markMine && services.includes(p.id)
          return (
            <div key={p.id} className={`provider-pill${mine ? ' mine' : ''}`}>
              {p.logoPath && <img src={imageUrl(p.logoPath, 'w92') ?? ''} alt="" />}
              {p.name}
              {mine && <span className="mine-tag">Yours</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ProviderList({ availability }: { availability: UsAvailability }) {
  const { streaming, freeAds, rentBuy, link } = availability
  const none = !streaming.length && !freeAds.length && !rentBuy.length

  return (
    <div>
      {none ? (
        <div className="provider-group">
          <div className="section-label">Where to watch</div>
          <div className="no-providers">
            Not on any US streaming service yet — track it and we&rsquo;ll tell you the moment
            that changes.
          </div>
        </div>
      ) : (
        <>
          <ProviderGroup label="Stream" providers={streaming} markMine />
          <ProviderGroup label="Free / with ads" providers={freeAds} markMine />
          <ProviderGroup label="Rent or buy" providers={rentBuy} />
          {link && (
            <a className="watch-link" href={link} target="_blank" rel="noopener noreferrer">
              Open watch options ↗
            </a>
          )}
        </>
      )}
      <div className="justwatch">Streaming data by JustWatch, via TMDB</div>
    </div>
  )
}
