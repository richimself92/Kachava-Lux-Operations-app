import React from 'react';
import { Database, Menu } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';

interface NavbarProps {
  onOpenMobileMenu: () => void;
}

/**
 * Top bar: logo on the left, language switch on the right.
 * Navigation, the app tag, the new-request action and the user card live in the sidebar.
 */
export const Navbar: React.FC<NavbarProps> = ({ onOpenMobileMenu }) => {
  const { language, setLanguage, usingEmulators } = useAuth();
  const t = translations[language];

  const langButton = (lang: 'en' | 'es', label: string, title: string) => (
    <button
      onClick={() => setLanguage(lang)}
      aria-pressed={language === lang}
      className={`min-w-9 h-10 px-1.5 text-xs tracking-[0.12em] transition-colors cursor-pointer ${
        language === lang ? 'text-ink underline underline-offset-[6px] decoration-ink' : 'text-muted hover:text-ink'
      }`}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <header className="shrink-0 z-30 bg-paper border-b border-line pt-[env(safe-area-inset-top)]">
      {usingEmulators && (
        <div className="px-4 py-1.5 flex items-center gap-2 bg-pending-wash text-pending border-b border-pending-line">
          <Database className="w-3.5 h-3.5 shrink-0" strokeWidth={1.5} />
          <span className="truncate text-xs">{t.emulatorBanner}</span>
        </div>
      )}

      <div className="w-full h-14 sm:h-16 flex items-center justify-between gap-2 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] sm:pl-5 sm:pr-5">
        <div className="flex items-center gap-1 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden inline-flex items-center justify-center w-10 h-10 text-ink hover:bg-wash rounded-sm transition-colors shrink-0 cursor-pointer"
            aria-label={language === 'es' ? 'Abrir menú' : 'Open menu'}
          >
            <Menu className="w-5 h-5" strokeWidth={1.5} />
          </button>
          <img
            src="/assets/aistudio/Composition_5_7a06f10c.png"
            alt="Kachava Lux"
            className="h-7 sm:h-8 md:h-9 w-auto max-w-[150px] sm:max-w-none object-contain shrink-0"
          />
        </div>

        <div className="flex items-center shrink-0" role="group" aria-label="Language">
          {langButton('en', 'EN', 'English')}
          <span className="text-line-strong text-xs" aria-hidden>
            /
          </span>
          {langButton('es', 'ES', 'Español')}
        </div>
      </div>
    </header>
  );
};
