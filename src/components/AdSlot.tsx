import { useEffect, useRef } from 'react'

const CLIENT = import.meta.env.VITE_ADSENSE_CLIENT as string | undefined

declare global {
  interface Window {
    adsbygoogle?: unknown[]
  }
}

let scriptLoaded = false
function loadAdSenseScript() {
  if (scriptLoaded || !CLIENT) return
  scriptLoaded = true
  const s = document.createElement('script')
  s.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${CLIENT}`
  s.async = true
  s.crossOrigin = 'anonymous'
  document.head.appendChild(s)
}

/**
 * Renders a real AdSense unit when VITE_ADSENSE_CLIENT is set, otherwise a
 * fixed-height placeholder (keeps layout stable so enabling ads causes no CLS).
 *
 * Do not set VITE_ADSENSE_CLIENT while the app is served by TMDB's free API.
 * TMDB's API Terms §2.A count ad revenue as commercial use, which requires a
 * separate written agreement with them. See "Monetization" in the README.
 */
export function AdSlot({ slot }: { slot: string }) {
  const pushed = useRef(false)

  useEffect(() => {
    if (!CLIENT || pushed.current) return
    pushed.current = true // StrictMode double-invoke guard
    loadAdSenseScript()
    try {
      ;(window.adsbygoogle = window.adsbygoogle || []).push({})
    } catch {
      /* blocked or not ready — placeholder styling still holds the space */
    }
  }, [])

  if (!CLIENT) {
    // Real users should never see a fake ad box — it reads as an unfinished
    // app. The placeholder stays in dev so the reserved space is visible while
    // designing, and rendering nothing in production is safe because the slot
    // has no surrounding layout depending on its height.
    if (!import.meta.env.DEV) return null
    return (
      <div className="ad-slot">
        <div className="ad-placeholder">Ad</div>
      </div>
    )
  }

  return (
    <div className="ad-slot">
      <ins
        className="adsbygoogle"
        style={{ display: 'block', minHeight: 100 }}
        data-ad-client={CLIENT}
        data-ad-slot={slot}
        data-ad-format="auto"
        data-full-width-responsive="true"
      />
    </div>
  )
}
