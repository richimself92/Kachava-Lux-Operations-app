import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { 
  LayoutDashboard, 
  ClipboardList, 
  PlusCircle, 
  Home, 
  Users, 
  ShieldCheck, 
  X
} from 'lucide-react';

interface SidebarProps {
  currentTab: string;
  onSelectTab: (tab: string) => void;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  onOpenNewRequest: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  isOpenMobile,
  onCloseMobile,
  onOpenNewRequest,
}) => {
  const { role, language } = useAuth();
  const { requests } = useRequests();
  const t = translations[language];

  const pendingCount = requests.filter((r) => r.status === 'pending').length;
  const inProgressCount = requests.filter((r) => r.status === 'acknowledged').length;
  const activeTotal = pendingCount + inProgressCount;

  const navItems = [
    {
      id: 'dashboard',
      label: t.navDashboard,
      icon: LayoutDashboard,
      badge: null,
    },
    {
      id: 'requests',
      label: t.navRequests,
      icon: ClipboardList,
      badge: activeTotal > 0 ? activeTotal : null,
      badgeColor: pendingCount > 0 ? 'bg-[#E37400] text-white' : 'bg-[#1A73E8] text-white',
    },
    {
      id: 'residences',
      label: t.navResidences,
      icon: Home,
      badge: null,
    },
    ...(role === 'admin' || role === 'supervisor'
      ? [
          {
            id: 'users',
            label: t.navUsers,
            icon: Users,
            badge: null,
          },
        ]
      : []),
    {
      id: 'architecture',
      label: language === 'es' ? 'Arquitectura' : 'Architecture',
      icon: ShieldCheck,
      badge: null,
    },
  ];

  const sidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-[#DADCE0] w-60 select-none">
      {/* Mobile Header with close button */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-[#DADCE0]">
        <div className="font-semibold text-[#202124] text-sm">
          {t.appTitle}
        </div>
        <button
          onClick={onCloseMobile}
          className="p-1 text-[#5F6368] hover:text-[#202124] rounded-md cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Primary Action Button */}
      <div className="p-3">
        <button
          onClick={() => {
            onOpenNewRequest();
            onCloseMobile();
          }}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-[#6D4627] hover:bg-[#55361D] text-white font-medium text-xs sm:text-sm rounded-md shadow-xs transition-colors cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>{t.navNewRequest}</span>
        </button>
      </div>

      {/* Navigation List */}
      <nav className="flex-1 px-2 py-1 space-y-1 overflow-y-auto">
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
              className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-xs sm:text-sm font-medium transition-colors cursor-pointer text-left ${
                isActive
                  ? 'bg-[#F4EFEA] text-[#6D4627] font-semibold border-l-4 border-[#6D4627]'
                  : 'text-[#202124] hover:bg-[#F3F3F1]'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#6D4627]' : 'text-[#5F6368]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </div>

              {item.badge !== null && (
                <span
                  className={`px-2 py-0.5 text-xs font-semibold rounded-full ${
                    item.badgeColor || 'bg-[#F3F3F1] text-[#202124]'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Footer Info */}
      <div className="p-3 border-t border-[#DADCE0] bg-[#FAFAFA] text-[11px] text-[#5F6368]">
        <div className="font-medium text-[#202124]">
          Kachava Lux
        </div>
        <div className="text-[10px] text-[#70757A] mt-0.5">
          v1.1 • Operational
        </div>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden md:block shrink-0 sticky top-16 h-[calc(100vh-4rem)]">
        {sidebarContent}
      </aside>

      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative flex-1 flex flex-col max-w-xs w-full bg-white z-50">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};
