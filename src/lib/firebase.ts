import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore, persistentLocalCache, type Firestore } from 'firebase/firestore'

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const firebaseReady = Boolean(firebaseConfig.apiKey && firebaseConfig.projectId)

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

/**
 * The IndexedDB cache makes repeat opens instant and My Movies work offline.
 * But it is the one piece of this app that can fail for reasons entirely
 * outside our control — iOS evicts storage under pressure, private browsing
 * restricts it, and a wedged database takes every Firestore listener down with
 * it, which surfaces to the user as "all my movies are gone".
 *
 * Losing the cache costs a few reads. Losing Firestore costs the whole app, so
 * fall back to an in-memory cache rather than let persistence be load-bearing.
 * Single-tab manager: the multi-tab variant needs cross-context coordination,
 * which is exactly what breaks when the same PWA is open in Safari and on the
 * home screen at once.
 */
function openFirestore(): Firestore {
  try {
    return initializeFirestore(app, { localCache: persistentLocalCache() })
  } catch (err) {
    console.warn('Firestore persistence unavailable, using memory cache', err)
    return initializeFirestore(app, {})
  }
}

export const db = openFirestore()
