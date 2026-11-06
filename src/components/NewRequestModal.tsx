import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useRequests } from '../context/RequestContext';
import { translations } from '../i18n/translations';
import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES, MAX_PHOTOS_PER_KIND } from '../../shared/domain';
import { useNow } from '../hooks/useNow';
import { categoryOptions, locationLabel, prioritySla } from '../lib/labels';
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
      color: 'text-[#D93025]',
      activeBorder: 'border-[#D93025] bg-[#FCE8E6]',
      badgeBg: 'bg-[#D93025] text-white',
    },
    {
      key: 'high',
      label: language === 'es' ? 'Alta' : 'High',
      sla: prioritySla(t, 'high'),
      color: 'text-[#E37400]',
      activeBorder: 'border-[#E37400] bg-[#FEF7E0]',
      badgeBg: 'bg-[#E37400] text-white',
    },
    {
      key: 'normal',
      label: language === 'es' ? 'Normal' : 'Normal',
      sla: prioritySla(t, 'normal'),
      color: 'text-[#5F6368]',
      activeBorder: 'border-[#6D4627] bg-[#F4EFEA]',
      badgeBg: 'bg-[#6D4627] text-white',
    },
    {
      key: 'low',
      label: language === 'es' ? 'Baja' : 'Low',
      sla: prioritySla(t, 'low'),
      color: 'text-[#70757A]',
      activeBorder: 'border-[#70757A] bg-[#F1F3F4]',
      badgeBg: 'bg-[#70757A] text-white',
    },
  ];

  // Separate villas from other locations
  const villasList = residences.filter((r) => r.type === 'villa');
  const otherLocationsList = residences.filter((r) => r.type === 'facility');

  const handleFilesAdded = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setFormError(null);

    const allowedTypes: readonly string[] = ALLOWED_PHOTO_TYPES;
    const maxSizeBytes = MAX_PHOTO_BYTES;

    const currentCount = selectedPhotos.length;
    const remainingSlots = MAX_PHOTOS_PER_KIND - currentCount;

    if (remainingSlots <= 0) {
      setFormError(
        t.photoCountLimit.replace('{count}', String(currentCount))
      );
      return;
    }

    const filesArray = Array.from(files).slice(0, remainingSlots);
    const newPreviews: PreviewItem[] = [];

    for (const file of filesArray) {
      if (!allowedTypes.includes(file.type)) {
        setFormError(t.photoFormatError.replace('{name}', file.name));
        return;
      }
      if (file.size > maxSizeBytes) {
        setFormError(t.photoSizeError.replace('{name}', file.name));
        return;
      }

      newPreviews.push({
        id: Math.random().toString(36).substring(2, 9),
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }

    setSelectedPhotos((prev) => [...prev, ...newPreviews]);
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
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/50 backdrop-blur-2xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full border border-[#DADCE0] overflow-hidden my-auto max-h-[94vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#DADCE0] flex items-center justify-between bg-[#FAFAFA]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-[#F4EFEA] text-[#6D4627] rounded-md">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[#202124]">
                {t.newRequestTitle}
              </h2>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-[#5F6368] hover:text-[#202124] rounded-md transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4 text-xs sm:text-sm">
          {formError && (
            <div className="p-2.5 bg-[#FCE8E6] border border-[#FAD2CF] rounded text-[#D93025] flex items-start gap-2 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* Automatic Metadata Banner */}
          <div className="bg-[#F3F3F1] border border-[#DADCE0] rounded p-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <span className="text-[#5F6368] block text-[10px] uppercase font-semibold">
                {t.ticketIdLabel}
              </span>
              <span className="font-medium italic text-[#5F6368]">
                {t.ticketAssignedOnSubmit}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block text-[10px] uppercase font-semibold">
                {t.submittingUserLabel}
              </span>
              <span className="font-medium text-[#202124] flex items-center gap-1">
                <User className="w-3 h-3 text-[#6D4627]" />
                {currentUser?.displayName}
              </span>
            </div>
            <div>
              <span className="text-[#5F6368] block text-[10px] uppercase font-semibold">
                {t.submissionTimeLabel}
              </span>
              <span className="font-medium text-[#202124] flex items-center gap-1 tabular-nums" aria-live="off">
                <Calendar className="w-3 h-3 text-[#6D4627]" />
                {formatCancunDate(now, language)} · {formatCancunTime(now, language, true)}
              </span>
            </div>
          </div>

          {/* Grouped Location Selector (Villas + Other Locations) */}
          <div>
            <label className="block text-xs font-semibold text-[#202124] mb-1">
              {t.villaSelectLabel} <span className="text-[#D93025]">*</span>
            </label>
            <select
              value={locationCode}
              onChange={(e) => setLocationCode(e.target.value)}
              className="w-full bg-white border border-[#DADCE0] rounded px-3 py-2 text-sm text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
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
              <label className="block text-xs font-semibold text-[#202124] mb-1">
                {t.categoryLabel} <span className="text-[#D93025]">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as MaintenanceCategory)}
                className="w-full bg-white border border-[#DADCE0] rounded px-3 py-2 text-sm text-[#202124] focus:outline-hidden focus:border-[#1A73E8]"
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
              <div className="animate-fade-in bg-[#F4EFEA] border border-[#E8DEC9] p-2.5 rounded">
                <label className="block text-xs font-semibold text-[#6D4627] mb-1">
                  {t.commonAreaSubLocationLabel} <span className="text-[#D93025]">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <label
                    className={`flex items-center justify-center gap-1.5 p-2 rounded border cursor-pointer text-xs font-medium transition-colors ${
                      commonAreaSubLocation === 'hall'
                        ? 'bg-white border-[#6D4627] text-[#6D4627] font-bold shadow-2xs'
                        : 'bg-white/80 border-[#DADCE0] text-[#5F6368]'
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
                    className={`flex items-center justify-center gap-1.5 p-2 rounded border cursor-pointer text-xs font-medium transition-colors ${
                      commonAreaSubLocation === 'parking'
                        ? 'bg-white border-[#6D4627] text-[#6D4627] font-bold shadow-2xs'
                        : 'bg-white/80 border-[#DADCE0] text-[#5F6368]'
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
              <div className="flex items-center text-xs text-[#5F6368] italic self-end pb-2">
                <span>{language === 'es' ? 'Seleccione categoría para opciones específicas' : 'Select category for system options'}</span>
              </div>
            )}
          </div>

          {/* Priority Options with Response Expectation */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold text-[#202124]">
                {t.priorityLabel} <span className="text-[#D93025]">*</span>
              </label>
              <span className="text-[11px] text-[#5F6368] flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#6D4627]" />
                <span>{language === 'es' ? 'Tiempo de respuesta asignado' : 'Target SLA response'}</span>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {priorityOptions.map((p) => {
                const isSelected = priority === p.key;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPriority(p.key)}
                    className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? `${p.activeBorder} ring-2 ring-current font-medium shadow-2xs`
                        : 'border-[#DADCE0] bg-white hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-bold uppercase ${p.color}`}>
                        {p.label}
                      </span>
                      {isSelected && (
                        <span className="w-2 h-2 rounded-full bg-current" />
                      )}
                    </div>
                    <div className="mt-1 text-xs font-semibold text-[#202124]">
                      — {p.sla}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="new-request-notes" className="block text-xs font-semibold text-[#202124] mb-1">
              {t.notesLabel} <span className="text-[#D93025]">*</span>
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
          <div className="border border-[#DADCE0] rounded-lg p-3 bg-[#FAFAFA] space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <label className="block text-xs font-semibold text-[#202124]">
                  {t.photoUploadTitle}
                </label>
                <p className="text-[11px] text-[#5F6368]">
                  {t.photoUploadSubtitle}
                </p>
              </div>
              <span className="text-xs font-medium text-[#6D4627] bg-[#F4EFEA] px-2 py-0.5 rounded">
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
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                handleFilesAdded(e.target.files);
                if (e.target) e.target.value = '';
              }}
            />

            {selectedPhotos.length < MAX_PHOTOS_PER_KIND && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 p-2 bg-white border border-dashed border-[#6D4627] hover:bg-[#F4EFEA] text-[#6D4627] font-medium rounded text-xs transition-colors cursor-pointer"
                >
                  <Camera className="w-4 h-4" />
                  <span>{language === 'es' ? 'Tomar Foto' : 'Camera'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center justify-center gap-1.5 p-2 bg-white border border-dashed border-[#DADCE0] hover:bg-[#F3F3F1] text-[#202124] font-medium rounded text-xs transition-colors cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-[#5F6368]" />
                  <span>{language === 'es' ? 'Seleccionar Archivos' : 'Choose Files'}</span>
                </button>
              </div>
            )}

            {selectedPhotos.length > 0 && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 pt-1">
                {selectedPhotos.map((item, index) => (
                  <div
                    key={item.id}
                    className="relative group border border-[#DADCE0] rounded overflow-hidden aspect-square"
                  >
                    <img
                      src={item.previewUrl}
                      alt={`Photo ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemovePhoto(item.id)}
                      className="absolute top-1 right-1 p-1 bg-[#D93025] text-white rounded-full hover:bg-red-700 transition-colors"
                      title={t.removePhoto}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="pt-2 border-t border-[#DADCE0] flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-3 py-1.5 text-xs font-medium rounded border border-[#DADCE0] text-[#5F6368] hover:bg-[#F3F3F1] cursor-pointer"
            >
              {t.cancel}
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-xs sm:text-sm font-medium rounded bg-[#6D4627] hover:bg-[#55361D] text-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
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
