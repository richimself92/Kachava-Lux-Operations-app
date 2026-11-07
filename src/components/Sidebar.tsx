import React, { useEffect, useState } from 'react';
import { ClipboardList, Home, LayoutDashboard, LogOut, PanelLeftClose, PanelLeftOpen, Plus, Users, X } from 'lucide-react';
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

  // Mobile drawer: Escape closes it.
  useEffect(() => {
    if (!isOpenMobile) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseMobile();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpenMobile, onCloseMobile]);

  const unreviewedCount = requests.filter((r) => r.status === 'sin_revisar').length;
  const activeTotal = requests.filter((r) => r.status !== 'completada').length;

  const navItems = [
    { id: 'dashboard', label: t.navDashboard, icon: LayoutDashboard, badge: null as number | null },
    { id: 'requests', label: t.navRequests, icon: ClipboardList, badge: activeTotal > 0 ? activeTotal : null },
    { id: 'residences', label: t.navResidences, icon: Home, badge: null },
    ...(role === 'admin' ? [{ id: 'users', label: t.navUsers, icon: Users, badge: null }] : []),
  ];
  // Unreviewed work pulls the count into ochre; otherwise it stays quiet.
  const badgeTone = unreviewedCount > 0 ? 'text-pending' : 'text-muted';

  const roleLabel = role === 'admin' ? 'Admin' : role === 'supervisor' ? 'Supervisor' : 'Staff';
  const initial = currentUser?.displayName.charAt(0).toUpperCase() || 'U';
  const toggleLabel = collapsed ? (es ? 'Mostrar menú' : 'Show menu') : es ? 'Ocultar menú' : 'Hide menu';

  /** `rail` = collapsed desktop rail; the mobile drawer is always expanded. */
  const content = (rail: boolean, mobile: boolean) => (
    <div
      className={`flex flex-col h-full overflow-y-auto overscroll-contain bg-paper border-r border-line select-none ${
        rail ? 'w-16' : mobile ? 'w-[min(18rem,85vw)]' : 'w-64'
      } ${mobile ? 'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)]' : ''}`}
    >
      {/* Top: app label + show/hide toggle (or close on mobile) */}
      <div className={`flex items-center h-14 ${rail ? 'justify-center' : 'justify-between gap-2 pl-5 pr-2'}`}>
        {!rail && <span className="kl-label truncate">{t.appTitle}</span>}
        {mobile ? (
          <button
            onClick={onCloseMobile}
            className="inline-flex items-center justify-center w-10 h-10 text-muted hover:text-ink cursor-pointer"
            aria-label={es ? 'Cerrar menú' : 'Close menu'}
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="inline-flex items-center justify-center w-9 h-9 text-muted hover:text-ink hover:bg-wash rounded-sm cursor-pointer shrink-0"
            title={toggleLabel}
            aria-label={toggleLabel}
            aria-expanded={!rail}
          >
            {rail ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        )}
      </div>

      {/* Primary action */}
      <div className={rail ? 'px-3 pb-4' : 'px-5 pb-6'}>
        <button
          onClick={() => {
            onOpenNewRequest();
            onCloseMobile();
          }}
          title={t.navNewRequest}
          aria-label={t.navNewRequest}
          className={`w-full flex items-center justify-center gap-2 bg-brand hover:bg-brand-deep text-surface text-sm font-medium rounded-sm transition-colors cursor-pointer ${
            rail ? 'h-10' : 'min-h-11 px-3'
          }`}
        >
          <Plus className="w-4 h-4 shrink-0" />
          {!rail && <span>{t.navNewRequest}</span>}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 shrink-0 border-t border-line pt-3 pb-3 px-3" aria-label={es ? 'Principal' : 'Main'}>
        <ul className="space-y-0.5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => {
                    onSelectTab(item.id);
                    onCloseMobile();
                  }}
                  title={rail ? item.label : undefined}
                  aria-label={item.label}
                  aria-current={isActive ? 'page' : undefined}
                  className={`relative w-full flex items-center min-h-11 rounded-sm text-sm transition-colors cursor-pointer text-left ${
                    rail ? 'justify-center' : 'justify-between gap-3 px-2'
                  } ${isActive ? 'bg-wash text-ink' : 'text-muted hover:text-ink hover:bg-wash/60'}`}
                >
                  {/* Active marker: a short brown rule, the only accent in the menu */}
                  {isActive && <span className="absolute left-0 top-2.5 bottom-2.5 w-px bg-brand" aria-hidden />}
                  <span className="flex items-center gap-3 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-brand' : ''}`} strokeWidth={1.5} />
                    {!rail && <span className="truncate">{item.label}</span>}
                  </span>
                  {item.badge !== null &&
                    (rail ? (
                      <span className={`absolute top-1 right-0.5 text-[10px] leading-none tabular-nums ${badgeTone}`}>{item.badge}</span>
                    ) : (
                      <span className={`text-xs tabular-nums ${badgeTone}`}>{item.badge}</span>
                    ))}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Signed-in user */}
      <div className={`border-t border-line ${rail ? 'py-3 flex flex-col items-center gap-2' : 'px-5 py-4 space-y-3'}`}>
        {rail ? (
          <div
            className="w-8 h-8 rounded-full border border-line-strong text-ink flex items-center justify-center font-display text-xs"
            title={`${currentUser?.displayName ?? ''} · ${currentUser?.email ?? ''}`}
          >
            {initial}
          </div>
        ) : (
          <div className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-ink truncate">{currentUser?.displayName}</span>
              <span className="kl-label shrink-0 !text-[10px]">{roleLabel}</span>
            </div>
            <div className="text-xs text-muted truncate" title={currentUser?.email}>
              {currentUser?.email}
            </div>
            {currentUser?.title && <div className="text-xs text-muted truncate">{currentUser.title}</div>}
          </div>
        )}
        <button
          onClick={() => void signOut()}
          title={t.signOutButton}
          aria-label={t.signOutButton}
          className={`flex items-center gap-2 text-sm text-muted hover:text-ink transition-colors cursor-pointer ${
            rail ? 'justify-center w-10 h-10 hover:bg-wash rounded-sm' : 'min-h-10 -ml-1 px-1'
          }`}
        >
          <LogOut className="w-4 h-4" strokeWidth={1.5} />
          {!rail && <span>{t.signOutButton}</span>}
        </button>
      </div>

      {/* Footer */}
      <div className={`border-t border-line text-muted ${rail ? 'py-3 text-center text-[10px]' : 'px-5 py-3 flex items-center justify-between text-[11px]'}`}>
        {rail ? (
          'v1.1'
        ) : (
          <>
            <span className="kl-label !text-[10px]">Kachava Lux</span>
            <span className="tabular-nums">v1.1</span>
          </>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block shrink-0 h-full">{content(collapsed, false)}</aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex" role="dialog" aria-modal="true" aria-label={es ? 'Menú' : 'Menu'}>
          <div className="fixed inset-0 bg-ink/30 animate-fade-in" onClick={onCloseMobile} />
          {/* Drawer is exactly as wide as its content — no leftover band beside it. */}
          <div className="relative h-full z-50 animate-fade-in">{content(false, true)}</div>
        </div>
      )}
    </>
  );
};
