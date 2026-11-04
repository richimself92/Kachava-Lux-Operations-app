import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';
import { 
  Plus, 
  Menu, 
  Database, 
  HelpCircle, 
  CheckCircle2
} from 'lucide-react';

interface NavbarProps {
  onOpenMobileMenu: () => void;
  onOpenNewRequest: () => void;
  onOpenFirebaseInfo: () => void;
  currentTab: string;
}

export const Navbar: React.FC<NavbarProps> = ({
  onOpenMobileMenu,
  onOpenNewRequest,
  onOpenFirebaseInfo,
}) => {
  const { 
    currentUser, 
    role, 
    language, 
    setLanguage, 
    isLiveMode, 
    availableUsers, 
    switchDemoUser 
  } = useAuth();
  
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const t = translations[language];

  const getRoleBadge = (userRole: string) => {
    switch (userRole) {
      case 'admin':
        return {
          label: language === 'es' ? 'Admin' : 'Admin',
          bg: 'bg-[#6D4627] text-white',
        };
      case 'supervisor':
        return {
          label: language === 'es' ? 'Supervisor' : 'Supervisor',
          bg: 'bg-[#989166] text-white',
        };
      default:
        return {
          label: language === 'es' ? 'Staff' : 'Staff',
          bg: 'bg-[#F3F3F1] text-[#202124] border border-[#DADCE0]',
        };
    }
  };

  const currentBadge = getRoleBadge(role);

  return (
    <header className="sticky top-0 z-30 bg-white border-b border-[#DADCE0] shadow-xs">
      {/* Top Banner: Mode Indicator */}
      <div
        className={`px-3 sm:px-4 py-1 text-xs font-medium flex items-center justify-between transition-colors ${
          isLiveMode
            ? 'bg-[#E6F4EA] text-[#137333] border-b border-[#CEEAD6]'
            : 'bg-[#FEF7E0] text-[#B06000] border-b border-[#FEEFC3]'
        }`}
      >
        <div className="flex items-center gap-1.5 sm:gap-2 truncate mr-2">
          {isLiveMode ? (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          ) : (
            <Database className="w-3.5 h-3.5 shrink-0 text-[#E37400]" />
          )}
          <span className="truncate text-[11px] sm:text-xs">
            <strong>{isLiveMode ? t.liveFirebaseActive : t.demoModeActive}</strong>
            <span className="hidden md:inline"> — {isLiveMode ? t.liveNotice : t.demoModeNotice}</span>
          </span>
        </div>
        
        <button
          onClick={onOpenFirebaseInfo}
          className="hover:text-black shrink-0 text-[11px] sm:text-xs font-medium cursor-pointer ml-2 flex items-center gap-1 text-[#5F6368]"
        >
          <HelpCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {language === 'es' ? 'Arquitectura' : 'Architecture'}
          </span>
        </button>
      </div>

      {/* Main Navbar */}
      <div className="max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2">
        {/* Left: Mobile Toggle & Brand Logo */}
        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0">
          <button
            onClick={onOpenMobileMenu}
            className="md:hidden p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded-md transition-colors shrink-0 cursor-pointer"
            aria-label="Open Navigation"
          >
            <Menu className="w-5 h-5" />
          </button>

          {/* Official Kachava Lux Logo and Application Identifier */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <img
              src="/assets/aistudio/Composition_5_7a06f10c.png"
              alt="Kachava Lux"
              className="h-6 sm:h-8 md:h-9 w-auto max-w-[140px] sm:max-w-none object-contain shrink-0"
            />
            {/* Divider and Application Identifier (hidden on small mobile to prevent overlap) */}
            <div className="h-5 w-px bg-[#DADCE0] hidden md:block shrink-0" />
            <span className="text-xs sm:text-sm font-semibold tracking-tight text-[#6D4627] bg-[#F4EFEA] px-2.5 py-1 rounded-md border border-[#E8DEC9] whitespace-nowrap hidden md:inline-block">
              {t.appTitle}
            </span>
          </div>
        </div>

        {/* Right: Actions, Language Switcher, User Profile Avatar */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {/* New Request Button with + Icon */}
          <button
            onClick={onOpenNewRequest}
            className="flex items-center justify-center gap-1 px-2.5 py-1.5 sm:px-3.5 sm:py-2 text-xs sm:text-sm font-medium rounded-md text-white bg-[#6D4627] hover:bg-[#55361D] shadow-xs transition-colors cursor-pointer shrink-0"
            title={t.navNewRequest}
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">{t.navNewRequest}</span>
          </button>

          {/* Language Switcher */}
          <div className="flex items-center bg-[#F3F3F1] rounded-md p-0.5 border border-[#DADCE0] shrink-0">
            <button
              onClick={() => setLanguage('en')}
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                language === 'en'
                  ? 'bg-white text-[#202124] shadow-xs font-semibold'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
              title="English"
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('es')}
              className={`px-1.5 py-0.5 sm:px-2 sm:py-1 text-[11px] sm:text-xs font-medium rounded-sm transition-colors cursor-pointer ${
                language === 'es'
                  ? 'bg-white text-[#202124] shadow-xs font-semibold'
                  : 'text-[#5F6368] hover:text-[#202124]'
              }`}
              title="Español"
            >
              ES
            </button>
          </div>

          {/* User Profile: Display only a circular avatar with the user's first initial */}
          <div className="relative shrink-0">
            <button
              onClick={() => setShowUserDropdown(!showUserDropdown)}
              className="flex items-center justify-center p-0.5 rounded-full hover:ring-2 hover:ring-[#6D4627]/40 transition-all cursor-pointer focus:outline-hidden"
              title={currentUser?.displayName}
              aria-label="User profile"
            >
              <div className="w-8 h-8 rounded-full bg-[#6D4627] text-white flex items-center justify-center font-bold text-xs sm:text-sm shadow-xs select-none">
                {currentUser?.displayName.charAt(0).toUpperCase() || 'U'}
              </div>
            </button>

            {/* Dropdown Menu */}
            {showUserDropdown && (
              <>
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => setShowUserDropdown(false)} 
                />
                <div 
                  className="absolute right-0 mt-2 w-72 sm:w-80 bg-white border border-[#DADCE0] rounded-lg shadow-xl z-50 p-3 text-xs"
                >
                  <div className="pb-2 border-b border-[#DADCE0] mb-2">
                    <div className="font-semibold text-sm text-[#202124]">
                      {currentUser?.displayName}
                    </div>
                    <div className="text-[#5F6368]">{currentUser?.email}</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${currentBadge.bg}`}>
                        {currentBadge.label}
                      </span>
                      <span className="text-[10px] text-[#5F6368]">{currentUser?.title}</span>
                    </div>
                  </div>

                  <div className="mt-2">
                    <span className="font-medium text-[#5F6368] uppercase text-[10px] tracking-wider block mb-1.5">
                      {t.switchRole}
                    </span>
                    <div className="space-y-1 max-h-56 overflow-y-auto">
                      {availableUsers.map((u) => (
                        <button
                          key={u.uid}
                          onClick={() => {
                            switchDemoUser(u.uid);
                            setShowUserDropdown(false);
                          }}
                          className={`w-full text-left px-2 py-1.5 rounded-md flex items-center justify-between transition-colors cursor-pointer ${
                            currentUser?.uid === u.uid
                              ? 'bg-[#F4EFEA] text-[#6D4627] font-semibold'
                              : 'hover:bg-[#F3F3F1] text-[#202124]'
                          }`}
                        >
                          <div className="truncate pr-2">
                            <div className="font-medium truncate">{u.displayName}</div>
                            <div className="text-[10px] text-[#5F6368] truncate">{u.title}</div>
                          </div>
                          <span className={`shrink-0 text-[9px] px-1.5 py-0.5 rounded-sm font-semibold uppercase ${getRoleBadge(u.role).bg}`}>
                            {u.role}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 mt-2 border-t border-[#DADCE0] text-[10px] text-[#5F6368]">
                    {t.rosterNotice}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
