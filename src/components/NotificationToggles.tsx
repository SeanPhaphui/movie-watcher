import { useApp } from '../context/AppContext'
import type { NotifyType, WatchlistEntry } from '../types/models'

const ROWS: Array<{ type: NotifyType; label: string; sub: string }> = [
  { type: 'digital', label: 'Streaming release', sub: 'The moment it leaves theaters for digital' },
  { type: 'rentBuy', label: 'Buy or rent', sub: 'Available to purchase or rent digitally' },
  { type: 'free', label: 'Free with subscription', sub: 'Included on a service or free with ads' },
]

export function NotificationToggles({ entry }: { entry: WatchlistEntry }) {
  const { setNotify } = useApp()
  return (
    <div className="toggle-card">
      {ROWS.map(({ type, label, sub }) => {
        const on = entry.notify?.[type] ?? false
        return (
          <button
            key={type}
            className="toggle-row"
            role="switch"
            aria-checked={on}
            onClick={() => setNotify(entry.movieId, type, !on)}
          >
            <span>
              <span className="t-label">{label}</span>
              <div className="t-sub">{sub}</div>
            </span>
            <span className={`switch${on ? ' on' : ''}`} />
          </button>
        )
      })}
    </div>
  )
}
