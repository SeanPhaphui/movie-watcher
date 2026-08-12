import { useApp } from '../context/AppContext'

/**
 * A failed listener used to look exactly like an empty watchlist, so an outage
 * read as "my tracked movies are gone" — and every write silently did nothing,
 * which is why service chips stopped responding. Say so instead, and include
 * the error code so a report is actionable rather than a guess.
 */
export function ConnectionBanner() {
  const { connectionError } = useApp()
  if (!connectionError) return null

  return (
    <div className="conn-banner" role="status">
      <div>
        <strong>Can&rsquo;t reach your data</strong>
        <p>
          {connectionError} Your movies are safe on our side — this device just
          can&rsquo;t load them right now.
        </p>
      </div>
      <button className="btn btn-gold btn-sm" onClick={() => window.location.reload()}>
        Retry
      </button>
    </div>
  )
}
