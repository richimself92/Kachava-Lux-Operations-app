import React from 'react';
import { AlertCircle, Loader2, LogOut, ShieldAlert } from 'lucide-react';
import { useAuth, type UnauthorizedReason } from '../context/AuthContext';
import { translations } from '../i18n/translations';
import { configError } from '../services/firebase';

const MicrosoftLogo: React.FC = () => (
  <svg width="18" height="18" viewBox="0 0 21 21" aria-hidden="true">
    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
  </svg>
);

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { language, setLanguage } = useAuth();
  return (
    <div className="min-h-dvh bg-paper flex flex-col items-center justify-center px-4 py-[max(1rem,env(safe-area-inset-top))] font-sans text-ink">
      <div className="w-full max-w-sm bg-surface border border-line rounded-sm p-6 sm:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <img src="/assets/aistudio/Composition_5_7a06f10c.png" alt="Kachava Lux" className="h-8 w-auto object-contain" />
          <div className="flex items-center">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                aria-pressed={language === l}
                className={`min-w-9 h-10 px-1.5 text-xs tracking-[0.12em] cursor-pointer ${
                  language === l ? 'text-ink underline underline-offset-[6px]' : 'text-muted hover:text-ink'
                }`}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        {children}
      </div>
    </div>
  );
};

const reasonText = (t: (typeof translations)['en'], reason: UnauthorizedReason | null) => {
  switch (reason) {
    case 'inactive':
      return t.notAuthorizedInactive;
    case 'wrong_domain':
      return t.notAuthorizedDomain;
    case 'no_email':
      return t.notAuthorizedNoEmail;
    case 'error':
      return t.notAuthorizedError;
    default:
      return t.notAuthorizedBody;
  }
};

/** Renders the sign-in / not-authorized / loading screens; renders children only for approved users. */
export const AccessGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { authState, language, signIn, signOut, signingIn, authError, sessionEmail, unauthorizedReason } = useAuth();
  const t = translations[language];

  if (authState === 'ready') return <>{children}</>;

  if (authState === 'misconfigured') {
    return (
      <Shell>
        <div className="flex items-start gap-2 text-sm text-danger">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold">{t.configErrorTitle}</div>
            <div className="text-xs text-muted mt-1">{configError}</div>
          </div>
        </div>
      </Shell>
    );
  }

  if (authState === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>{t.loading}</span>
        </div>
      </Shell>
    );
  }

  if (authState === 'unauthorized') {
    return (
      <Shell>
        <div className="space-y-3">
          <div className="flex items-center gap-2 text-danger">
            <ShieldAlert className="w-5 h-5" />
            <h1 className="text-lg">{t.notAuthorizedTitle}</h1>
          </div>
          <p className="text-sm text-muted leading-relaxed">{reasonText(t, unauthorizedReason)}</p>
          {sessionEmail && (
            <p className="text-xs text-muted">
              {t.signedInAs}: <span className="font-mono text-ink">{sessionEmail}</span>
            </p>
          )}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 min-h-11 px-4 border border-line-strong rounded-sm text-sm hover:bg-wash cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t.signOutButton}</span>
          </button>
        </div>
      </Shell>
    );
  }

  // signedOut
  return (
    <Shell>
      <div className="space-y-2">
        <div className="kl-label">Kachava Lux</div>
        <h1 className="text-2xl text-ink">{t.appTitle}</h1>
        <p className="text-sm text-muted">{t.signInSubtitle}</p>
      </div>
      {authError && (
        <div className="p-2.5 bg-danger-wash border border-danger-line rounded-sm text-danger flex items-start gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}
      <button
        onClick={() => signIn()}
        disabled={signingIn}
        className="w-full flex items-center justify-center gap-2.5 min-h-11 px-4 bg-white border border-[#8C8C8C] rounded-sm text-sm font-semibold text-[#5E5E5E] hover:bg-[#F3F3F1] disabled:opacity-60 cursor-pointer"
      >
        {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicrosoftLogo />}
        <span>{signingIn ? t.signingIn : t.signInWithMicrosoft}</span>
      </button>
      <p className="text-xs text-muted text-center">{t.noPublicSignUpNotice}</p>
    </Shell>
  );
};
