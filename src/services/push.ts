import { deleteDoc, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { db, firebaseApp, usingEmulators } from './firebase';

/** Web Push certificate key pair (Firebase console > Cloud Messaging). Public value. */
const VAPID_KEY: string = import.meta.env.VITE_FIREBASE_VAPID_KEY || '';
const SW_URL = '/firebase-messaging-sw.js';
const STORAGE_KEY = 'klm_push_token';

export type PushSupport = 'ok' | 'ios-needs-install' | 'unsupported' | 'denied';

interface EnvLike {
  userAgent: string;
  maxTouchPoints: number;
  standalone: boolean;
  hasPush: boolean;
  permission: NotificationPermission | null;
  configured: boolean;
}

export function isIos(env: Pick<EnvLike, 'userAgent' | 'maxTouchPoints'>): boolean {
  // iPadOS reports itself as a Mac; touch points tell them apart.
  return /iPhone|iPad|iPod/.test(env.userAgent) || (/Macintosh/.test(env.userAgent) && env.maxTouchPoints > 1);
}

/** Pure decision used by pushSupport(); exported for tests. */
export function decidePushSupport(env: EnvLike): PushSupport {
  if (!env.configured) return 'unsupported';
  // iOS only exposes Web Push to apps added to the Home Screen (iOS 16.4+).
  if (isIos(env) && !env.standalone) return 'ios-needs-install';
  if (!env.hasPush) return 'unsupported';
  if (env.permission === 'denied') return 'denied';
  return 'ok';
}

function currentEnv(): EnvLike {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches || nav.standalone === true,
    hasPush: 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window,
    permission: 'Notification' in window ? Notification.permission : null,
    configured: Boolean(VAPID_KEY) && !usingEmulators,
  };
}

export function pushSupport(): PushSupport {
  return decidePushSupport(currentEnv());
}

/** True when this device already granted permission and registered a token. */
export function pushEnabled(): boolean {
  try {
    return pushSupport() === 'ok' && Notification.permission === 'granted' && Boolean(localStorage.getItem(STORAGE_KEY));
  } catch {
    return false;
  }
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function platformName(): string {
  const ua = navigator.userAgent;
  if (isIos({ userAgent: ua, maxTouchPoints: navigator.maxTouchPoints ?? 0 })) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

/**
 * Registers this device for new-request notifications. Must be called from a tap/click the first
 * time (browsers only show the permission prompt from a user gesture). Saves the FCM token at
 * users/{email}/pushTokens/{sha256(token)} together with the UI language for the message text.
 */
export async function enablePush(email: string, language: 'es' | 'en'): Promise<boolean> {
  if (pushSupport() !== 'ok' || !(await isSupported())) return false;
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const registration = await navigator.serviceWorker.register(SW_URL);
  await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp()), { vapidKey: VAPID_KEY, serviceWorkerRegistration: registration });
  if (!token) return false;

  const id = await sha256Hex(token);
  const previous = localStorage.getItem(STORAGE_KEY);
  await setDoc(doc(db(), 'users', email.toLowerCase(), 'pushTokens', id), {
    token,
    language,
    platform: platformName(),
    updatedAt: serverTimestamp(),
  });
  // The token rotated: drop the old registration.
  if (previous && previous !== id) {
    await deleteDoc(doc(db(), 'users', email.toLowerCase(), 'pushTokens', previous)).catch(() => undefined);
  }
  localStorage.setItem(STORAGE_KEY, id);
  return true;
}
