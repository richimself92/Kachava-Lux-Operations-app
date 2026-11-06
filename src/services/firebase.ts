import { initializeApp, type FirebaseApp } from 'firebase/app';
import {
  connectAuthEmulator,
  getAuth,
  getRedirectResult,
  OAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type Auth,
} from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const env = import.meta.env;

export const usingEmulators = env.VITE_USE_EMULATORS === 'true';

const config = {
  apiKey: env.VITE_FIREBASE_API_KEY || (usingEmulators ? 'demo-api-key' : ''),
  authDomain:
    env.VITE_FIREBASE_AUTH_DOMAIN ||
    (usingEmulators && env.VITE_FIREBASE_PROJECT_ID ? `${env.VITE_FIREBASE_PROJECT_ID}.firebaseapp.com` : ''),
  projectId: env.VITE_FIREBASE_PROJECT_ID || '',
  storageBucket:
    env.VITE_FIREBASE_STORAGE_BUCKET ||
    (usingEmulators && env.VITE_FIREBASE_PROJECT_ID ? `${env.VITE_FIREBASE_PROJECT_ID}.appspot.com` : ''),
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: env.VITE_FIREBASE_APP_ID || '',
};

const msTenantId: string = env.VITE_MS_TENANT_ID || '';

function findMissingConfig(): string[] {
  const required: Record<string, string> = usingEmulators
    ? { VITE_FIREBASE_PROJECT_ID: config.projectId }
    : {
        VITE_FIREBASE_API_KEY: config.apiKey,
        VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
        VITE_FIREBASE_PROJECT_ID: config.projectId,
        VITE_FIREBASE_STORAGE_BUCKET: config.storageBucket,
        VITE_FIREBASE_APP_ID: config.appId,
        VITE_MS_TENANT_ID: msTenantId,
      };
  return Object.entries(required)
    .filter(([, v]) => !v)
    .map(([k]) => k);
}

const missing = findMissingConfig();

/** Non-null when the build is missing required configuration. The app renders an error screen instead of running. */
export const configError: string | null = missing.length
  ? `Missing Firebase configuration: ${missing.join(', ')}. See .env.example.`
  : null;

let app: FirebaseApp | null = null;
let authInstance: Auth | null = null;
let dbInstance: Firestore | null = null;
let storageInstance: FirebaseStorage | null = null;

if (configError) {
  console.error(configError);
} else {
  app = initializeApp(config);
  authInstance = getAuth(app);
  dbInstance = initializeFirestore(app, { ignoreUndefinedProperties: true });
  storageInstance = getStorage(app);

  if (usingEmulators) {
    connectAuthEmulator(authInstance, 'http://127.0.0.1:9098', { disableWarnings: true });
    connectFirestoreEmulator(dbInstance, '127.0.0.1', 8085);
    connectStorageEmulator(storageInstance, '127.0.0.1', 9198);
    console.warn('Using local Firebase emulators.');
  }
}

function required<T>(value: T | null, name: string): T {
  if (!value) throw new Error(`Firebase ${name} is not initialized: ${configError ?? 'unknown error'}`);
  return value;
}

export const auth = (): Auth => required(authInstance, 'Auth');
export const db = (): Firestore => required(dbInstance, 'Firestore');
export const storage = (): FirebaseStorage => required(storageInstance, 'Storage');

function microsoftProvider(): OAuthProvider {
  const provider = new OAuthProvider('microsoft.com');
  provider.setCustomParameters({
    prompt: 'select_account',
    // Restricts the Microsoft login page to the Kachava Lux tenant. The real guarantee is the
    // single-tenant app registration plus the email-domain checks in the security rules.
    ...(msTenantId ? { tenant: msTenantId } : {}),
  });
  return provider;
}

const POPUP_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
]);

/** Microsoft sign-in: popup first, falling back to a full-page redirect where popups are blocked (iOS). */
export async function signInWithMicrosoft(): Promise<void> {
  const a = auth();
  try {
    await signInWithPopup(a, microsoftProvider());
  } catch (err) {
    const code = (err as { code?: string })?.code ?? '';
    if (POPUP_FALLBACK_CODES.has(code)) {
      await signInWithRedirect(a, microsoftProvider());
      return;
    }
    throw err;
  }
}

/** Surfaces errors from a completed redirect sign-in (no-op otherwise). */
export async function completeRedirectSignIn(): Promise<void> {
  await getRedirectResult(auth());
}

export async function signOutUser(): Promise<void> {
  await fbSignOut(auth());
}

/** Maps Firebase errors to a short user-facing message. */
export function describeError(err: unknown, language: 'en' | 'es'): string {
  const code = (err as { code?: string })?.code ?? '';
  const es = language === 'es';
  switch (code) {
    case 'permission-denied':
    case 'storage/unauthorized':
      return es ? 'No tiene permiso para realizar esta acción.' : 'You do not have permission to perform this action.';
    case 'unavailable':
      return es ? 'Sin conexión con el servidor. Intente de nuevo.' : 'Cannot reach the server. Please try again.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return es ? 'Inicio de sesión cancelado.' : 'Sign-in was cancelled.';
    case 'auth/account-exists-with-different-credential':
    case 'auth/user-disabled':
      return es ? 'Esta cuenta no puede iniciar sesión.' : 'This account cannot sign in.';
    default:
      return (err as Error)?.message || (es ? 'Ocurrió un error.' : 'Something went wrong.');
  }
}
