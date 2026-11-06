import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  History,
  Lock,
  MessageSquarePlus,
  PauseCircle,
  PlayCircle,
  Printer,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  ALLOWED_PHOTO_TYPES,
  isSupervisorRole,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS_PER_KIND,
  TRANSITIONS,
} from '../../shared/domain';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import {
  locationLabel,
  PRIORITY_STYLE,
  priorityBadge,
  prioritySla,
  requestCategoryLabel,
  STATUS_STYLE,
  statusHelp,
  statusLabel,
  ticketLabel,
  type Dict,
} from '../lib/labels';
import { auditActionLabel, auditDetailsText, auditRoleLabel } from '../lib/auditText';
import { notesToHtml } from '../lib/richText';
import { formatCancunDateTime } from '../lib/time';
import { db } from '../services/firebase';
import { PhotoValidationError, subscribeAudit } from '../services/requests';
import type { AuditLogEntry, Language, MaintenanceRequest, PhotoAttachment, PhotoKind } from '../types';
import { PhotoLightbox, PhotoThumb } from './PhotoLightbox';
import { TicketTimer } from './TicketTimer';

interface RequestDetailModalProps {
  request: MaintenanceRequest | null;
  onClose: () => void;
}

interface PendingFile {
  id: string;
  file: File;
  previewUrl: string;
}


function photoErrorText(t: Dict, err: PhotoValidationError, count: number) {
  if (err.reason === 'too_many') return t.photoCountLimit.replace('{count}', String(count));
  if (err.reason === 'too_large') return t.photoSizeError.replace('{name}', err.fileName ?? '');
  return t.photoFormatError.replace('{name}', err.fileName ?? '');
}

