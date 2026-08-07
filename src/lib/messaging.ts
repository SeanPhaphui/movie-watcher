import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { app, db } from './firebase'

export type PushStatus = 'granted' | 'denied' | 'default' | 'unsupported' | 'needs-install'

const onIos = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as unknown as { standalone?: boolean }).standalone === true

export function getPushStatus(): PushStatus {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) {
    // iOS Safari exposes Notification only inside an installed PWA
    return onIos() && !isStandalone() ? 'needs-install' : 'unsupported'
  }
  return Notification.permission as PushStatus
}

async function sha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

async function registerToken(uid: string): Promise<boolean> {
  if (!(await isSupported())) return false
  const registration = await navigator.serviceWorker.ready
  // Passing our own registration stops the SDK from fetching /firebase-messaging-sw.js
  const token = await getToken(getMessaging(app), {
    vapidKey: import.meta.env.VITE_FCM_VAPID_KEY,
    serviceWorkerRegistration: registration,
  })
  if (!token) return false
  await setDoc(
    doc(db, 'users', uid, 'fcmTokens', await sha1(token)),
    {
      token,
      userAgent: navigator.userAgent.slice(0, 200),
      createdAt: serverTimestamp(),
      lastSeenAt: serverTimestamp(),
    },
    { merge: true },
  )
  return true
}

/** Must be called from a user gesture (iOS requirement). */
export async function enableNotifications(uid: string): Promise<PushStatus> {
  const status = getPushStatus()
  if (status === 'unsupported' || status === 'needs-install') return status
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission as PushStatus
  await registerToken(uid)
  return 'granted'
}

/** Tokens rotate — refresh on every launch once permission is granted. */
export async function refreshTokenIfGranted(uid: string): Promise<void> {
  if (getPushStatus() !== 'granted') return
  try {
    await registerToken(uid)
  } catch (err) {
    console.warn('FCM token refresh failed', err)
  }
}
