import { useState } from 'react'
import { enableNotifications, getPushStatus, type PushStatus } from '../lib/messaging'
import { useApp } from '../context/AppContext'
import { BellIcon } from '../components/Icons'

export function Settings() {
  const { uid } = useApp()
  const [status, setStatus] = useState<PushStatus>(getPushStatus())
  const [busy, setBusy] = useState(false)

  async function onEnable() {
    if (!uid || busy) return
    setBusy(true)
    try {
      setStatus(await enableNotifications(uid))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="page">
      <h1 className="page-title">Settings</h1>

      <div className="settings-card">
        <h3>
          <BellIcon size={17} /> Notifications
        </h3>
        {status === 'granted' && (
          <p>
            Push notifications are <strong>on</strong>. You&rsquo;ll hear from us when a tracked
            movie hits streaming, becomes rentable, or lands on a service you can watch free.
          </p>
        )}
        {status === 'default' && (
          <>
            <p>
              Turn on push notifications to find out the moment a tracked movie is streamable —
              even when the app is closed.
            </p>
            <button className="btn btn-gold" onClick={onEnable} disabled={busy}>
              {busy ? 'Enabling…' : 'Enable notifications'}
            </button>
          </>
        )}
        {status === 'denied' && (
          <p>
            Notifications are blocked for this site. Enable them in your browser&rsquo;s site
            settings, then come back here.
          </p>
        )}
        {status === 'needs-install' && (
          <p>
            On iPhone and iPad, notifications only work once the app is installed: tap
            <strong> Share</strong> → <strong>Add to Home Screen</strong>, then open Marquee from
            your home screen and enable notifications here. Requires iOS 16.4 or later.
          </p>
        )}
        {status === 'unsupported' && (
          <p>This browser doesn&rsquo;t support web push notifications.</p>
        )}
      </div>

      <div className="settings-card">
        <h3>Region</h3>
        <p>Streaming availability is shown for the United States.</p>
      </div>

      <div className="notice">
        Your watchlist lives in this browser&rsquo;s anonymous account. Clearing site data (or
        deleting the app) erases it — account sync is on the roadmap.
      </div>

      <div className="settings-card">
        <h3>About</h3>
        <p>
          Movie data from TMDB. Streaming availability by JustWatch, via TMDB. This product uses
          the TMDB API but is not endorsed or certified by TMDB.
        </p>
      </div>
    </div>
  )
}
