import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { MAX_PHOTOS_PER_KIND } from '../../shared/domain';
import { useNow } from '../hooks/useNow';
import { categoryOptions, locationLabel, prioritySla } from '../lib/labels';
import { PhotoPrepError, preparePhotos } from '../lib/photoPrep';
import { MAX_NOTES_LENGTH, richTextToPlain, sanitizeRichText } from '../lib/richText';
import { formatCancunDate, formatCancunTime } from '../lib/time';
import { PhotoValidationError } from '../services/requests';
import { RichTextEditor } from './RichTextEditor';
import type { MaintenanceCategory, RequestPriority, CommonAreaSubLocation } from '../types';
import { 
  X, 
  Camera, 
  Upload, 
  Trash2, 
  AlertCircle, 
  CheckCircle2, 
  Wrench, 
  Calendar, 
  User,
  Clock
} from 'lucide-react';

interface NewRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called after the request is saved; lists photo names that failed to upload. */
  onSuccess: (failedPhotos: string[]) => void;
}

interface PreviewItem {
  id: string;
  file: File;
  previewUrl: string;
}

export const NewRequestModal: React.FC<NewRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentUser, language } = useAuth();
  const { residences, createRequest } = useRequests();
  const t = translations[language];

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Form states
  const [locationCode, setLocationCode] = useState<string>('102');
  const [category, setCategory] = useState<MaintenanceCategory>('plumbing');
  const [commonAreaSubLocation, setCommonAreaSubLocation] = useState<CommonAreaSubLocation>('hall');
  const [priority, setPriority] = useState<RequestPriority>('normal');
  const [notes, setNotes] = useState('');
  const [selectedPhotos, setSelectedPhotos] = useState<PreviewItem[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isPreparingPhotos, setIsPreparingPhotos] = useState(false);

  // Live clock: the submission time is set by the server when the request is saved.
  const now = useNow(1000, isOpen);

  if (!isOpen) return null;

  // Categories from the shared domain (single source with the security rules).
  const categories = categoryOptions(t);

  // Priority options with explicit response expectations
  const priorityOptions: {
    key: RequestPriority;
    label: string;
    sla: string;
    color: string;
    activeBorder: string;
    badgeBg: string;
  }[] = [
    {
      key: 'urgent',
      label: language === 'es' ? 'Urgente' : 'Urgent',
      sla: prioritySla(t, 'urgent'),
      color: 'text-danger',
      activeBorder: 'border-danger bg-danger-wash',
      badgeBg: 'bg-danger text-surface',
    },
    {
      key: 'high',
      label: language === 'es' ? 'Alta' : 'High',
      sla: prioritySla(t, 'high'),
      color: 'text-pending',
      activeBorder: 'border-pending bg-pending-wash',
      badgeBg: 'bg-pending text-surface',
    },
    {
      key: 'normal',
      label: language === 'es' ? 'Normal' : 'Normal',
      sla: prioritySla(t, 'normal'),
      color: 'text-muted',
      activeBorder: 'border-brand bg-brand-wash',
      badgeBg: 'bg-brand text-surface',
    },
    {
      key: 'low',
      label: language === 'es' ? 'Baja' : 'Low',
      sla: prioritySla(t, 'low'),
      color: 'text-muted',
      activeBorder: 'border-muted bg-wash',
      badgeBg: 'bg-muted text-surface',
    },
  ];

  // Separate villas from other locations
  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const handleFilesAdded = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError(null);

    const currentCount = selectedPhotos.length;
    const remainingSlots = MAX_PHOTOS_PER_KIND - currentCount;

    if (remainingSlots <= 0) {
      setFormError(
        t.photoCountLimit.replace('{count}', String(currentCount))
      );
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);

    setIsPreparingPhotos(true);
    try {
      const prepared = await preparePhotos(filesArray);
      const newPreviews: PreviewItem[] = prepared.map((file) => ({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      }));
      setSelectedPhotos((prev) => [...prev, ...newPreviews]);
    } catch (err) {
      const name = err instanceof PhotoPrepError ? err.fileName : '';
      const message = err instanceof PhotoPrepError && err.reason === 'too_large' ? t.photoSizeError : t.photoFormatError;
      setFormError(message.replace('{name}', name));
    } finally {
      setIsPreparingPhotos(false);
    }
  };

  const handleRemovePhoto = (id: string) => {
    setSelectedPhotos((prev) => {
      const match = prev.find((p) => p.id === id);
      if (match) URL.revokeObjectURL(match.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const notesHtml = sanitizeRichText(notes);
    if (!richTextToPlain(notesHtml)) {
      setFormError(
        language === 'es'
          ? 'Por favor describa la incidencia.'
          : 'Please enter a description of the issue.'
      );
      return;
    }

    if (notesHtml.length > MAX_NOTES_LENGTH) {
      setFormError(
        language === 'es'
          ? 'La descripción es demasiado larga o tiene demasiado formato. Acórtela e intente de nuevo.'
          : 'The description is too long or has too much formatting. Please shorten it and try again.'
      );
      return;
    }

    try {
      setIsSubmitting(true);
      const photoFiles = selectedPhotos.map((p) => p.file);
      const { failedPhotos } = await createRequest(
        {
          locationCode,
          category,
          commonAreaSubLocation: category === 'common_areas' ? commonAreaSubLocation : undefined,
          priority,
          notes: notesHtml,
        },
        photoFiles
      );

      selectedPhotos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setNotes('');
      setSelectedPhotos([]);
      onSuccess(failedPhotos);
      onClose();
    } catch (err) {
      if (err instanceof PhotoValidationError) {
        setFormError(
          err.reason === 'too_many'
            ? t.photoCountLimit.replace('{count}', String(selectedPhotos.length))
            : err.reason === 'too_large'
              ? t.photoSizeError.replace('{name}', err.fileName ?? '')
              : t.photoFormatError.replace('{name}', err.fileName ?? ''),
        );
      } else {
        console.error('Create request failed', err);
        setFormError(language === 'es' ? 'No se pudo registrar la orden. Intente de nuevo.' : 'Could not save the work order. Please try again.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-ink/40 flex items-stretch sm:items-center justify-center sm:p-6 animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="new-request-title">
      <div className="bg-surface w-full sm:max-w-2xl h-dvh sm:h-auto sm:max-h-[92dvh] flex flex-col overflow-hidden sm:border sm:border-line rounded-none sm:rounded-sm">
        {/* Header */}
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-line pl-5 pr-2 sm:pr-3 pt-[env(safe-area-inset-top)] sm:pt-0 min-h-14">
          <div className="flex items-center gap-2.5 min-w-0">
            <Wrench className="w-4 h-4 text-brand shrink-0" strokeWidth={1.5} />
            <h2 id="new-request-title" className="text-lg text-ink truncate">
              {t.newRequestTitle}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t.cancel}
            className="inline-flex items-center justify-center w-10 h-10 shrink-0 text-muted hover:text-ink hover:bg-wash rounded-sm transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-5 space-y-5 text-sm">
          {formError && (
            <div className="p-2.5 bg-danger-wash border border-danger-line rounded-sm text-danger flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Automatic Metadata Banner */}
          <div className="border-y border-line py-3 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-3 text-sm">
            <div>
              <span className="kl-label block mb-1">
                {t.ticketIdLabel}
              </span>
              <span className="font-medium italic text-muted">
                {t.ticketAssignedOnSubmit}
              </span>
            </div>
            <div>
              <span className="kl-label block mb-1">
                {t.submittingUserLabel}
              </span>
              <span className="font-medium text-ink flex items-center gap-1">
                <User className="w-3 h-3 text-brand" />
                {currentUser?.displayName}
              </span>
            </div>
            <div>
              <span className="kl-label block mb-1">
                {t.submissionTimeLabel}
              </span>
              <span className="font-medium text-ink flex items-center gap-1 tabular-nums" aria-live="off">
                <Calendar className="w-3 h-3 text-brand" />
                {formatCancunDate(now, language)} · {formatCancunTime(now, language, true)}
              </span>
            </div>
          </div>

          {/* Grouped Location Selector (Villas + Other Locations) */}
          <div>
            <label className="block text-sm text-ink mb-1.5">
              {t.villaSelectLabel} <span className="text-danger">*</span>
            </label>
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className="w-full bg-surface border border-line rounded-sm px-3 min-h-11 text-sm text-ink focus:outline-hidden focus:border-ink cursor-pointer"
              required
            >
              <optgroup label={t.locGroupVillas}>
                {villasList.map((v) => (
                  <option key={v.id} value={v.code}>
                    {v.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t.locGroupOther}>
                {otherLocationsList.map((loc) => (
                  <option key={loc.id} value={loc.code}>
                    {locationLabel(t, loc.code, loc.name)}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Category & Common Area Secondary Selector */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-ink mb-1.5">
                {t.categoryLabel} <span className="text-danger">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                className="w-full bg-surface border border-line rounded-sm px-3 min-h-11 text-sm text-ink focus:outline-hidden focus:border-ink cursor-pointer"
                required
              >
                {categories.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Secondary location selector when Common Areas is selected */}
            {category === 'common_areas' ? (
              <div className="animate-fade-in border-l-2 border-brand pl-3 py-1">
                <label className="block text-xs font-semibold text-brand mb-1">
                  {t.commonAreaSubLocationLabel} <span className="text-danger">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label
                    className={`flex items-center justify-center gap-1.5 min-h-11 px-2 rounded-sm border cursor-pointer text-sm transition-colors ${
                      commonAreaSubLocation === 'hall'
                        ? 'bg-surface border-brand text-brand font-medium'
                        : 'bg-surface/80 border-line text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="commonAreaSub"
                      value="hall"
                      checked={commonAreaSubLocation === 'hall'}
                      onChange={() => setCommonAreaSubLocation('hall')}
                      className="sr-only"
                    />
                    <span>{t.subLocHall}</span>
                  </label>

                  <label
                    className={`flex items-center justify-center gap-1.5 min-h-11 px-2 rounded-sm border cursor-pointer text-sm transition-colors ${
                      commonAreaSubLocation === 'parking'
                        ? 'bg-surface border-brand text-brand font-medium'
                        : 'bg-surface/80 border-line text-muted'
                    }`}
                  >
                    <input
                      type="radio"
                      name="commonAreaSub"
                      value="parking"
                      checked={commonAreaSubLocation === 'parking'}
                      onChange={() => setCommonAreaSubLocation('parking')}
                      className="sr-only"
                    />
                    <span>{t.subLocParking}</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className="flex items-center text-xs text-muted italic self-end pb-2">
                <span>{language === 'es' ? 'Seleccione categoría para opciones específicas' : 'Select category for system options'}</span>
              </div>
            )}
          </div>

          {/* Priority Options with Response Expectation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-sm text-ink">
                {t.priorityLabel} <span className="text-danger">*</span>
              </label>
              <span className="text-[11px] text-muted flex items-center gap-1">
                <Clock className="w-3 h-3 text-brand" />
                <span>{language === 'es' ? 'Tiempo de respuesta asignado' : 'Target SLA response'}</span>
              </span>
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
              {priorityOptions.map((p) => {
                const isSelected = priority === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPriority(p.key)}
                    aria-pressed={isSelected}
                    className={`p-3 min-h-11 rounded-sm border text-left transition-colors cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${p.activeBorder} border-ink bg-wash`
                        : "border-line bg-surface hover:bg-wash"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-medium uppercase ${p.color}`}>
                        {p.label}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div className="mt-1 text-sm text-ink">
                      — {p.sla}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="new-request-notes" className="block text-sm text-ink mb-1.5">
              {t.notesLabel} <span className="text-danger">*</span>
            </label>
            <RichTextEditor
              id="new-request-notes"
              value={notes}
              onChange={setNotes}
              language={language}
              placeholder={t.notesPlaceholder}
              stickyTopClass="-top-5"
            />
          </div>

          {/* Photo Attachments */}
          <div className="border-t border-line pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-sm text-ink">
                  {t.photoUploadTitle}
                </label>
                <p className="text-[11px] text-muted">
                  {t.photoUploadSubtitle}
                </p>
              </div>
              <span className="text-xs font-medium text-brand bg-brand-wash px-2 py-0.5 rounded-sm">
                {selectedPhotos.length}/{MAX_PHOTOS_PER_KIND}
              </span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                if (e.target) e.target.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                if (e.target) e.target.value = '';
              }}
            />

            {isPreparingPhotos && (
              <p role="status" className="text-xs text-muted">
                {t.photoProcessing}
              </p>
            )}

            {selectedPhotos.length < MAX_PHOTOS_PER_KIND && !isPreparingPhotos && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 min-h-12 bg-surface border border-dashed border-brand hover:bg-brand-wash text-brand rounded-sm text-sm transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>{language === 'es' ? 'Tomar Foto' : 'Camera'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-2 min-h-12 bg-surface border border-dashed border-line-strong hover:bg-wash text-ink rounded-sm text-sm transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-muted" />
                  <span>{language === 'es' ? 'Seleccionar Archivos' : 'Choose Files'}</span>
                </button>
              </div>
            )}

            {selectedPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                {selectedPhotos.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative group border border-line rounded-sm overflow-hidden aspect-square"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(item.id)}
                      aria-label={t.removePhoto}
                      className="absolute top-1 right-1 inline-flex items-center justify-center w-8 h-8 bg-ink/70 text-surface rounded-sm hover:bg-danger transition-colors cursor-pointer"
                      title={t.removePhoto}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer: pinned to the bottom of the sheet, clears the home indicator */}
          <div className="sticky bottom-0 z-20 -mx-5 -mb-5 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3 bg-surface border-t border-line flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="flex-1 sm:flex-none min-h-11 px-4 text-sm rounded-sm border border-line-strong text-ink hover:bg-wash cursor-pointer disabled:opacity-50"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting || isPreparingPhotos}
              className="flex-[2] sm:flex-none min-h-11 px-5 text-sm font-medium rounded-sm bg-brand hover:bg-brand-deep text-surface transition-colors cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <span>{t.submitting}</span>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  <span>{t.submitRequest}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
