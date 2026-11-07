import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { RequestProvider, useRequests } from './context/RequestContext';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { RequestList } from './components/RequestList';
import { ResidencesView } from './components/ResidencesView';
import { UserManagementView } from './components/UserManagementView';
import { NewRequestModal } from './components/NewRequestModal';
import { RequestDetailModal } from './components/RequestDetailModal';
import { AccessGate } from './components/AccessGate';
import { translations } from './i18n/translations';
import { CheckCircle2 } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { language } = useAuth();
  const { setFilterOptions, requests } = useRequests();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState<boolean>(false);
  // Keep only the id so the detail modal always renders the live snapshot.
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const selectedRequest = selectedRequestId ? requests.find((r) => r.id === selectedRequestId) ?? null : null;
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleSelectVillaFromCatalog = (locationCode: string) => {
    setFilterOptions((prev) => ({
      ...prev,
      locationCode,
      status: 'all',
      searchQuery: '',
    }));
    setCurrentTab('requests');
  };

  const handleOpenNewRequestForVilla = (_locationCode: string) => {
    setIsNewRequestOpen(true);
  };

  return (
    <div className="h-dvh overflow-hidden bg-paper flex flex-col font-sans text-ink">
      {/* Top Application Bar */}
      <Navbar onOpenMobileMenu={() => setIsMobileMenuOpen(true)} />

      {/* Main Content Area: Sidebar + Scrollable Workspace View */}
      <div className="flex-1 min-h-0 flex w-full">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => setCurrentTab(tab)}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onOpenNewRequest={() => setIsNewRequestOpen(true)}
        />

        {/* `relative` keeps absolutely-positioned descendants (e.g. sr-only labels) inside this
            scroll container; otherwise they extend the document and add phantom page scroll. */}
        <main className="relative flex-1 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain">
          {/* Content column. Side padding respects the notch in landscape; bottom clears the home indicator. */}
          <div className="mx-auto w-full max-w-[1280px] pt-6 sm:pt-10 pb-[calc(4rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-8 lg:px-12">
          {currentTab === 'dashboard' && (
            <Dashboard
              onSelectTab={(tab) => setCurrentTab(tab)}
              onOpenNewRequest={() => setIsNewRequestOpen(true)}
              onSelectRequest={(req) => setSelectedRequestId(req.id)}
            />
          )}

          {currentTab === 'requests' && (
            <RequestList
              onSelectRequest={(req) => setSelectedRequestId(req.id)}
              onOpenNewRequest={() => setIsNewRequestOpen(true)}
              onNotify={showToast}
            />
          )}

          {currentTab === 'residences' && (
            <ResidencesView
              onSelectVilla={handleSelectVillaFromCatalog}
              onOpenNewRequestForVilla={handleOpenNewRequestForVilla}
            />
          )}

          {currentTab === 'users' && <UserManagementView />}
          </div>
        </main>
      </div>

      {/* New Maintenance Request Modal (Staff Form with Photo Attachments) */}
      <NewRequestModal
        isOpen={isNewRequestOpen}
        onClose={() => setIsNewRequestOpen(false)}
        onSuccess={(failedPhotos) => {
          const t = translations[language];
          showToast(
            [
              language === 'es'
                ? 'Orden de trabajo registrada. El número de folio se asigna en unos segundos.'
                : 'Work order logged. The ticket number is assigned within a few seconds.',
              ...failedPhotos.map((name) => t.photoUploadFailed.replace('{name}', name)),
            ].join(' '),
          );
          setCurrentTab('requests');
        }}
      />

      {/* Detailed Work Order & Supervisor Operational Workflow Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequestId(null)}
        />
      )}


      {/* Toast Notification */}
      {toastMessage && (
        <div role="status"
          aria-live="polite"
          className="fixed z-50 left-4 right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md bg-ink text-surface px-4 py-3 rounded-sm text-sm flex items-start gap-2.5 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 mt-0.5 text-ok-light shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <AccessGate>
        <RequestProvider>
          <MainLayout />
        </RequestProvider>
      </AccessGate>
    </AuthProvider>
  );
}
