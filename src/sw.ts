/// <reference lib="webworker" />
// Single service worker: Workbox app-shell caching + FCM background push.
declare let self: ServiceWorkerGlobalScope

import { clientsClaim } from 'workbox-core'
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { initializeApp } from 'firebase/app'
import { getMessaging, onBackgroundMessage } from 'firebase/messaging/sw'

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
clientsClaim()

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')))

// Never cache ad requests
registerRoute(
  ({ url }) => url.hostname.includes('googlesyndication') || url.hostname.includes('doubleclick'),
  new NetworkOnly(),
)

// TMDB API: fresh-ish data, instant repeat views
registerRoute(
  ({ url }) => url.hostname === 'api.themoviedb.org',
  new StaleWhileRevalidate({
    cacheName: 'tmdb-api',
    plugins: [new ExpirationPlugin({ maxEntries: 120, maxAgeSeconds: 60 * 60 })],
  }),
)

// TMDB posters/backdrops/logos
registerRoute(
  ({ url }) => url.hostname === 'image.tmdb.org',
  new CacheFirst({
    cacheName: 'tmdb-images',
    plugins: [new ExpirationPlugin({ maxEntries: 300, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
)

// ── FCM background messages ──
// The checker sends data-only payloads; we build the notification here.
try {
  const app = initializeApp({
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
  })

  onBackgroundMessage(getMessaging(app), (payload) => {
    const { title, body, movieId } = payload.data ?? {}
    self.registration.showNotification(title ?? 'Marquee', {
      body: body ?? '',
      icon: '/icons/pwa-192.png',
      badge: '/icons/pwa-192.png',
      tag: `movie-${movieId ?? 'general'}`,
      data: { movieId },
    })
  })
} catch (err) {
  // Missing/invalid Firebase config must not break the app-shell SW
  console.warn('FCM unavailable in SW', err)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const movieId = (event.notification.data as { movieId?: string } | undefined)?.movieId
  const target = movieId ? `/movie/${movieId}` : '/my-movies'
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = wins[0]
      if (existing) {
        await existing.focus()
        existing.navigate?.(target)
      } else {
        await self.clients.openWindow(target)
      }
    })(),
  )
})