/** Small file picker (camera + files) with previews, shared by before/after photo inputs. */
const PhotoPicker: React.FC<{
  files: PendingFile[];
  setFiles: React.Dispatch<React.SetStateAction<PendingFile[]>>;
  maxFiles: number;
  language: Language;
  t: Dict;
  onError: (msg: string | null) => void;
  /** Rendered at the right end of the camera/files row (e.g. a submit button). */
}> = ({ files, setFiles, maxFiles, language, t, onError }) => {
  const fileRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const es = language === 'es';

  const add = (list: FileList | null) => {
    if (!list) return;
    onError(null);
    const slots = maxFiles - files.length;
    if (slots <= 0) return onError(t.photoCountLimit.replace('{count}', String(files.length)));
    const next: PendingFile[] = [];
    for (const file of Array.from(list).slice(0, slots)) {
      if (!(ALLOWED_PHOTO_TYPES as readonly string[]).includes(file.type)) return onError(t.photoFormatError.replace('{name}', file.name));
      if (file.size > MAX_PHOTO_BYTES) return onError(t.photoSizeError.replace('{name}', file.name));
      next.push({ id: Math.random().toString(36).slice(2, 9), file, previewUrl: URL.createObjectURL(file) });
    }
    setFiles((prev) => [...prev, ...next]);
  };

  const remove = (id: string) =>
    setFiles((prev) => {
      const m = prev.find((p) => p.id === id);
      if (m) URL.revokeObjectURL(m.previewUrl);
      return prev.filter((p) => p.id !== id);
    });

  const reset = (e: React.ChangeEvent<HTMLInputElement>) => {
    add(e.target.files);
    e.target.value = '';
  };

  return (
    <div className="space-y-2">
      <input ref={fileRef} type="file" multiple accept={ALLOWED_PHOTO_TYPES.join(',')} className="hidden" onChange={reset} />
      <input ref={cameraRef} type="file" accept={ALLOWED_PHOTO_TYPES.join(',')} capture="environment" className="hidden" onChange={reset} />
      {files.length < maxFiles && (
        <div className="flex flex-wrap items-center gap-2">
          {files.length < maxFiles && (
            <>
              <button
                type="button"
                onClick={() => cameraRef.current?.click()}
                className="px-2.5 py-1 bg-[#F3F3F1] hover:bg-[#E9E9E6] border border-[#DADCE0] rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-[#6D4627]" />
                <span>{es ? 'Cámara' : 'Camera'}</span>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="px-2.5 py-1 bg-[#F3F3F1] hover:bg-[#E9E9E6] border border-[#DADCE0] rounded text-xs font-medium flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[#5F6368]" />
                <span>{es ? 'Archivos' : 'Files'}</span>
              </button>
              <span className="text-[11px] text-[#5F6368]">
                {files.length}/{maxFiles}
              </span>
            </>
          )}
        </div>
      )}
      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {files.map((item) => (
            <div key={item.id} className="relative border border-[#DADCE0] rounded overflow-hidden aspect-square">
              <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="absolute top-1 right-1 p-1 bg-[#D93025] text-white rounded-full hover:bg-red-700"
                title={t.removePhoto}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const PhotoGrid: React.FC<{ photos: PhotoAttachment[]; onOpen: (p: PhotoAttachment) => void; emptyText: string }> = ({
  photos,
  onOpen,
  emptyText,
}) =>
  photos.length === 0 ? (
    <div className="text-xs text-[#70757A] italic py-1">{emptyText}</div>
  ) : (
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
      {photos.map((p) => (
        <PhotoThumb key={p.id} photo={p} onClick={() => onOpen(p)} />
      ))}
    </div>
  );

export const RequestDetailModal: React.FC<RequestDetailModalProps> = ({ request, onClose }) => {
  const { currentUser, role, language } = useAuth();
  const { changeStatus, addNote, addPhotos, isSubmitting } = useRequests();
  const t = translations[language];
  const es = language === 'es';

  const [activeTab, setActiveTab] = useState<'details' | 'audit'>('details');
  const [audit, setAudit] = useState<AuditLogEntry[] | null>(null);
  const [lightboxPhoto, setLightboxPhoto] = useState<PhotoAttachment | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const [pendingReason, setPendingReason] = useState('');
  const [showPendingForm, setShowPendingForm] = useState(false);
  const [completionNotes, setCompletionNotes] = useState('');
  const [afterFiles, setAfterFiles] = useState<PendingFile[]>([]);
  const [beforeFiles, setBeforeFiles] = useState<PendingFile[]>([]);
  const [noteText, setNoteText] = useState('');

  const reqId = request?.id;
  useEffect(() => {
    if (!reqId) return;
    setAudit(null);
    return subscribeAudit(db(), reqId, setAudit, (err) => {
      console.error('Could not load audit history', err);
      setAudit([]);
    });
  }, [reqId]);

  // Release object URLs when the modal closes.
  useEffect(
    () => () => {
      afterFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      beforeFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  if (!request || !currentUser) return null;

  const isSupervisor = isSupervisorRole(role);
  const isSubmitter = request.submittedBy.uid === currentUser.uid;
  const isOpen = request.status !== 'completada';
  const allowed = isSupervisor ? TRANSITIONS[request.status] : [];
  const canAddNote = isSupervisor ? isOpen : isSubmitter && request.status === 'sin_revisar';
  const canAddBeforePhotos = isSubmitter && request.status === 'sin_revisar' && request.beforePhotos.length < MAX_PHOTOS_PER_KIND;

  const run = async (fn: () => Promise<string | null>) => {
    setActionError(null);
    setActionSuccess(null);
    try {
      const msg = await fn();
      if (msg) setActionSuccess(msg);
    } catch (err) {
      if (err instanceof PhotoValidationError) {
        setActionError(photoErrorText(t, err, MAX_PHOTOS_PER_KIND));
      } else {
        console.error('Action failed', err);
        setActionError(es ? 'No se pudo guardar el cambio. Intente de nuevo.' : 'Could not save the change. Please try again.');
      }
    }
  };

  const failedText = (failed: string[]) => failed.map((n) => t.photoUploadFailed.replace('{name}', n)).join(' ');

  const handleTransition = (to: 'pendiente' | 'reconocida') =>
    run(async () => {
      await changeStatus(request, to, { note: to === 'pendiente' ? pendingReason : undefined });
      setPendingReason('');
      setShowPendingForm(false);
      return t.statusChangeSuccess;
    });

  const handleMarkPending = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingReason.trim()) {
      setActionError(t.pendingReasonRequired);
      return;
    }
    return handleTransition('pendiente');
  };

  const handleComplete = (e: React.FormEvent) => {
    e.preventDefault();
    if (!completionNotes.trim()) {
      setActionError(es ? 'Por favor ingrese las notas de resolución.' : 'Please enter resolution notes.');
      return;
    }
    return run(async () => {
      const { failedPhotos } = await changeStatus(request, 'completada', {
        resolutionNotes: completionNotes,
        afterPhotoFiles: afterFiles.map((f) => f.file),
      });
      afterFiles.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      setAfterFiles([]);
      setCompletionNotes('');
      return [t.completionSuccess, failedText(failedPhotos)].filter(Boolean).join(' ');
    });
  };

  const handleAddPhotos = (kind: PhotoKind, files: PendingFile[], clear: () => void) =>
    run(async () => {
      const { failedPhotos } = await addPhotos(request, kind, files.map((f) => f.file));
      files.forEach((f) => URL.revokeObjectURL(f.previewUrl));
      clear();
      return failedPhotos.length ? failedText(failedPhotos) : es ? 'Fotos agregadas.' : 'Photos added.';
    });

  const handleNote = () =>
    run(async () => {
      await addNote(request.id, noteText);
      setNoteText('');
      return t.noteAddedSuccess;
    });

  const progression: { key: MaintenanceRequest['status']; reached: boolean }[] = [
    { key: 'sin_revisar', reached: true },
    { key: 'pendiente', reached: request.status === 'pendiente' },
    { key: 'reconocida', reached: request.status === 'reconocida' || request.status === 'completada' },
    { key: 'completada', reached: request.status === 'completada' },
  ];

  const attr = (label: string, value: React.ReactNode) => (
    <div className="bg-white border border-[#DADCE0] p-2.5 rounded">
      <span className="text-[#5F6368] text-[10px] uppercase font-semibold block">{label}</span>
      <div className="font-medium text-[#202124] mt-0.5">{value}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-6 print:p-0 print:bg-white">
        <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border border-[#DADCE0] overflow-hidden my-auto max-h-[94vh] flex flex-col print:border-none print:shadow-none print:max-w-full print:max-h-none">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-[#DADCE0] flex items-center justify-between bg-[#FAFAFA] print:bg-white">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`font-mono text-base sm:text-lg font-bold ${request.ticketId ? 'text-[#202124]' : 'text-[#70757A] italic'}`}>
                {ticketLabel(t, request)}
              </span>
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[request.status]}`} title={statusHelp(t, request.status)}>
                {statusLabel(t, request.status)}
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-bold uppercase bg-[#F4EFEA] text-[#6D4627]">
                {locationLabel(t, request.location.code, request.location.name)}
              </span>
            </div>
            <div className="flex items-center gap-1.5 print:hidden">
              <button onClick={() => window.print()} className="p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded cursor-pointer" title={t.print}>
                <Printer className="w-4 h-4" />
              </button>
              <button onClick={onClose} className="p-1.5 text-[#5F6368] hover:text-[#202124] hover:bg-[#F3F3F1] rounded cursor-pointer" aria-label={t.close}>
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-[#DADCE0] px-5 bg-white text-xs font-medium print:hidden">
            {(['details', 'audit'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`py-2 px-3 border-b-2 font-semibold cursor-pointer flex items-center gap-1.5 ${
                  activeTab === tab ? 'border-[#6D4627] text-[#6D4627]' : 'border-transparent text-[#5F6368] hover:text-[#202124]'
                }`}
              >
                {tab === 'audit' && <History className="w-3.5 h-3.5" />}
                <span>{tab === 'details' ? t.requestDetailTitle : t.auditTrailTitle}</span>
                {tab === 'audit' && audit && <span className="px-1.5 rounded-full bg-[#F3F3F1] text-[10px]">{audit.length}</span>}
              </button>
            ))}
          </div>

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
              <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-[#DADCE0]">
                {audit === null && <div className="text-[#5F6368]">{t.loading}</div>}
                {audit?.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-[#6D4627] flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#6D4627]" />
                    </div>
                    <div className="bg-[#F3F3F1] border border-[#DADCE0] p-2.5 rounded text-xs space-y-0.5">
                      <div className="flex items-center justify-between gap-2 text-[#5F6368]">
                        <span className="font-semibold text-[#202124] uppercase text-[10px]">
                          {auditActionLabel(entry.action, language)}
                          {entry.action === 'status_changed' && entry.fromStatus && entry.toStatus && (
                            <span className="normal-case font-normal">
                              {' '}
                              · {statusLabel(t, entry.fromStatus)} → {statusLabel(t, entry.toStatus)}
                            </span>
                          )}
                        </span>
                        <span className="font-mono text-[11px] whitespace-nowrap">{entry.at ? formatCancunDateTime(entry.at, language) : '…'}</span>
                      </div>
                      {entry.details && <div className="text-[#202124] whitespace-pre-wrap">{auditDetailsText(t, language, entry)}</div>}
                      <div className="text-[11px] text-[#5F6368]">
                        {entry.by.name} ({auditRoleLabel(entry.by.role, language)})
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <>
                {/* Lifecycle progression */}
                <div className="grid grid-cols-4 gap-1.5 text-center text-[11px]">
                  {progression.map((p) => (
                    <div
                      key={p.key}
                      title={statusHelp(t, p.key)}
                      className={`p-1.5 rounded border font-medium ${
                        request.status === p.key ? `${STATUS_STYLE[p.key]} font-bold` : p.reached ? 'bg-white border-[#DADCE0] text-[#137333]' : 'bg-[#FAFAFA] border-[#DADCE0] text-[#70757A]'
                      }`}
                    >
                      {statusLabel(t, p.key)}
                    </div>
                  ))}
                </div>

                <TicketTimer request={request} audit={audit} t={t} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  {attr(t.filterVilla, <span className="font-bold text-[#6D4627]">{locationLabel(t, request.location.code, request.location.name)}</span>)}
                  {attr(t.filterCategory, requestCategoryLabel(t, request))}
                  {attr(
                    t.filterPriority,
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold uppercase ${PRIORITY_STYLE[request.priority]}`}>{priorityBadge(t, request.priority)}</span>
                      <span className="text-[10px] text-[#5F6368]">({prioritySla(t, request.priority)})</span>
                    </span>,
                  )}
                  {attr(t.assignedSupervisorLabel, request.assignedTo?.name ?? <span className="italic text-[#70757A]">{t.notAssignedYet}</span>)}
                </div>

                <div className="bg-white border border-[#DADCE0] p-3.5 rounded-lg space-y-2">
                  {request.locationDetail && (
                    <div className="pb-2 border-b border-[#DADCE0]">
                      <span className="text-[#5F6368] text-xs font-semibold uppercase block">{t.locationDetailLabel}</span>
                      <div className="font-medium text-[#202124] mt-0.5">{request.locationDetail}</div>
                    </div>
                  )}
                  <div>
                    <span className="text-[#5F6368] text-xs font-semibold uppercase block">{t.notesLabel}</span>
                    <div
                      className="rich-text text-[#202124] mt-0.5 leading-relaxed break-words"
                      dangerouslySetInnerHTML={{ __html: notesToHtml(request.notes) }}
                    />
                  </div>
                  <div className="pt-2 border-t border-[#DADCE0] flex flex-wrap gap-x-4 gap-y-1 justify-between text-[11px] text-[#5F6368]">
                    <span>
                      {t.submittedByLabel}: <strong className="text-[#202124]">{request.submittedBy.name}</strong>
                    </span>
                    <span>
                      {t.submissionTimeLabel}: {formatCancunDateTime(request.createdAt, language)}
                    </span>
                  </div>
                </div>

                {/* Before photos */}
                <div className="border border-[#DADCE0] rounded-lg p-3 bg-[#FAFAFA] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-xs text-[#202124] flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5 text-[#6D4627]" />
                      {t.beforePhotosTitle}
                    </span>
                    <span className="text-xs text-[#5F6368]">{request.beforePhotos.length}</span>
                  </div>
                  <PhotoGrid photos={request.beforePhotos} onOpen={setLightboxPhoto} emptyText={t.noPhotosAttached} />
                  {canAddBeforePhotos && (
                    <div className="pt-2 border-t border-[#DADCE0] space-y-2 print:hidden">
                      <PhotoPicker
                        files={beforeFiles}
                        setFiles={setBeforeFiles}
                        maxFiles={MAX_PHOTOS_PER_KIND - request.beforePhotos.length}
                        language={language}
                        t={t}
                        onError={setActionError}
                      />
                      {beforeFiles.length > 0 && (
                        <button
                          type="button"
                          disabled={isSubmitting}
                          onClick={() => handleAddPhotos('before', beforeFiles, () => setBeforeFiles([]))}
                          className="px-3 py-1 bg-[#6D4627] hover:bg-[#55361D] text-white rounded text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          {es ? 'Subir fotos' : 'Upload photos'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Add a note (below the initial photos, above the supervisor actions) */}
                {canAddNote && (
                  <div className="flex items-start gap-2 print:hidden">
                    <textarea
                      rows={1}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={2000}
                      placeholder={es ? 'Agregar una nota al historial...' : 'Add a note to the history...'}
                      className="flex-1 bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs focus:outline-hidden focus:border-[#1A73E8]"
                    />
                    <button
                      type="button"
                      onClick={handleNote}
                      disabled={isSubmitting || !noteText.trim()}
                      className="px-3 py-1.5 bg-white hover:bg-[#F3F3F1] border border-[#DADCE0] rounded text-xs font-medium flex items-center gap-1 disabled:opacity-40 cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      {t.addNoteAction}
                    </button>
                  </div>
                )}

                {request.afterPhotos.length > 0 && (
                  <div className="border border-[#137333]/30 rounded-lg p-3 bg-[#E6F4EA]/20 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-[#137333] flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.afterPhotosTitle}
                      </span>
                      <span className="text-xs text-[#137333]">{request.afterPhotos.length}</span>
                    </div>
                    <PhotoGrid photos={request.afterPhotos} onOpen={setLightboxPhoto} emptyText={t.noPhotosAttached} />
                  </div>
                )}

                {/* Completed summary (everyone) */}
                {request.status === 'completada' && (
                  <div className="bg-[#E6F4EA] border border-[#CEEAD6] p-2.5 rounded text-xs space-y-1 text-[#137333]">
                    {request.completedAt && (
                      <div>
                        <strong>{t.completedAtLabel}:</strong> {formatCancunDateTime(request.completedAt, language)}
                      </div>
                    )}
                    {request.completedBy && (
                      <div>
                        <strong>{t.completedByLabel}:</strong> {request.completedBy.name}
                      </div>
                    )}
                    {request.supervisorNotes && (
                      <div className="pt-1 border-t border-[#CEEAD6] text-[#202124] whitespace-pre-wrap">
                        <strong>{t.supervisorNotesLabel}:</strong> {request.supervisorNotes}
                      </div>
                    )}
                    <div className="text-[10px] text-[#5F6368] pt-0.5 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>{t.alreadyCompletedNotice}</span>
                    </div>
                  </div>
                )}

                {/* Supervisor lifecycle controls (staff see none). Location, category, priority and
                    supervisor are edited from the pencil in the Work Orders table. */}
                {isSupervisor && isOpen && (
                  <div className="border border-[#6D4627]/30 rounded-lg p-3.5 bg-[#F4EFEA]/30 space-y-3 print:hidden">
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 ${
                        (allowed.includes('pendiente') && showPendingForm) || allowed.includes('completada')
                          ? 'pb-2 border-b border-[#E8DEC9]'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-[#6D4627]" />
                        <h3 className="font-semibold text-xs sm:text-sm text-[#202124]">{t.supervisorWorkflowTitle}</h3>
                      </div>
                      <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                        {allowed.includes('reconocida') && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleTransition('reconocida')}
                            className="px-3.5 py-1.5 bg-[#1A73E8] hover:bg-[#1557B0] text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <PlayCircle className="w-3.5 h-3.5" />
                            {request.status === 'pendiente' ? t.actionResumeWork : t.actionStartWork}
                          </button>
                        )}
                        {allowed.includes('pendiente') && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => {
                              setActionError(null);
                              setShowPendingForm((v) => !v);
                            }}
                            aria-expanded={showPendingForm}
                            className={`px-3.5 py-1.5 border border-[#8430CE] text-[#8430CE] rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                              showPendingForm ? 'bg-[#F3E8FD]' : 'bg-white hover:bg-[#F3E8FD]'
                            }`}
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            {t.actionMarkPending}
                          </button>
                        )}
                        {allowed.includes('completada') && (
                          <button
                            type="submit"
                            form="completion-form"
                            disabled={isSubmitting}
                            className="px-3.5 py-1.5 bg-[#137333] hover:bg-[#0E5B28] text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t.confirmComplete}
                          </button>
                        )}
                      </div>
                    </div>

                    {allowed.includes('pendiente') && showPendingForm && (
                      <form onSubmit={handleMarkPending} className="bg-white p-3 rounded border border-[#8430CE]/40 space-y-2.5">
                        <div>
                          <label htmlFor="pending-reason" className="block text-xs font-semibold text-[#202124] mb-1">
                            {t.pendingReasonLabel} <span className="text-[#D93025]">*</span>
                          </label>
                          <textarea
                            id="pending-reason"
                            rows={2}
                            autoFocus
                            value={pendingReason}
                            onChange={(e) => setPendingReason(e.target.value)}
                            placeholder={t.pendingReasonPlaceholder}
                            maxLength={2000}
                            required
                            className="w-full bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs focus:outline-hidden focus:border-[#8430CE]"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={isSubmitting || !pendingReason.trim()}
                            className="px-3.5 py-1.5 bg-[#8430CE] hover:bg-[#6A26A6] text-white rounded text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <PauseCircle className="w-3.5 h-3.5" />
                            {t.confirmPending}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setShowPendingForm(false);
                              setPendingReason('');
                            }}
                            className="px-3.5 py-1.5 bg-white hover:bg-[#F3F3F1] border border-[#DADCE0] rounded text-xs font-medium cursor-pointer"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </form>
                    )}

                    {allowed.includes('completada') && (
                      <form id="completion-form" onSubmit={handleComplete} className="bg-white p-3 rounded border border-[#DADCE0] space-y-2.5">
                        <div>
                          <label htmlFor="completion-notes" className="block text-xs font-semibold text-[#202124] mb-1">
                            {t.supervisorNotesLabel} <span className="text-[#D93025]">*</span>
                          </label>
                          <textarea
                            id="completion-notes"
                            rows={2}
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            placeholder={t.supervisorNotesPlaceholder}
                            maxLength={2000}
                            className="w-full bg-white border border-[#DADCE0] rounded px-3 py-1.5 text-xs focus:outline-hidden focus:border-[#1A73E8]"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-[#202124] mb-1">{t.afterPhotosUploadLabel}</label>
                          <PhotoPicker
                            files={afterFiles}
                            setFiles={setAfterFiles}
                            maxFiles={MAX_PHOTOS_PER_KIND - request.afterPhotos.length}
                            language={language}
                            t={t}
                            onError={setActionError}
                          />
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-5 py-2.5 border-t border-[#DADCE0] bg-[#FAFAFA] flex items-center justify-between text-xs print:hidden">
            <span className="text-[#5F6368] font-mono text-[11px]">{request.id}</span>
            <button onClick={onClose} className="px-3.5 py-1.5 rounded border border-[#DADCE0] bg-white hover:bg-[#F3F3F1] font-medium cursor-pointer">
              {t.close}
            </button>
          </div>
        </div>
      </div>

      <PhotoLightbox photo={lightboxPhoto} language={language} onClose={() => setLightboxPhoto(null)} />
    </>
  );
};
