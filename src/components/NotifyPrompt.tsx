import { useState } from 'react'
import { enableNotifications, getPushStatus, type PushStatus } from '../lib/messaging'
import { useApp } from '../context/AppContext'
import { BellIcon } from './Icons'

const DISMISSED_KEY = 'marquee.notifyPrompt.dismissed'

const isDismissed = () => {
  try {
    return localStorage.getItem(DISMISSED_KEY) === '1'
  } catch {
    return false
  }
}

/**
 * Shown once a user has actually tracked something — the moment the value of
 * alerts is concrete. Renders nothing when there is nothing useful to offer
 * (already on, unsupported, or previously dismissed), so it never nags.
 */
export function NotifyPrompt({ compact = false }: { compact?: boolean }) {
  const { uid } = useApp()
  const [status, setStatus] = useState<PushStatus>(getPushStatus)
  const [dismissed, setDismissed] = useState(isDismissed)
  const [busy, setBusy] = useState(false)

  // Nothing to ask for: already granted, blocked at the browser level, or the
  // platform has no web push at all.
  if (dismissed || status === 'granted' || status === 'denied' || status === 'unsupported') {
    return null
  }

  function dismiss() {
    try {
      localStorage.setItem(DISMISSED_KEY, '1')
    } catch {
      /* storage blocked — it reappears next launch, which is acceptable */
    }
    setDismissed(true)
  }

  async function enable() {
    if (!uid || busy) return
    setBusy(true)
    try {
      setStatus(await enableNotifications(uid))
    } finally {
      setBusy(false)
    }
  }

  // iOS only exposes web push to installed PWAs, so a button here would fail.
  if (status === 'needs-install') {
    return (
      <div className={`notify-prompt${compact ? ' compact' : ''}`}>
        <span className="notify-prompt-icon">
          <BellIcon size={18} />
        </span>
        <div className="notify-prompt-body">
          <h3>Get alerts on your iPhone</h3>
          <p>
            Tap <strong>Share</strong> → <strong>Add to Home Screen</strong>, then open Marquee
            from your home screen to turn on notifications.
          </p>
        </div>
        <button className="notify-prompt-x" onClick={dismiss} aria-label="Dismiss">
          ×
        </button>
      </div>
    )
  }

  return (
    <div className={`notify-prompt${compact ? ' compact' : ''}`}>
      <span className="notify-prompt-icon">
        <BellIcon size={18} />
      </span>
      <div className="notify-prompt-body">
        <h3>Want to know the moment it lands?</h3>
        <p>Turn on alerts and we&rsquo;ll tell you when this hits streaming — even with the app closed.</p>
        <button className="btn btn-gold btn-sm" onClick={enable} disabled={busy}>
          {busy ? 'Enabling…' : 'Turn on alerts'}
        </button>
      </div>
      <button className="notify-prompt-x" onClick={dismiss} aria-label="Dismiss">
        ×
      </button>
    </div>
  )
}
