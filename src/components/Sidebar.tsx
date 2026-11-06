import React, { useEffect, useState } from 'react';
import {
  ClipboardList,
  Home,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  PlusCircle,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenNewRequest: () => void;
}

const COLLAPSED_KEY = 'klm.sidebarCollapsed';

const ROLE_BADGE: Record<string, string> = {
  admin: 'bg-[#6D4627] text-white',
  supervisor: 'bg-[#989166] text-white',
  staff: 'bg-[#F3F3F1] text-[#202124] border border-[#DADCE0]',
};

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onOpenNewRequest,
}) => {
  const { role, language, currentUser, signOut } = useAuth();
  const { requests } = useRequests();
  const t = translations[language];
  const es = language === 'es';

  // Desktop only: collapsed = narrow icon rail. Remembered per browser.
  const [collapsed, setCollapsed] = useState<boolean>(() => localStorage.getItem(COLLAPSED_KEY) === '1');
  useEffect(() => {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const unreviewedCount = requests.filter((r) => r.status === 'sin_revisar').length;
  const activeTotal = requests.filter((r) => r.status !== 'completada').length;

  const navItems = [
    { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard, badge: null as number | null, badgeColor: '' },
    {
      id: 'requests',
      label: t.navRequests,
      icon: ClipboardList,
      badge: activeTotal > 0 ? activeTotal : null,
      badgeColor: unreviewedCount > 0 ? 'bg-[#E37400] text-white' : 'bg-[#1A73E8] text-white',
    },
    { id: 'residences', label: t.navResidences, icon: Home, badge: null, badgeColor: '' },
    ...(role === 'admin' ? [{ id: 'users', label: t.navUsers, icon: Users, badge: null, badgeColor: '' }] : []),
  ];

  const roleLabel = role === 'admin' ? 'Admin' : role === 'supervisor' ? 'Supervisor' : 'Staff';
  const initial = currentUser?.displayName.charAt(0).toUpperCase() || 'U';
  const toggleLabel = collapsed ? (es ? 'Mostrar menú' : 'Show menu') : es ? 'Ocultar menú' : 'Hide menu';

  /** `rail` = collapsed desktop rail; the mobile drawer is always expanded. */
  const content = (rail: boolean, mobile: boolean) => (
    <div className={`flex flex-col h-full bg-white border-r border-[#DADCE0] select-none ${rail ? 'w-14' : 'w-64'}`}>
      {/* Top: app tag + show/hide toggle (or close on mobile) */}
      <div className={`flex items-center border-b border-[#DADCE0] ${rail ? 'justify-center p-2' : 'justify-between gap-2 p-3'}`}>
        {!rail && (
          <span className="text-xs sm:text-sm font-semibold tracking-tight text-[#6D4627] bg-[#F4EFEA] px-2.5 py-1 rounded-md border border-[#E8DEC9] truncate">
            {t.appTitle}
          </span>
        )}
        {mobile ? (
          <button
            onClick={onCloseMobile}
            className="p-1 text-[#5F6368] hover:text-[#202124] rounded-md cursor-pointer"
            aria-label={es ? 'Cerrar menú' : 'Close menu'}
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded-md cursor-pointer shrink-0"
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!rail}
          >
            {rail ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Primary action */}
      <div className={rail ? 'p-2' : 'p-3'}>
        <button
          onClick={() => {
            onOpenNewRequest();
            onCloseMobile();
          }}
          title={t.navNewRequest}
          aria-label={t.navNewRequest}
          className={`w-full flex items-center justify-center gap-2 bg-[#6D4627] hover:bg-[#55361D] text-white font-medium text-xs sm:text-sm rounded-md shadow-xs transition-colors cursor-pointer ${
            rail ? 'p-2' : 'px-3 py-2'
          }`}
        >
          <PlusCircle className="w-4 h-4 shrink-0" />
          {!rail && <span>{t.navNewRequest}</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className={`flex-1 py-1 space-y-1 overflow-y-auto ${rail ? 'px-1.5' : 'px-2'}`}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectTab(item.id);
                onCloseMobile();
              }}
              title={rail ? item.label : undefined}
              aria-label={item.label}
              className={`relative w-full flex items-center rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                rail ? 'justify-center p-2' : 'justify-between px-3 py-2'
              } ${
                isActive
                  ? `bg-[#F4EFEA] text-[#6D4627] font-semibold ${rail ? '' : 'border-l-4 border-[#6D4627]'}`
                  : 'text-[#202124] hover:bg-[#F3F3F1]'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-[#6D4627]' : 'text-[#5F6368]'}`} />
                {!rail && <span className="truncate">{item.label}</span>}
              </span>
              {item.badge !== null &&
                (rail ? (
                  <span
                    className={`absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 text-[9px] leading-4 font-bold rounded-full text-center ${item.badgeColor}`}
                  >
                    {item.badge}
                  </span>
                ) : (
                  <span className={`px-2 py-0.5 text-xs font-semibold rounded-full ${item.badgeColor}`}>{item.badge}</span>
                ))}
            </button>
          );
        })}
      </nav>

      {/* Signed-in user */}
      <div className={`border-t border-[#DADCE0] ${rail ? 'p-2 flex flex-col items-center gap-2' : 'p-3 space-y-2'}`}>
        {rail ? (
          <div
            className="w-8 h-8 rounded-full bg-[#6D4627] text-white flex items-center justify-center font-bold text-xs"
            title={`${currentUser?.displayName ?? ''} · ${currentUser?.email ?? ''}`}
          >
            {initial}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="min-w-0 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-[#202124] truncate">{currentUser?.displayName}</span>
                <span
                  className={`shrink-0 px-1.5 py-0.5 rounded-sm text-[10px] font-semibold uppercase ${ROLE_BADGE[role] ?? ROLE_BADGE.staff}`}
                >
                  {roleLabel}
                </span>
              </div>
              <div className="text-[#5F6368] truncate" title={currentUser?.email}>
                {currentUser?.email}
              </div>
              {currentUser?.title && <div className="text-[10px] text-[#5F6368] truncate">{currentUser.title}</div>}
            </div>
          </div>
        )}
        <button
          onClick={() => void signOut()}
          title={t.signOutButton}
          aria-label={t.signOutButton}
          className={`flex items-center gap-2 rounded-md text-xs font-medium text-[#202124] hover:bg-[#F3F3F1] border border-[#DADCE0] transition-colors cursor-pointer ${
            rail ? 'p-2' : 'w-full justify-center px-2 py-1.5'
          }`}
        >
          <LogOut className="w-4 h-4 text-[#5F6368]" />
          {!rail && <span>{t.signOutButton}</span>}
        </button>
      </div>

      {/* Footer */}
      <div className={`border-t border-[#DADCE0] bg-[#FAFAFA] text-[#5F6368] ${rail ? 'p-2 text-center text-[9px]' : 'p-3 text-[11px]'}`}>
        {rail ? (
          'v1.1'
        ) : (
          <>
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-[#202124]">Kachava Lux</span>
              <span className="text-[10px] text-[#70757A]">v1.1</span>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block shrink-0 h-full">
        {content(collapsed, false)}
      </aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/40 transition-opacity" onClick={onCloseMobile} />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white z-50">{content(false, true)}</div>
        </div>
      )}
    </>
  );
};
