import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { imageUrl } from '../lib/tmdb'
import { useApp } from '../context/AppContext'

function timeAgo(ms: number): string {
  const mins = Math.round((Date.now() - ms) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days < 30 ? `${days}d ago` : new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function Updates() {
  const { uid, events, ready } = useApp()

  // Opening the page is the read receipt.
  useEffect(() => {
    if (!uid) return
    for (const e of events) {
      if (!e.readAt) {
        updateDoc(doc(db, 'users', uid, 'events', e.id), { readAt: serverTimestamp() }).catch(
          () => {},
        )
      }
    }
  }, [uid, events])

  return (
    <div className="page">
      <h1 className="page-title">Updates</h1>
      {!ready && <div className="spinner" />}

      {ready && events.length === 0 && (
        <div className="empty-state">
          <div className="big">No updates yet</div>
          When a film you track becomes available, it&rsquo;ll show up here — even if you miss
          the notification.
        </div>
      )}

      {events.map((e) => {
        const poster = imageUrl(e.posterPath, 'w154')
        return (
          <Link
            key={e.id}
            to={`/movie/${e.movieId}`}
            className={`update-row${e.readAt ? '' : ' unread'}`}
          >
            <div className="thumb">{poster && <img src={poster} alt="" loading="lazy" />}</div>
            <div className="update-body">
              <div className="update-headline">{e.headline}</div>
              <p>{e.body}</p>
              <div className="update-time">
                {e.createdAt ? timeAgo(e.createdAt.toMillis()) : ''}
              </div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}
