import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { isCompanyEmail } from '../../shared/domain';
import {
  auth,
  completeRedirectSignIn,
  configError,
  describeError,
  signInWithMicrosoft,
  signOutUser,
  usingEmulators,
} from '../services/firebase';
import { recordSignIn, subscribeUser } from '../services/users';
import type { AppUser, Language, Role } from '../types';

/**
 * misconfigured: build is missing Firebase config
 * loading:       resolving Firebase session / allowlist entry
 * signedOut:     no Microsoft session
 * unauthorized:  Microsoft session, but not an active approved user
 * ready:         approved user; app usable
 */
export type AuthState = 'misconfigured' | 'loading' | 'signedOut' | 'unauthorized' | 'ready';

export type UnauthorizedReason = 'not_listed' | 'inactive' | 'wrong_domain' | 'no_email' | 'error';

/** Approved user merged with the Firebase Auth uid of the current session. */
export type SessionUser = AppUser & { uid: string };

interface AuthContextType {
  authState: AuthState;
  currentUser: SessionUser | null;
  role: Role;
  /** Email of the Microsoft session (shown on the not-authorized screen). */
  sessionEmail: string | null;
  unauthorizedReason: UnauthorizedReason | null;
  language: Language;
  setLanguage: (lang: Language) => void;
  usingEmulators: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  signingIn: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() =>
    localStorage.getItem('klm_lang') === 'es' ? 'es' : 'en',
  );
  const [authState, setAuthState] = useState<AuthState>(configError ? 'misconfigured' : 'loading');
  const [currentUser, setCurrentUser] = useState<SessionUser | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [unauthorizedReason, setUnauthorizedReason] = useState<UnauthorizedReason | null>(null);
  const [signingIn, setSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const recordedUid = useRef<string | null>(null);
  const languageRef = useRef(language);
  languageRef.current = language;

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('klm_lang', lang);
  };

  useEffect(() => {
    if (configError) return;

    completeRedirectSignIn().catch((err) => setAuthError(describeError(err, languageRef.current)));

    let unsubscribeUser: (() => void) | null = null;

    const unauthorized = (reason: UnauthorizedReason) => {
      setCurrentUser(null);
      setUnauthorizedReason(reason);
      setAuthState('unauthorized');
    };

    const unsubscribeAuth = onAuthStateChanged(auth(), (fbUser) => {
      unsubscribeUser?.();
      unsubscribeUser = null;

      if (!fbUser) {
        setCurrentUser(null);
        setSessionEmail(null);
        setUnauthorizedReason(null);
        recordedUid.current = null;
        setAuthState('signedOut');
        return;
      }

      const email = fbUser.email?.toLowerCase() ?? null;
      setSessionEmail(email);
      if (!email) return unauthorized('no_email');
      if (!isCompanyEmail(email)) return unauthorized('wrong_domain');

      setAuthState('loading');
      // Live: deactivation or role changes take effect immediately.
      unsubscribeUser = subscribeUser(
        email,
        (appUser) => {
          if (!appUser) return unauthorized('not_listed');
          if (!appUser.active) return unauthorized('inactive');

          setCurrentUser({ ...appUser, uid: fbUser.uid });
          setUnauthorizedReason(null);
          setAuthState('ready');

          if (recordedUid.current !== fbUser.uid) {
            recordedUid.current = fbUser.uid;
            recordSignIn(email, fbUser.uid).catch((err) => console.warn('Could not record sign-in', err));
          }
        },
        (err) => {
          console.error('Allowlist lookup failed', err);
          unauthorized((err as { code?: string }).code === 'permission-denied' ? 'not_listed' : 'error');
        },
      );
    });

    return () => {
      unsubscribeUser?.();
      unsubscribeAuth();
    };
  }, []);

  const signIn = useCallback(async () => {
    setAuthError(null);
    setSigningIn(true);
    try {
      await signInWithMicrosoft();
    } catch (err) {
      setAuthError(describeError(err, languageRef.current));
    } finally {
      setSigningIn(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await signOutUser();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        authState,
        currentUser,
        role: currentUser?.role ?? 'staff',
        sessionEmail,
        unauthorizedReason,
        language,
        setLanguage,
        usingEmulators,
        signIn,
        signOut,
        signingIn,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
