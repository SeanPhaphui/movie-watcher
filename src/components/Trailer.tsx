import { useState } from 'react'
import type { VideoEntry } from '../lib/tmdb'

/**
 * Click-to-play: shows YouTube's poster frame and only mounts the iframe on
 * demand, so the detail page never pays for an embed nobody watches.
 */
export function Trailer({ video }: { video: VideoEntry }) {
  const [playing, setPlaying] = useState(false)

  if (playing) {
    return (
      <div className="trailer">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${video.key}?autoplay=1`}
          title={video.name}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    )
  }

  return (
    <button className="trailer trailer-cover" onClick={() => setPlaying(true)}>
      <img
        src={`https://i.ytimg.com/vi/${video.key}/hqdefault.jpg`}
        alt=""
        loading="lazy"
      />
      <span className="trailer-play" aria-hidden="true">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
          <path d="M8 5.5v13l11-6.5z" />
        </svg>
      </span>
      <span className="trailer-label">Play trailer</span>
    </button>
  )
}
