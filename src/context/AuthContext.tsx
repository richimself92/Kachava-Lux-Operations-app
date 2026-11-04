import React, { createContext, useContext, useState, useEffect } from 'react';
import { AppUser, Role, Language } from '../types';
import { INITIAL_USERS } from '../data/initialData';
import { auth, isLiveFirebase } from '../services/firebase';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut as fbSignOut } from 'firebase/auth';

interface AuthContextType {
  currentUser: AppUser | null;
  role: Role;
  language: Language;
  setLanguage: (lang: Language) => void;
  isLiveMode: boolean;
  availableUsers: AppUser[];
  switchDemoUser: (uid: string) => void;
  signIn: (email: string, password: string) => Promise<boolean>;
  signOut: () => Promise<void>;
  loading: boolean;
  authError: string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem('klm_lang');
    return saved === 'es' ? 'es' : 'en';
  });

  const [availableUsers, setAvailableUsers] = useState<AppUser[]>(() => {
    // Always use official roster
    return INITIAL_USERS;
  });

  // Default demo user to Randel Can Chuc (Maintenance Manager)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    const savedUid = localStorage.getItem('klm_current_user_uid_v2');
    if (savedUid) {
      const match = availableUsers.find((u) => u.uid === savedUid);
      if (match) return match;
    }
    // Randel Can Chuc is the proposed supervisor
    return availableUsers.find((u) => u.uid === 'user-randel-can') || availableUsers[0];
  });

  const [loading, setLoading] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('klm_lang', lang);
  };

  useEffect(() => {
    if (isLiveFirebase && auth) {
      const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
        if (fbUser) {
          const userMatch = availableUsers.find((u) => u.email === fbUser.email);
          if (userMatch) {
            setCurrentUser({
              ...userMatch,
              isFirebaseVerified: true,
            });
          } else {
            const newUser: AppUser = {
              uid: fbUser.uid,
              email: fbUser.email || '',
              displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Staff Member',
              role: fbUser.email === 'ricardo.ferrergz@gmail.com' ? 'admin' : 'staff',
              title: 'Authorized Staff',
              active: true,
              isFirebaseVerified: true,
              createdAt: new Date().toISOString(),
            };
            setCurrentUser(newUser);
          }
        } else {
          setCurrentUser(null);
        }
      });
      return () => unsubscribe();
    }
  }, [availableUsers]);

  const switchDemoUser = (uid: string) => {
    const target = availableUsers.find((u) => u.uid === uid);
    if (target) {
      setCurrentUser(target);
      localStorage.setItem('klm_current_user_uid_v2', target.uid);
      setAuthError(null);
    }
  };

  const signIn = async (email: string, password: string): Promise<boolean> => {
    setLoading(true);
    setAuthError(null);
    try {
      if (isLiveFirebase && auth) {
        await signInWithEmailAndPassword(auth, email, password);
        return true;
      } else {
        const found = availableUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
        if (found) {
          setCurrentUser(found);
          localStorage.setItem('klm_current_user_uid_v2', found.uid);
          return true;
        } else {
          setAuthError(
            language === 'es'
              ? 'Usuario no encontrado en la lista autorizada.'
              : 'User account not found in authorized roster.'
          );
          return false;
        }
      }
    } catch (err: any) {
      setAuthError(err?.message || 'Authentication failed');
      return false;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    if (isLiveFirebase && auth) {
      await fbSignOut(auth);
    }
    setCurrentUser(null);
    localStorage.removeItem('klm_current_user_uid_v2');
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        role: currentUser?.role || 'staff',
        language,
        setLanguage,
        isLiveMode: isLiveFirebase,
        availableUsers,
        switchDemoUser,
        signIn,
        signOut,
        loading,
        authError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
