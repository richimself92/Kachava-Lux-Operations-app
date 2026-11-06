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
    <div className="h-dvh overflow-hidden bg-white flex flex-col font-sans text-[#202124]">
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
        <main className="relative flex-1 min-w-0 overflow-y-auto px-3 sm:px-5 py-5 pb-16">
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
        <div className="fixed bottom-4 right-4 z-50 bg-[#202124] text-white px-4 py-2.5 rounded-lg shadow-xl text-xs sm:text-sm flex items-center gap-2 border border-gray-700 animate-fade-in">
          <CheckCircle2 className="w-4 h-4 text-[#81C995] shrink-0" />
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
