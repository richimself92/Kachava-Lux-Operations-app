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
    <div className="min-h-screen bg-[#F3F3F1] flex flex-col items-center justify-center p-4 font-sans text-[#202124]">
      <div className="w-full max-w-sm bg-white border border-[#DADCE0] rounded-xl shadow-sm p-6 space-y-5">
        <div className="flex items-center justify-between">
          <img src="/assets/aistudio/Composition_5_7a06f10c.png" alt="Kachava Lux" className="h-8 w-auto object-contain" />
          <div className="flex items-center bg-[#F3F3F1] rounded-md p-0.5 border border-[#DADCE0]">
            {(['en', 'es'] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLanguage(l)}
                className={`px-2 py-0.5 text-[11px] font-medium rounded-sm cursor-pointer ${
                  language === l ? 'bg-white shadow-xs font-semibold' : 'text-[#5F6368]'
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
        <div className="flex items-start gap-2 text-sm text-[#D93025]">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <div>
            <div className="font-semibold">{t.configErrorTitle}</div>
            <div className="text-xs text-[#5F6368] mt-1">{configError}</div>
          </div>
        </div>
      </Shell>
    );
  }

  if (authState === 'loading') {
    return (
      <Shell>
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-[#5F6368]">
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
          <div className="flex items-center gap-2 text-[#D93025]">
            <ShieldAlert className="w-5 h-5" />
            <h1 className="text-base font-semibold">{t.notAuthorizedTitle}</h1>
          </div>
          <p className="text-sm text-[#5F6368] leading-relaxed">{reasonText(t, unauthorizedReason)}</p>
          {sessionEmail && (
            <p className="text-xs text-[#5F6368]">
              {t.signedInAs}: <span className="font-mono text-[#202124]">{sessionEmail}</span>
            </p>
          )}
          <button
            onClick={() => signOut()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 border border-[#DADCE0] rounded-md text-sm font-medium hover:bg-[#F3F3F1] cursor-pointer"
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
      <div className="space-y-1">
        <h1 className="text-lg font-semibold text-[#6D4627]">{t.appTitle}</h1>
        <p className="text-xs text-[#5F6368]">{t.signInSubtitle}</p>
      </div>
      {authError && (
        <div className="p-2.5 bg-[#FCE8E6] border border-[#FAD2CF] rounded text-[#D93025] flex items-start gap-2 text-xs">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{authError}</span>
        </div>
      )}
      <button
        onClick={() => signIn()}
        disabled={signingIn}
        className="w-full flex items-center justify-center gap-2.5 px-4 py-2.5 bg-white border border-[#8C8C8C] rounded-md text-sm font-semibold text-[#5E5E5E] hover:bg-[#F3F3F1] disabled:opacity-60 cursor-pointer"
      >
        {signingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MicrosoftLogo />}
        <span>{signingIn ? t.signingIn : t.signInWithMicrosoft}</span>
      </button>
      <p className="text-[11px] text-[#70757A] text-center">{t.noPublicSignUpNotice}</p>
    </Shell>
  );
};
