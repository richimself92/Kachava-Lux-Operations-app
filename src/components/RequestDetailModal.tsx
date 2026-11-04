import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { MaintenanceRequest, PhotoAttachment } from '../types';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  ClipboardList, 
  Camera, 
  Upload, 
  Printer, 
  History, 
  AlertCircle, 
  ShieldCheck, 
  Trash2,
  Lock
} from 'lucide-react';
import { PhotoLightbox } from './PhotoLightbox';

interface RequestDetailModalProps {
  request: MaintenanceRequest | null;
  onClose: () => void;
}

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({
  request,
  onClose,
}) => {
  const { currentUser, role, language } = useAuth();
  const { 
    acknowledgeRequest, 
    completeRequest, 
    reassignSupervisor, 
    usersList 
  } = useRequests();
  const t = translations[language];

  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoAttachment | null>(null);
  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');

  const [ackNotes, setAckNotes] = useState('');
  const [completedByName, setCompletedByName] = useState(currentUser?.displayName || 'Randel Can Chuc');
  const [completionNotes, setCompletionNotes] = useState('');
  const [afterPhotos, setAfterPhotos] = useState<{ id: string; file: File; previewUrl: string }[]>([]);
  const [selectedSupervisorId, setSelectedSupervisorId] = useState(request?.assignedSupervisorId || '');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const afterFileInputRef = useRef<HTMLInputElement>(null);
  const afterCameraInputRef = useRef<HTMLInputElement>(null);

  if (!request) return null;

  const isSupervisorOrAdmin = role === 'supervisor' || role === 'admin';
  const supervisors = usersList.filter((u) => u.role === 'supervisor' || u.role === 'admin');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return {
          label: t.statusCompleted,
          bg: 'bg-[#E6F4EA] text-[#137333] border-[#CEEAD6]',
          icon: CheckCircle2,
        };
      case 'acknowledged':
        return {
          label: t.statusAcknowledged,
          bg: 'bg-[#E8F0FE] text-[#1A73E8] border-[#D2E3FC]',
          icon: ClipboardList,
        };
      default:
        return {
          label: t.statusPending,
          bg: 'bg-[#FEF7E0] text-[#E37400] border-[#FEEFC3]',
          icon: Clock,
        };
    }
  };

  const statusBadge = getStatusBadge(request.status);
  const StatusIcon = statusBadge.icon;

  const beforePhotos = request.photos.filter((p) => p.type === 'before');
  const afterPhotosList = request.photos.filter((p) => p.type === 'after');

  const getCategoryTitle = (catKey: string) => {
    const key = `cat${catKey.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('')}`;
    return (t as any)[key] || catKey.replace('_', ' ');
  };

  const getPriorityInfo = (pri: string) => {
    switch (pri) {
      case 'urgent':
        return { label: t.pBadgeUrgent, sla: t.slaUrgent, color: 'text-[#D93025] bg-[#FCE8E6]' };
      case 'high':
        return { label: t.pBadgeHigh, sla: t.slaHigh, color: 'text-[#E37400] bg-[#FEF7E0]' };
      case 'normal':
        return { label: t.pBadgeNormal, sla: t.slaNormal, color: 'text-[#6D4627] bg-[#F4EFEA]' };
      default:
        return { label: t.pBadgeLow, sla: t.slaLow, color: 'text-[#70757A] bg-[#F1F3F4]' };
    }
  };

  const priInfo = getPriorityInfo(request.priority);

  const handleAcknowledge = async () => {
    setIsProcessing(true);
    setActionError(null);
    try {
      await acknowledgeRequest(request.id, ackNotes.trim() || undefined);
      setActionSuccess(t.acknowledgeSuccess);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to acknowledge');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionNotes.trim()) {
      setActionError(
        language === 'es'
          ? 'Por favor ingrese las notas de resolución.'
          : 'Please enter resolution notes.'
      );
      return;
    }
    if (!completedByName.trim()) {
      setActionError(
        language === 'es'
          ? 'Por favor ingrese el nombre del personal que ejecutó el trabajo.'
          : 'Please enter the technician or personnel name.'
      );
      return;
    }

    setIsProcessing(true);
    setActionError(null);
    try {
      const files = afterPhotos.map((p) => p.file);
      await completeRequest(
        request.id,
        completedByName.trim(),
        completionNotes.trim(),
        files
      );
      setActionSuccess(t.completionSuccess);
    } catch (err: any) {
      setActionError(err?.message || 'Failed to complete work order');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleAfterFilesAdded = (files: FileList | null) => {
    if (!files) return;
    setActionError(null);
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    const maxSlot = 5 - afterPhotos.length;
    if (maxSlot <= 0) {
      setActionError(t.photoCountLimit.replace('{count}', String(afterPhotos.length)));
      return;
    }

    const newItems: { id: string; file: File; previewUrl: string }[] = [];
    for (const file of Array.from(files).slice(0, maxSlot)) {
      if (!allowed.includes(file.type)) {
        setActionError(t.photoFormatError.replace('{name}', file.name));
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        setActionError(t.photoSizeError.replace('{name}', file.name));
        return;
      }
      newItems.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    setAfterPhotos((prev) => [...prev, ...newItems]);
  };

  const handleRemoveAfterPhoto = (id: string) => {
    setAfterPhotos((prev) => {
      const m = prev.find((p) => p.id === id);
      if (m) URL.revokeObjectURL(m.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleReassign = async () => {
    if (!selectedSupervisorId || selectedSupervisorId === request.assignedSupervisorId) return;
    const match = supervisors.find((s) => s.uid === selectedSupervisorId);
    if (!match) return;

    setIsProcessing(true);
    try {
      await reassignSupervisor(request.id, match.uid, match.displayName);
      setActionSuccess(language === 'es' ? 'Supervisor reasignado.' : 'Supervisor reassigned.');
    } catch (err: any) {
      setActionError(err?.message || 'Error reassigning supervisor');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white">
        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-[#DADCE0] overflow-hidden my-auto max-h-[94vh] flex flex-col print:border-none print:shadow-none print:max-w-full print:max-h-none">
          {/* Modal Header */}
          <div className="px-5 py-3.5 border-b border-[#DADCE0] flex items-center justify-between bg-[#FAFAFA] print:bg-white">
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base sm:text-lg font-bold text-[#202124]">
                {request.ticketId}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border flex items-center gap-1 ${statusBadge.bg}`}>
                <StatusIcon className="w-3.5 h-3.5" />
                <span>{statusBadge.label}</span>
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-[#F4EFEA] text-[#6D4627]">
                {request.villaName}
              </span>
            </div>

            <div className="flex items-center gap-1.5 print:hidden">
              <button
                onClick={() => window.print()}
                className="p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded transition-colors cursor-pointer"
                title={t.print}
              >
                <Printer className="w-4 h-4" />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex border-b border-[#DADCE0] px-5 bg-white text-xs font-medium print:hidden">
            <button
              onClick={() => setActiveTab('details')}
              className={`py-2 px-3 border-b-2 font-semibold cursor-pointer transition-colors ${
                activeTab === 'details'
                  ? 'border-[#6D4627] text-[#6D4627]'
                  : 'border-transparent text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              {t.requestDetailTitle}
            </button>
            <button
              onClick={() => setActiveTab('audit')}
              className={`py-2 px-3 border-b-2 font-semibold cursor-pointer transition-colors flex items-center gap-1.5 ${
                activeTab === 'audit'
                  ? 'border-[#6D4627] text-[#6D4627]'
                  : 'border-transparent text-[#5F6368] hover:text-[#202124]'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>{t.auditTrailTitle}</span>
              <span className="px-1.5 py-0.2 rounded-full bg-[#F3F3F1] text-[10px]">
                {request.auditTrail.length}
              </span>
            </button>
          </div>

          {/* Modal Content */}
          <div className="overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
            {actionError && (
              <div className="p-2.5 bg-[#FCE8E6] border border-[#FAD2CF] rounded text-[#D93025] flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}
            {actionSuccess && (
              <div className="p-2.5 bg-[#E6F4EA] border border-[#CEEAD6] rounded text-[#137333] flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {activeTab === 'audit' ? (
              /* Audit Trail Timeline */
              <div className="space-y-3">
                <div className="relative pl-6 space-y-4 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#DADCE0]">
                  {request.auditTrail.map((entry, index) => (
                    <div key={entry.id || index} className="relative">
                      <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-[#6D4627] flex items-center justify-center">
                        <div className="w-1.5 h-1.5 rounded-full bg-[#6D4627]" />
                      </div>
                      <div className="bg-[#F3F3F1] border border-[#DADCE0] p-2.5 rounded text-xs space-y-0.5">
                        <div className="flex items-center justify-between text-[#5F6368]">
                          <span className="font-semibold text-[#202124] uppercase text-[10px]">
                            {entry.action.replace('_', ' ')}
                          </span>
                          <span className="font-mono text-[11px]">
                            {new Date(entry.timestamp).toLocaleString(language === 'es' ? 'es-MX' : 'en-US')}
                          </span>
                        </div>
                        <div className="text-[#202124] font-medium">
                          {entry.details}
                        </div>
                        <div className="text-[11px] text-[#5F6368]">
                          {entry.performedByName} ({entry.performedByRole})
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              /* Details View */
              <>
                {/* Progression Bar */}
                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div
                    className={`p-2 rounded border font-medium ${
                      request.status === 'pending'
                        ? 'bg-[#FEF7E0] border-[#E37400] text-[#E37400] font-bold'
                        : 'bg-white border-[#DADCE0] text-[#137333]'
                    }`}
                  >
                    1. {t.statusPending}
                  </div>
                  <div
                    className={`p-2 rounded border font-medium ${
                      request.status === 'acknowledged'
                        ? 'bg-[#E8F0FE] border-[#1A73E8] text-[#1A73E8] font-bold'
                        : request.status === 'completed'
                        ? 'bg-white border-[#DADCE0] text-[#137333]'
                        : 'bg-[#FAFAFA] border-[#DADCE0] text-[#70757A]'
                    }`}
                  >
                    2. {t.statusAcknowledged}
                  </div>
                  <div
                    className={`p-2 rounded border font-medium ${
                      request.status === 'completed'
                        ? 'bg-[#E6F4EA] border-[#137333] text-[#137333] font-bold'
                        : 'bg-[#FAFAFA] border-[#DADCE0] text-[#70757A]'
                    }`}
                  >
                    3. {t.statusCompleted}
                  </div>
                </div>

                {/* Attributes Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div className="bg-white border border-[#DADCE0] p-2.5 rounded">
                    <span className="text-[#5F6368] text-[10px] uppercase font-semibold block">
                      {t.filterVilla}
                    </span>
                    <span className="font-bold text-sm text-[#6D4627]">
                      {request.villaName}
                    </span>
                  </div>

                  <div className="bg-white border border-[#DADCE0] p-2.5 rounded">
                    <span className="text-[#5F6368] text-[10px] uppercase font-semibold block">
                      {t.filterCategory}
                    </span>
                    <div className="font-medium text-[#202124]">
                      {getCategoryTitle(request.category)}
                      {request.commonAreaSubLocation && (
                        <span className="text-[10px] text-[#6D4627] font-semibold block">
                          ({request.commonAreaSubLocation === 'hall' ? t.subLocHall : t.subLocParking})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-[#DADCE0] p-2.5 rounded">
                    <span className="text-[#5F6368] text-[10px] uppercase font-semibold block">
                      {t.filterPriority}
                    </span>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${priInfo.color}`}>
                        {priInfo.label}
                      </span>
                      <span className="text-[10px] text-[#5F6368]">
                        ({priInfo.sla})
                      </span>
                    </div>
                  </div>

                  <div className="bg-white border border-[#DADCE0] p-2.5 rounded">
                    <span className="text-[#5F6368] text-[10px] uppercase font-semibold block">
                      {t.assignedSupervisorLabel}
                    </span>
                    <span className="font-medium text-[#202124]">
                      {request.assignedSupervisorName || (
                        <span className="italic text-[#70757A]">{t.notAssignedYet}</span>
                      )}
                    </span>
                  </div>
                </div>

                {/* Location Detail & Description */}
                <div className="bg-white border border-[#DADCE0] p-3.5 rounded-lg space-y-2">
                  <div>
                    <span className="text-[#5F6368] text-xs font-semibold uppercase block">
                      {t.locationDetailLabel}
                    </span>
                    <div className="font-medium text-[#202124] mt-0.5">
                      {request.locationDetail}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#DADCE0]">
                    <span className="text-[#5F6368] text-xs font-semibold uppercase block">
                      {t.notesLabel}
                    </span>
                    <div className="text-[#202124] whitespace-pre-wrap mt-0.5 leading-relaxed">
                      {request.notes}
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#DADCE0] flex flex-wrap items-center justify-between text-[11px] text-[#5F6368]">
                    <span>
                      {t.submittedByLabel}: <strong className="text-[#202124]">{request.submittedBy.name}</strong>
                    </span>
                    <span>
                      {t.submissionTimeLabel}: {new Date(request.createdAt).toLocaleString(language === 'es' ? 'es-MX' : 'en-US')}
                    </span>
                  </div>
                </div>

                {/* Before Photos */}
                <div className="border border-[#DADCE0] rounded-lg p-3 bg-[#FAFAFA] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#202124] flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-[#6D4627]" />
                      <span>{t.beforePhotosTitle}</span>
                    </span>
                    <span className="text-xs text-[#5F6368]">
                      {beforePhotos.length}
                    </span>
                  </div>

                  {beforePhotos.length === 0 ? (
                    <div className="text-xs text-[#70757A] italic py-1">
                      {t.noPhotosAttached}
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {beforePhotos.map((photo, i) => (
                        <div
                          key={photo.id}
                          onClick={() => setLightboxPhoto(photo)}
                          className="relative group border border-[#DADCE0] rounded overflow-hidden aspect-square cursor-pointer"
                        >
                          <img
                            src={photo.url}
                            alt={photo.fileName}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 bg-black/70 text-white text-[9px] px-1 rounded">
                            #{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* After Photos */}
                {afterPhotosList.length > 0 && (
                  <div className="border border-[#137333]/30 rounded-lg p-3 bg-[#E6F4EA]/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[#137333] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{t.afterPhotosTitle}</span>
                      </span>
                      <span className="text-xs text-[#137333]">
                        {afterPhotosList.length}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {afterPhotosList.map((photo, i) => (
                        <div
                          key={photo.id}
                          onClick={() => setLightboxPhoto(photo)}
                          className="relative group border border-[#CEEAD6] rounded overflow-hidden aspect-square cursor-pointer"
                        >
                          <img
                            src={photo.url}
                            alt={photo.fileName}
                            className="w-full h-full object-cover"
                          />
                          <span className="absolute bottom-1 left-1 bg-[#137333] text-white text-[9px] px-1 rounded font-bold">
                            Post #{i + 1}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Supervisor Workflow Actions */}
                {isSupervisorOrAdmin && (
                  <div className="border border-[#6D4627]/30 rounded-lg p-3.5 bg-[#F4EFEA]/30 space-y-3 print:hidden">
                    <div className="flex items-center justify-between pb-1.5 border-b border-[#E8DEC9]">
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#6D4627]" />
                        <h3 className="font-semibold text-xs sm:text-sm text-[#202124]">
                          {t.supervisorWorkflowTitle}
                        </h3>
                      </div>
                      <span className="text-xs font-semibold text-[#6D4627]">
                        {currentUser?.displayName} ({currentUser?.title})
                      </span>
                    </div>

                    {/* Pending -> Acknowledge */}
                    {request.status === 'pending' && (
                      <div className="space-y-2.5">
                        <p className="text-xs text-[#5F6368]">
                          {t.acknowledgeHelp}
                        </p>

                        <div>
                          <input
                            type="text"
                            value={ackNotes}
                            onChange={(e) => setAckNotes(e.target.value)}
                            placeholder={language === 'es' ? 'Notas iniciales del supervisor (opcional)...' : 'Initial supervisor notes (optional)...'}
                            className="w-full bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
                          />
                        </div>

                        <button
                          type="button"
                          onClick={handleAcknowledge}
                          disabled={isProcessing}
                          className="px-3.5 py-1.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.acknowledgeAction}</span>
                        </button>
                      </div>
                    )}

                    {/* Acknowledged -> Mark Completed */}
                    {request.status === 'acknowledged' && (
                      <form onSubmit={handleComplete} className="space-y-2.5">
                        <div className="bg-white p-3 rounded border border-[#DADCE0] space-y-2.5">
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-semibold text-[#1A73E8]">
                              {t.acknowledgedAtLabel}: {new Date(request.acknowledgedAt || '').toLocaleDateString()}
                            </span>
                            <span className="text-[#5F6368]">
                              {t.assignedSupervisorLabel}: <strong>{request.assignedSupervisorName}</strong>
                            </span>
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#202124] mb-1">
                              {t.completedByFieldLabel} <span className="text-[#D93025]">*</span>
                            </label>
                            <input
                              type="text"
                              value={completedByName}
                              onChange={(e) => setCompletedByName(e.target.value)}
                              placeholder={t.completedByPlaceholder}
                              className="w-full bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
                              required
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-semibold text-[#202124] mb-1">
                              {t.supervisorNotesLabel} <span className="text-[#D93025]">*</span>
                            </label>
                            <textarea
                              rows={2}
                              value={completionNotes}
                              onChange={(e) => setCompletionNotes(e.target.value)}
                              placeholder={t.supervisorNotesPlaceholder}
                              className="w-full bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
                              required
                            />
                          </div>

                          {/* After Photos Upload */}
                          <div>
                            <label className="block text-xs font-semibold text-[#202124] mb-1">
                              {t.afterPhotosUploadLabel}
                            </label>
                            
                            <input
                              ref={afterFileInputRef}
                              type="file"
                              multiple
                              accept="image/jpeg,image/png,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                handleAfterFilesAdded(e.target.files);
                                if (e.target) e.target.value = '';
                              }}
                            />
                            <input
                              ref={afterCameraInputRef}
                              type="file"
                              accept="image/jpeg,image/png,image/webp"
                              capture="environment"
                              className="hidden"
                              onChange={(e) => {
                                handleAfterFilesAdded(e.target.files);
                                if (e.target) e.target.value = '';
                              }}
                            />

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => afterCameraInputRef.current?.click()}
                                className="px-2.5 py-1 bg-[#F3F3F1] hover:bg-[#E9E9E6] border border-[#DADCE0] rounded text-xs font-medium text-[#202124] flex items-center gap-1 cursor-pointer"
                              >
                                <Camera className="w-3.5 h-3.5 text-[#6D4627]" />
                                <span>{language === 'es' ? 'Cámara' : 'Camera'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => afterFileInputRef.current?.click()}
                                className="px-2.5 py-1 bg-[#F3F3F1] hover:bg-[#E9E9E6] border border-[#DADCE0] rounded text-xs font-medium text-[#202124] flex items-center gap-1 cursor-pointer"
                              >
                                <Upload className="w-3.5 h-3.5 text-[#5F6368]" />
                                <span>{language === 'es' ? 'Archivos' : 'Files'}</span>
                              </button>
                            </div>

                            {afterPhotos.length > 0 && (
                              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mt-2">
                                {afterPhotos.map((item) => (
                                  <div
                                    key={item.id}
                                    className="relative group border border-[#CEEAD6] rounded overflow-hidden aspect-square"
                                  >
                                    <img
                                      src={item.previewUrl}
                                      alt="After preview"
                                      className="w-full h-full object-cover"
                                    />
                                    <button
                                      type="button"
                                      onClick={() => handleRemoveAfterPhoto(item.id)}
                                      className="absolute top-1 right-1 p-1 bg-[#D93025] text-white rounded-full hover:bg-red-700 transition-colors"
                                    >
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={isProcessing}
                          className="px-4 py-2 bg-[#137333] hover:bg-[#0E5B28] text-white rounded text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50 shadow-xs"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.confirmComplete}</span>
                        </button>
                      </form>
                    )}

                    {/* Completed Info */}
                    {request.status === 'completed' && (
                      <div className="bg-[#E6F4EA] border border-[#CEEAD6] p-2.5 rounded text-xs space-y-1 text-[#137333]">
                        <div className="font-semibold flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{t.statusCompleted}</span>
                        </div>
                        <div>
                          <strong>{t.completedAtLabel}:</strong>{' '}
                          {new Date(request.completedAt || '').toLocaleString(language === 'es' ? 'es-MX' : 'en-US')}
                        </div>
                        <div>
                          <strong>{t.completedByLabel}:</strong> {request.completedBy?.name}
                        </div>
                        {request.resolutionTimeHours && (
                          <div>
                            <strong>{t.resolutionTimeLabel}:</strong> {request.resolutionTimeHours} {t.hoursUnit}
                          </div>
                        )}
                        {request.supervisorNotes && (
                          <div className="pt-1 border-t border-[#CEEAD6] text-[#202124]">
                            <strong>{t.supervisorNotesLabel}:</strong> {request.supervisorNotes}
                          </div>
                        )}
                        <div className="text-[10px] text-[#5F6368] pt-0.5 flex items-center gap-1">
                          <Lock className="w-3 h-3" />
                          <span>{t.alreadyCompletedNotice}</span>
                        </div>
                      </div>
                    )}

                    {/* Reassign Supervisor */}
                    {request.status !== 'completed' && (
                      <div className="pt-2 border-t border-[#E8DEC9] flex flex-wrap items-center gap-2 text-xs">
                        <span className="text-[#5F6368] font-medium">{t.reassignSupervisor}:</span>
                        <select
                          value={selectedSupervisorId}
                          onChange={(e) => setSelectedSupervisorId(e.target.value)}
                          className="bg-white border border-[#DADCE0] rounded px-2 py-1 text-xs text-[#202124]"
                        >
                          <option value="">{t.selectSupervisorPlaceholder}</option>
                          {supervisors.map((s) => (
                            <option key={s.uid} value={s.uid}>
                              {s.displayName} ({s.title})
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={handleReassign}
                          disabled={isProcessing || !selectedSupervisorId || selectedSupervisorId === request.assignedSupervisorId}
                          className="px-2 py-1 bg-white hover:bg-gray-100 border border-[#DADCE0] rounded text-xs font-medium text-[#202124] disabled:opacity-40 cursor-pointer"
                        >
                          {language === 'es' ? 'Actualizar' : 'Update'}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Modal Footer */}
          <div className="px-5 py-2.5 border-t border-[#DADCE0] bg-[#FAFAFA] flex items-center justify-between text-xs print:hidden">
            <span className="text-[#5F6368] font-mono text-[11px]">
              {request.id}
            </span>
            <button
              onClick={onClose}
              className="px-3.5 py-1.5 rounded border border-[#DADCE0] bg-white hover:bg-[#F3F3F1] text-[#202124] font-medium cursor-pointer"
            >
              {t.close}
            </button>
          </div>
        </div>
      </div>

      <PhotoLightbox
        photo={lightboxPhoto}
        onClose={() => setLightboxPhoto(null)}
      />
    </>
  );
};
