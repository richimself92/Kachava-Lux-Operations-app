import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  CheckCircle2,
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
                className="min-h-10 px-3 bg-surface hover:bg-wash border border-line-strong rounded-sm text-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-brand" />
                <span>{es ? 'Cámara' : 'Camera'}</span>
              </button>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="min-h-10 px-3 bg-surface hover:bg-wash border border-line-strong rounded-sm text-sm flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-muted" />
                <span>{es ? 'Archivos' : 'Files'}</span>
              </button>
              <span className="text-[11px] text-muted">
                {files.length}/{maxFiles}
              </span>
            </>
          )}
        </div>
      )}
      {files.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {files.map((item) => (
            <div key={item.id} className="relative border border-line rounded-sm overflow-hidden aspect-square">
              <img src={item.previewUrl} alt={item.file.name} className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="absolute top-1 right-1 inline-flex items-center justify-center w-8 h-8 bg-ink/70 text-surface rounded-sm hover:bg-danger cursor-pointer"
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
    <div className="text-xs text-muted italic py-1">{emptyText}</div>
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
    <div className="min-w-0 py-3 border-t border-line">
      <span className="kl-label block">{label}</span>
      <div className="text-ink mt-1 break-words">{value}</div>
    </div>
  );

  return (
    <>
      <div className="fixed inset-0 z-50 bg-ink/40 flex items-stretch sm:items-center justify-center sm:p-6 animate-fade-in print:p-0 print:bg-surface" role="dialog" aria-modal="true">
        <div className="bg-surface w-full sm:max-w-3xl h-dvh sm:h-auto sm:max-h-[92dvh] flex flex-col overflow-hidden sm:border sm:border-line rounded-none sm:rounded-sm print:border-none print:max-w-full print:max-h-none print:h-auto">
          {/* Header */}
          <div className="shrink-0 border-b border-line pl-5 pr-2 sm:pr-3 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-4 pb-3 flex items-start justify-between gap-3 print:bg-surface">
            <div className="min-w-0">
              <div className="kl-label truncate">{locationLabel(t, request.location.code, request.location.name)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className={`font-display text-xl sm:text-2xl tabular-nums ${request.ticketId ? 'text-ink' : 'text-muted italic'}`}>
                  {ticketLabel(t, request)}
                </span>
                <span className={`px-2 py-0.5 rounded-sm text-[11px] font-medium border ${STATUS_STYLE[request.status]}`} title={statusHelp(t, request.status)}>
                  {statusLabel(t, request.status)}
                </span>
              </div>
            </div>
            <div className="flex items-center print:hidden -mt-1">
              <button
                onClick={() => window.print()}
                className="hidden sm:inline-flex items-center justify-center w-10 h-10 text-muted hover:text-ink hover:bg-wash rounded-sm cursor-pointer"
                title={t.print}
                aria-label={t.print}
              >
                <Printer className="w-4 h-4" strokeWidth={1.5} />
              </button>
              <button
                onClick={onClose}
                className="inline-flex items-center justify-center w-10 h-10 text-muted hover:text-ink hover:bg-wash rounded-sm cursor-pointer"
                aria-label={t.close}
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="shrink-0 flex border-b border-line px-5 text-sm print:hidden" role="tablist">
            {(['details', 'audit'] as const).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={`min-h-11 mr-5 -mb-px border-b cursor-pointer flex items-center gap-1.5 transition-colors ${
                  activeTab === tab ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span>{tab === 'details' ? t.requestDetailTitle : t.auditTrailTitle}</span>
                {tab === 'audit' && audit && <span className="text-xs tabular-nums text-muted">{audit.length}</span>}
              </button>
            ))}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-5 space-y-5 text-sm">
            {actionError && (
              <div className="p-2.5 bg-danger-wash border border-danger-line rounded-sm text-danger flex items-start gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionError}</span>
              </div>
            )}
            {actionSuccess && (
              <div className="p-2.5 bg-ok-wash border border-ok-line rounded-sm text-ok flex items-start gap-2 text-xs">
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{actionSuccess}</span>
              </div>
            )}

            {activeTab === 'audit' ? (
              <div className="relative pl-6 space-y-3 before:content-[''] before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-line">
                {audit === null && <div className="text-muted">{t.loading}</div>}
                {audit?.map((entry) => (
                  <div key={entry.id} className="relative">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-surface border-2 border-brand flex items-center justify-center">
                      <div className="w-1.5 h-1.5 rounded-full bg-brand" />
                    </div>
                    <div className="bg-surface border border-line p-3 rounded-sm text-xs space-y-1">
                      <div className="flex items-center justify-between gap-2 text-muted">
                        <span className="font-semibold text-ink uppercase text-[10px]">
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
                      {entry.details && <div className="text-ink whitespace-pre-wrap">{auditDetailsText(t, language, entry)}</div>}
                      <div className="text-[11px] text-muted">
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
                      className={`p-1.5 rounded-sm border font-medium ${
                        request.status === p.key ? `${STATUS_STYLE[p.key]} font-medium` : p.reached ? 'bg-surface border-line text-ok' : 'bg-wash border-line text-muted'
                      }`}
                    >
                      {statusLabel(t, p.key)}
                    </div>
                  ))}
                </div>

                <TicketTimer request={request} audit={audit} t={t} />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-5 text-sm">
                  {attr(t.filterVilla, <span className="font-medium text-brand">{locationLabel(t, request.location.code, request.location.name)}</span>)}
                  {attr(t.filterCategory, requestCategoryLabel(t, request))}
                  {attr(
                    t.filterPriority,
                    <span className="flex flex-wrap items-center gap-1">
                      <span className={`px-1.5 py-0.5 rounded-sm text-[11px] font-medium uppercase ${PRIORITY_STYLE[request.priority]}`}>{priorityBadge(t, request.priority)}</span>
                      <span className="text-[10px] text-muted">({prioritySla(t, request.priority)})</span>
                    </span>,
                  )}
                  {attr(t.assignedSupervisorLabel, request.assignedTo?.name ?? <span className="italic text-muted">{t.notAssignedYet}</span>)}
                </div>

                <div className="border-t border-line pt-4 space-y-3">
                  {request.locationDetail && (
                    <div className="pb-2 border-b border-line">
                      <span className="kl-label block">{t.locationDetailLabel}</span>
                      <div className="font-medium text-ink mt-0.5">{request.locationDetail}</div>
                    </div>
                  )}
                  <div>
                    <span className="kl-label block">{t.notesLabel}</span>
                    <div
                      className="rich-text text-ink mt-1.5 text-[15px] leading-[1.75] break-words"
                      dangerouslySetInnerHTML={{ __html: notesToHtml(request.notes) }}
                    />
                  </div>
                  <div className="pt-3 border-t border-line flex flex-wrap gap-x-4 gap-y-1 justify-between text-xs text-muted">
                    <span>
                      {t.submittedByLabel}: <strong className="text-ink">{request.submittedBy.name}</strong>
                    </span>
                    <span>
                      {t.submissionTimeLabel}: {formatCancunDateTime(request.createdAt, language)}
                    </span>
                  </div>
                </div>

                {/* Before photos */}
                <div className="border-t border-line pt-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="kl-label flex items-center gap-1.5">
                      <Camera className="w-3.5 h-3.5" strokeWidth={1.5} />
                      {t.beforePhotosTitle}
                    </span>
                    <span className="text-xs text-muted">{request.beforePhotos.length}</span>
                  </div>
                  <PhotoGrid photos={request.beforePhotos} onOpen={setLightboxPhoto} emptyText={t.noPhotosAttached} />
                  {canAddBeforePhotos && (
                    <div className="pt-2 border-t border-line space-y-2 print:hidden">
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
                          className="min-h-10 px-4 bg-brand hover:bg-brand-deep text-surface rounded-sm text-sm font-medium cursor-pointer disabled:opacity-50"
                        >
                          {es ? 'Subir fotos' : 'Upload photos'}
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Add a note (below the initial photos, above the supervisor actions) */}
                {canAddNote && (
                  <div className="flex flex-col sm:flex-row sm:items-start gap-2 print:hidden">
                    <textarea
                      rows={1}
                      value={noteText}
                      onChange={(e) => setNoteText(e.target.value)}
                      maxLength={2000}
                      placeholder={es ? 'Agregar una nota al historial...' : 'Add a note to the history...'}
                      className="flex-1 min-h-11 bg-surface border border-line rounded-sm px-3 py-2.5 text-sm focus:outline-hidden focus:border-ink"
                    />
                    <button
                      type="button"
                      onClick={handleNote}
                      disabled={isSubmitting || !noteText.trim()}
                      className="min-h-11 px-4 bg-surface hover:bg-wash border border-line-strong rounded-sm text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
                    >
                      <MessageSquarePlus className="w-3.5 h-3.5" />
                      {t.addNoteAction}
                    </button>
                  </div>
                )}

                {request.afterPhotos.length > 0 && (
                  <div className="border-t border-ok-line pt-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-ok flex items-center gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        {t.afterPhotosTitle}
                      </span>
                      <span className="text-xs text-ok">{request.afterPhotos.length}</span>
                    </div>
                    <PhotoGrid photos={request.afterPhotos} onOpen={setLightboxPhoto} emptyText={t.noPhotosAttached} />
                  </div>
                )}

                {/* Completed summary (everyone) */}
                {request.status === 'completada' && (
                  <div className="bg-ok-wash/60 border-l-2 border-ok px-3.5 py-3 text-sm space-y-1.5 text-ok">
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
                      <div className="pt-1 border-t border-ok-line text-ink whitespace-pre-wrap">
                        <strong>{t.supervisorNotesLabel}:</strong> {request.supervisorNotes}
                      </div>
                    )}
                    <div className="text-[10px] text-muted pt-0.5 flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>{t.alreadyCompletedNotice}</span>
                    </div>
                  </div>
                )}

                {/* Supervisor lifecycle controls (staff see none). Location, category, priority and
                    supervisor are edited from the pencil in the Work Orders table. */}
                {isSupervisor && isOpen && (
                  <div className="border-t-2 border-brand pt-4 space-y-4 print:hidden">
                    <div
                      className={`flex flex-wrap items-center justify-between gap-2 ${
                        (allowed.includes('pendiente') && showPendingForm) || allowed.includes('completada')
                          ? 'pb-2 border-b border-line'
                          : ''
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-brand" strokeWidth={1.5} />
                        <h3 className="text-base text-ink">{t.supervisorWorkflowTitle}</h3>
                      </div>
                      <div className="grid grid-cols-1 w-full sm:w-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end gap-2 sm:ml-auto">
                        {allowed.includes('reconocida') && (
                          <button
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleTransition('reconocida')}
                            className="min-h-11 px-4 justify-center bg-info hover:bg-info-deep text-surface rounded-sm text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                            className={`min-h-11 px-4 justify-center border border-plum text-plum rounded-sm text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                              showPendingForm ? 'bg-plum-wash' : 'bg-surface hover:bg-plum-wash'
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
                            className="min-h-11 px-4 justify-center bg-ok hover:bg-ok-deep text-surface rounded-sm text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {t.confirmComplete}
                          </button>
                        )}
                      </div>
                    </div>

                    {allowed.includes('pendiente') && showPendingForm && (
                      <form onSubmit={handleMarkPending} className="border-l-2 border-plum pl-4 py-1 space-y-3">
                        <div>
                          <label htmlFor="pending-reason" className="block text-xs font-semibold text-ink mb-1">
                            {t.pendingReasonLabel} <span className="text-danger">*</span>
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
                            className="w-full bg-surface border border-line rounded-sm px-3 py-2.5 text-sm focus:outline-hidden focus:border-plum"
                          />
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="submit"
                            disabled={isSubmitting || !pendingReason.trim()}
                            className="min-h-11 px-4 justify-center bg-plum hover:bg-plum-deep text-surface rounded-sm text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
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
                            className="min-h-11 px-4 justify-center bg-surface hover:bg-wash border border-line rounded-sm text-xs font-medium cursor-pointer"
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </form>
                    )}

                    {allowed.includes('completada') && (
                      <form id="completion-form" onSubmit={handleComplete} className="border-l-2 border-ok pl-4 py-1 space-y-3">
                        <div>
                          <label htmlFor="completion-notes" className="block text-xs font-semibold text-ink mb-1">
                            {t.supervisorNotesLabel} <span className="text-danger">*</span>
                          </label>
                          <textarea
                            id="completion-notes"
                            rows={2}
                            value={completionNotes}
                            onChange={(e) => setCompletionNotes(e.target.value)}
                            placeholder={t.supervisorNotesPlaceholder}
                            maxLength={2000}
                            className="w-full bg-surface border border-line rounded-sm px-3 py-2.5 text-sm focus:outline-hidden focus:border-ink"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-ink mb-1">{t.afterPhotosUploadLabel}</label>
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

          <div className="shrink-0 px-5 pt-2.5 pb-[calc(0.625rem+env(safe-area-inset-bottom))] sm:pb-2.5 border-t border-line bg-surface flex items-center justify-between gap-3 text-xs print:hidden">
            <span className="text-faint font-mono text-[11px] truncate">{request.id}</span>
            <button onClick={onClose} className="shrink-0 min-h-10 px-4 rounded-sm border border-line-strong bg-surface hover:bg-wash text-sm cursor-pointer">
              {t.close}
            </button>
          </div>
        </div>
      </div>

      <PhotoLightbox photo={lightboxPhoto} language={language} onClose={() => setLightboxPhoto(null)} />
    </>
  );
};
