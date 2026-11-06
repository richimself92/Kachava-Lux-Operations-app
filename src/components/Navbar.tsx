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
      className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs font-medium rounded-sm transition-colors cursor-pointer ${
        language === lang ? 'bg-white text-[#202124] shadow-xs font-semibold' : 'text-[#5F6368] hover:text-[#202124]'
      }`}
      title={title}
    >
      {label}
    </button>
  );

  return (
    <header className="shrink-0 z-30 bg-white border-b border-[#DADCE0] shadow-xs">
      {usingEmulators && (
        <div className="px-3 sm:px-4 py-1 text-xs font-medium flex items-center bg-[#FEF7E0] text-[#B06000] border-b border-[#FEEFC3]">
          <Database className="w-3.5 h-3.5 shrink-0 text-[#E37400] mr-2" />
          <span className="truncate text-[11px] sm:text-xs font-semibold">{t.emulatorBanner}</span>
        </div>
      )}

      <div className="w-full px-3 sm:px-4 h-14 sm:h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded-md transition-colors shrink-0 cursor-pointer"
            aria-label="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>
          <img
            src="/assets/aistudio/Composition_5_7a06f10c.png"
            alt="Kachava Lux"
            className="h-6 sm:h-8 md:h-9 w-auto max-w-[140px] sm:max-w-none object-contain shrink-0"
          />
        </div>

        <div className="flex items-center bg-[#F3F3F1] rounded-md p-0.5 border border-[#DADCE0] shrink-0">
          {langButton('en', 'EN', 'English')}
          {langButton('es', 'ES', 'Español')}
        </div>
      </div>
    </header>
  );
};
