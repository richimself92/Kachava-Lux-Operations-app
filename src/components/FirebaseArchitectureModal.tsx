import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { translations } from '../i18n/translations';
import { 
  X, 
  ShieldCheck, 
  Lock, 
  CheckCircle2, 
  AlertCircle,
  Copy,
  Check
} from 'lucide-react';

interface FirebaseArchitectureModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FirebaseArchitectureModal: React.FC<FirebaseArchitectureModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { isLiveMode, language } = useAuth();
  const t = translations[language];
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'rules' | 'storage'>('overview');

  if (!isOpen) return null;

  const sampleRules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} { allow read, write: if false; }

    function isAdmin() {
      return request.auth != null && (
        exists(/databases/$(database)/documents/admins/$(request.auth.uid)) ||
        (request.auth.token.email == 'ricardo.ferrergz@gmail.com' && request.auth.token.email_verified == true)
      );
    }
    function isSupervisor() {
      return request.auth != null && (
        isAdmin() ||
        exists(/databases/$(database)/documents/supervisors/$(request.auth.uid))
      );
    }

    match /requests/{requestId} {
      allow get, list: if request.auth != null && (
        resource.data.submittedBy.uid == request.auth.uid || isSupervisor()
      );
      allow create: if request.auth != null &&
        request.resource.data.status == 'pending' &&
        request.resource.data.submittedBy.uid == request.auth.uid &&
        request.resource.data.createdAt == request.time;
      allow update: if request.auth != null && (
        isAdmin() ||
        (isSupervisor() && (
          (resource.data.status == 'pending' && request.resource.data.status == 'acknowledged') ||
          (resource.data.status == 'acknowledged' && request.resource.data.status == 'completed')
        ))
      );
    }
  }
}`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-[#DADCE0] overflow-hidden my-auto max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#DADCE0] flex items-center justify-between bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#6D4627] text-white rounded">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <h2 className="text-base font-semibold text-[#202124]">
              {language === 'es' ? 'Arquitectura y Seguridad' : 'Security Architecture'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#5F6368] hover:text-[#202124] rounded cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status Indicator Bar */}
        <div
          className={`px-5 py-2 flex items-center justify-between text-xs font-medium border-b ${
            isLiveMode
              ? 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]'
              : 'bg-[#FEF7E0] text-[#B06000] border-[#FEEFC3]'
          }`}
        >
          <div className="flex items-center gap-1.5">
            {isLiveMode ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : (
              <AlertCircle className="w-4 h-4 text-[#E37400]" />
            )}
            <span>
              <strong>{isLiveMode ? t.liveFirebaseActive : t.demoModeActive}</strong>
              <span className="hidden sm:inline"> — {isLiveMode ? t.liveNotice : t.demoModeNotice}</span>
            </span>
          </div>
          <span className="text-[10px] font-mono bg-white/70 px-1.5 py-0.5 rounded border border-current">
            {isLiveMode ? 'LIVE' : 'DEMO'}
          </span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#DADCE0] px-5 bg-white text-xs font-medium">
          <button
            onClick={() => setActiveTab('overview')}
            className={`py-2 px-3 border-b-2 font-semibold cursor-pointer ${
              activeTab === 'overview'
                ? 'border-[#6D4627] text-[#6D4627]'
                : 'border-transparent text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            {language === 'es' ? 'Resumen' : 'Overview'}
          </button>
          <button
            onClick={() => setActiveTab('rules')}
            className={`py-2 px-3 border-b-2 font-semibold cursor-pointer ${
              activeTab === 'rules'
                ? 'border-[#6D4627] text-[#6D4627]'
                : 'border-transparent text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            Firestore Rules
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-2 px-3 border-b-2 font-semibold cursor-pointer ${
              activeTab === 'storage'
                ? 'border-[#6D4627] text-[#6D4627]'
                : 'border-transparent text-[#5F6368] hover:text-[#202124]'
            }`}
          >
            Storage Rules
          </button>
        </div>

        {/* Content Body */}
        <div className="overflow-y-auto p-5 space-y-3.5 text-xs">
          {activeTab === 'overview' && (
            <div className="space-y-3">
              <div className="border border-[#DADCE0] rounded-lg p-3.5 bg-white space-y-2">
                <h3 className="font-semibold text-xs text-[#202124] flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-[#6D4627]" />
                  <span>{language === 'es' ? 'Roles de Acceso (ABAC)' : 'Access Control Roles (ABAC)'}</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div className="p-2 rounded bg-[#F3F3F1] border border-[#DADCE0]">
                    <strong className="block text-[#202124]">Staff</strong>
                    <p className="text-[#5F6368] text-[11px] mt-0.5">
                      {language === 'es' ? 'Crea órdenes y consulta sus reportes.' : 'Logs issues and views own submissions.'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#F4EFEA] border border-[#E8DEC9]">
                    <strong className="block text-[#6D4627]">Supervisor</strong>
                    <p className="text-[#5F6368] text-[11px] mt-0.5">
                      {language === 'es' ? 'Reconoce tickets, marca completado y añade fotos post-reparación.' : 'Acknowledges, completes, and attaches evidence.'}
                    </p>
                  </div>
                  <div className="p-2 rounded bg-[#F3F3F1] border border-[#DADCE0]">
                    <strong className="block text-[#202124]">Admin</strong>
                    <p className="text-[#5F6368] text-[11px] mt-0.5">
                      {language === 'es' ? 'Gestión global de villas y personal.' : 'Full management of villas and roster.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="border border-[#DADCE0] rounded-lg p-3.5 bg-white space-y-1.5">
                <h3 className="font-semibold text-xs text-[#202124]">
                  {language === 'es' ? 'Integridad Temporal y Evidencia Fotográfica' : 'Timestamps & Photo Governance'}
                </h3>
                <p className="text-[#5F6368] text-[11px] leading-relaxed">
                  {language === 'es'
                    ? 'Sellos de tiempo del servidor (request.time) en creación y resolución. Almacenamiento seguro en Cloud Storage limitado a JPG/PNG/WebP y 5 MB por archivo. Bloqueo de estado terminal al completarse.'
                    : 'Server timestamps (request.time) on creation and completion. Cloud Storage policy restricts uploads to JPG/PNG/WebP up to 5 MB. Terminal locking prevents edits once marked completed.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'rules' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-[#5F6368]">
                <span>firestore.rules</span>
                <button
                  onClick={() => copyToClipboard(sampleRules)}
                  className="flex items-center gap-1 text-[#6D4627] hover:underline cursor-pointer"
                >
                  {copied ? <Check className="w-3 h-3 text-green-600" /> : <Copy className="w-3 h-3 text-[#5F6368]" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <pre className="bg-[#202124] text-gray-200 p-3 rounded font-mono text-[11px] overflow-x-auto leading-relaxed max-h-[50vh]">
                {sampleRules}
              </pre>
            </div>
          )}

          {activeTab === 'storage' && (
            <div className="space-y-2">
              <div className="text-[#5F6368]">storage.rules</div>
              <pre className="bg-[#202124] text-gray-200 p-3 rounded font-mono text-[11px] overflow-x-auto leading-relaxed">
{`rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} { allow read, write: if false; }

    match /requests/{requestId}/{photoType}/{photoId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null &&
        (photoType == 'before' || photoType == 'after') &&
        request.resource.contentType.matches('image/(jpeg|png|webp)') &&
        request.resource.size < 5 * 1024 * 1024;
    }
  }
}`}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-[#DADCE0] bg-[#FAFAFA] flex justify-end">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded border border-[#DADCE0] bg-white hover:bg-[#F3F3F1] text-xs font-medium cursor-pointer"
          >
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
};
