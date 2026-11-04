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
import { FirebaseArchitectureModal } from './components/FirebaseArchitectureModal';
import { MaintenanceRequest } from './types';
import { CheckCircle2, AlertCircle } from 'lucide-react';

const MainLayout: React.FC = () => {
  const { language } = useAuth();
  const { setFilterOptions } = useRequests();

  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [isNewRequestOpen, setIsNewRequestOpen] = useState<boolean>(false);
  const [isFirebaseInfoOpen, setIsFirebaseInfoOpen] = useState<boolean>(false);
  const [selectedRequest, setSelectedRequest] = useState<MaintenanceRequest | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  const handleSelectVillaFromCatalog = (villaNum: string) => {
    setFilterOptions((prev) => ({
      ...prev,
      villaNumber: villaNum,
      status: 'all',
      searchQuery: '',
    }));
    setCurrentTab('requests');
  };

  const handleOpenNewRequestForVilla = (villaNum: string) => {
    setIsNewRequestOpen(true);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col font-sans text-[#202124]">
      {/* Top Application Bar */}
      <Navbar
        onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
        onOpenNewRequest={() => setIsNewRequestOpen(true)}
        onOpenFirebaseInfo={() => setIsFirebaseInfoOpen(true)}
        currentTab={currentTab}
      />

      {/* Main Content Area: Sidebar + Scrollable Workspace View */}
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          currentTab={currentTab}
          onSelectTab={(tab) => {
            if (tab === 'architecture') {
              setIsFirebaseInfoOpen(true);
            } else {
              setCurrentTab(tab);
            }
          }}
          isOpenMobile={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
          onOpenNewRequest={() => setIsNewRequestOpen(true)}
        />

        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 pb-16">
          {currentTab === 'dashboard' && (
            <Dashboard
              onSelectTab={(tab) => setCurrentTab(tab)}
              onOpenNewRequest={() => setIsNewRequestOpen(true)}
              onSelectRequest={(req) => setSelectedRequest(req)}
            />
          )}

          {currentTab === 'requests' && (
            <RequestList
              onSelectRequest={(req) => setSelectedRequest(req)}
              onOpenNewRequest={() => setIsNewRequestOpen(true)}
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
        onSuccess={(ticketId) => {
          showToast(
            language === 'es'
              ? `Orden de trabajo ${ticketId} registrada con éxito.`
              : `Work order ${ticketId} logged successfully.`
          );
          setCurrentTab('requests');
        }}
      />

      {/* Detailed Work Order & Supervisor Operational Workflow Modal */}
      {selectedRequest && (
        <RequestDetailModal
          request={selectedRequest}
          onClose={() => setSelectedRequest(null)}
        />
      )}

      {/* Firebase Architecture & Security Rules Modal */}
      <FirebaseArchitectureModal
        isOpen={isFirebaseInfoOpen}
        onClose={() => setIsFirebaseInfoOpen(false)}
      />

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
      <RequestProvider>
        <MainLayout />
      </RequestProvider>
    </AuthProvider>
  );
}
