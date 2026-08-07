import { imageUrl } from '../lib/tmdb'
import type { ProviderInfo } from '../types/models'
import type { UsAvailability } from '../lib/availability'

function ProviderGroup({ label, providers }: { label: string; providers: ProviderInfo[] }) {
  if (!providers.length) return null
  return (
    <div className="provider-group">
      <div className="section-label">{label}</div>
      <div className="provider-row">
        {providers.map((p) => (
          <div key={p.id} className="provider-pill">
            {p.logoPath && <img src={imageUrl(p.logoPath, 'w92') ?? ''} alt="" />}
            {p.name}
          </div>
        ))}
      </div>
    </div>
  )
}

export function ProviderList({ availability }: { availability: UsAvailability }) {
  const { streaming, freeAds, rentBuy } = availability
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
          <ProviderGroup label="Stream" providers={streaming} />
          <ProviderGroup label="Free / with ads" providers={freeAds} />
          <ProviderGroup label="Rent or buy" providers={rentBuy} />
        </>
      )}
      <div className="justwatch">Streaming data by JustWatch, via TMDB</div>
    </div>
  )
}
