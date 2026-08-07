import { useEffect, useRef, useState } from 'react'
import type { VideoEntry } from '../lib/tmdb'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    YT?: any
    onYouTubeIframeAPIReady?: () => void
  }
}

// If the player never reports ready — script blocked, offline, API change —
// show it anyway rather than hiding the trailer forever behind a poster.
const READY_FALLBACK_MS = 4000

let apiPromise: Promise<void> | null = null

/** Loads YouTube's iframe API once per page, whoever asks first. */
function loadYouTubeApi(): Promise<void> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise<void>((resolve) => {
    if (window.YT?.Player) return resolve()
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    document.head.appendChild(script)
  })
  return apiPromise
}

/**
 * YouTube's own play button is the single tap, so the trailer starts with
 * sound — autoplay would be permitted only while muted, and a silent trailer
 * is worse than a tap.
 *
 * The white flash this used to show came from revealing the iframe on its
 * `load` event: that fires when the embed's document loads, while the player
 * itself paints some frames later, so a blank white page was briefly visible
 * on a near-black screen. The iframe API's `onReady` is the signal that the
 * player has actually rendered, so we hold our own poster over it until then
 * and the swap is invisible.
 */
export function Trailer({ video }: { video: VideoEntry }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    let player: any
    let cancelled = false
    const fallback = setTimeout(() => setReady(true), READY_FALLBACK_MS)

    loadYouTubeApi().then(() => {
      if (cancelled || !mountRef.current) return
      player = new window.YT.Player(mountRef.current, {
        videoId: video.key,
        host: 'https://www.youtube-nocookie.com',
        playerVars: { playsinline: 1, rel: 0 },
        events: {
          onReady: () => {
            if (!cancelled) setReady(true)
          },
        },
      })
    })

    return () => {
      cancelled = true
      clearTimeout(fallback)
      player?.destroy?.()
    }
  }, [video.key])

  return (
    <div className="trailer">
      {/* 4:3 source, cropped by object-fit to drop YouTube's letterbox bars. */}
      <img
        className="trailer-poster"
        src={`https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`}
        alt=""
        aria-hidden="true"
      />
      <div className={`trailer-player${ready ? ' ready' : ''}`}>
        <div ref={mountRef} />
      </div>
    </div>
  )
}
