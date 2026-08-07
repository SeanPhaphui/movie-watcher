import { useEffect, useRef, useState } from 'react'
import { BellIcon, BookmarkIcon, SearchIcon } from './Icons'

// Versioned: bump the suffix to re-show the intro after a real feature change.
const SEEN_KEY = 'marquee.intro.v1'
const SHOW_EVENT = 'marquee:show-intro'

/** Re-open the intro from anywhere (Settings uses this). */
export const showIntro = () => window.dispatchEvent(new Event(SHOW_EVENT))

const FEATURES = [
  {
    Icon: SearchIcon,
    title: 'Find where anything streams',
    body: 'Search any film and see which US services carry it — subscription, free with ads, or rent and buy.',
  },
  {
    Icon: BookmarkIcon,
    title: 'Track what’s still in theaters',
    body: 'Bookmark films that haven’t reached streaming yet. Marquee watches them for you.',
  },
  {
    Icon: BellIcon,
    title: 'Get told the moment it lands',
    body: 'Three alerts you control per film: when it hits streaming, when it’s rentable, and when it’s included free with a subscription.',
  },
]

/** Marquee bulb strip — the app-icon motif, reused as a header rule. */
function BulbRule() {
  return (
    <div className="bulb-rule" aria-hidden="true">
      {Array.from({ length: 11 }, (_, i) => (
        <span key={i} style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  )
}

export function IntroSheet() {
  const [open, setOpen] = useState(() => {
    try {
      return !localStorage.getItem(SEEN_KEY)
    } catch {
      return false // private mode / storage blocked — never trap the user
    }
  })
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onShow = () => setOpen(true)
    window.addEventListener(SHOW_EVENT, onShow)
    return () => window.removeEventListener(SHOW_EVENT, onShow)
  }, [])

  useEffect(() => {
    if (!open) return
    panelRef.current?.focus()
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && dismiss()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function dismiss() {
    try {
      localStorage.setItem(SEEN_KEY, new Date().toISOString())
    } catch {
      /* storage blocked — it just shows again next launch */
    }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div className="intro-backdrop" onClick={dismiss}>
      <div
        className="intro-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <BulbRule />

        <p className="intro-kicker">Now showing</p>
        <h2 className="intro-title" id="intro-title">
          Never miss a film&rsquo;s <em>streaming</em> debut
        </h2>

        <ul className="intro-features">
          {FEATURES.map(({ Icon, title, body }, i) => (
            <li key={title} style={{ animationDelay: `${0.1 + i * 0.09}s` }}>
              <span className="intro-feature-icon">
                <Icon size={19} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{body}</p>
              </div>
            </li>
          ))}
        </ul>

        <button className="btn btn-gold" onClick={dismiss}>
          Start browsing
        </button>
        <p className="intro-foot">
          To get notifications on iPhone, add Marquee to your home screen first — Settings has
          the details.
        </p>
      </div>
    </div>
  )
}
