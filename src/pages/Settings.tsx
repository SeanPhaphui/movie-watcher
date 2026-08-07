import { useState } from 'react'
import { enableNotifications, getPushStatus, type PushStatus } from '../lib/messaging'
import { useApp } from '../context/AppContext'
import { BellIcon } from '../components/Icons'
import { showIntro } from '../components/IntroSheet'
import { ServicePicker } from '../components/ServicePicker'

const HOURS = Array.from({ length: 24 }, (_, h) => h)
const hourLabel = (h: number) =>
  h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`

function QuietHoursCard() {
  const { quietHours, setQuietHours } = useApp()

  return (
    <div className="settings-card">
      <h3>Quiet hours</h3>
      <p>
        Hold notifications overnight. Anything that lands during these hours is delivered
        afterwards rather than dropped.
      </p>

      <div className="toggle-card">
        <button
          className="toggle-row"
          role="switch"
          aria-checked={quietHours.enabled}
          onClick={() => setQuietHours({ ...quietHours, enabled: !quietHours.enabled })}
        >
          <span>
            <span className="t-label">Pause overnight</span>
            <div className="t-sub">
              Uses this device&rsquo;s time zone ({Intl.DateTimeFormat().resolvedOptions().timeZone})
            </div>
          </span>
          <span className={`switch${quietHours.enabled ? ' on' : ''}`} />
        </button>
      </div>

      {quietHours.enabled && (
        <div className="sort-row" style={{ marginTop: 12 }}>
          <label htmlFor="q-start">From</label>
          <select
            id="q-start"
            value={quietHours.start}
            onChange={(e) => setQuietHours({ ...quietHours, start: Number(e.target.value) })}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
          <label htmlFor="q-end">to</label>
          <select
            id="q-end"
            value={quietHours.end}
            onChange={(e) => setQuietHours({ ...quietHours, end: Number(e.target.value) })}
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {hourLabel(h)}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  )
}

export function Settings() {
  const { uid, services } = useApp()
  const [status, setStatus] = useState<PushStatus>(getPushStatus)
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

      <QuietHoursCard />

      <div className="settings-card">
        <h3>My services</h3>
        <p>
          Pick what you subscribe to and the &ldquo;free with subscription&rdquo; alert will only
          fire when a tracked film lands somewhere you can actually watch it.
          {services.length === 0 && ' Until you choose, we alert on any service.'}
        </p>
        <ServicePicker />
      </div>

      <div className="settings-card">
        <h3>Region</h3>
        <p>Streaming availability is shown for the United States.</p>
      </div>

      <div className="settings-card">
        <h3>How Marquee works</h3>
        <p>A quick tour of what the app tracks and the alerts you can turn on.</p>
        <button className="btn btn-ghost" onClick={showIntro}>
          Show the intro again
        </button>
      </div>

      <div className="notice">
        Your watchlist lives in this browser&rsquo;s anonymous account, so there&rsquo;s no
        sign-up — but clearing site data erases it, and it won&rsquo;t follow you to another
        device.
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
