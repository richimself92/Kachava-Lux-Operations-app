import React from 'react';
import { ImageOff, Loader2, X } from 'lucide-react';
import { usePhotoUrl } from '../hooks/usePhotoUrl';
import { formatCancunDateTime } from '../lib/time';
import type { Language, PhotoAttachment } from '../types';

/** Square thumbnail resolved from Storage (read access is enforced by Storage rules). */
export const PhotoThumb: React.FC<{ photo: PhotoAttachment; onClick?: () => void; className?: string }> = ({
  photo,
  onClick,
  className = '',
}) => {
  const { url, error } = usePhotoUrl(photo.path);
  return (
    <button
      type="button"
      onClick={onClick}
      title={photo.fileName}
      className={`relative border border-line rounded-sm overflow-hidden aspect-square bg-wash flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-brand/40 ${className}`}
    >
      {url ? (
        <img src={url} alt={photo.fileName} className="w-full h-full object-cover" loading="lazy" />
      ) : error ? (
        <ImageOff className="w-4 h-4 text-faint" />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin text-faint" />
      )}
    </button>
  );
};

interface PhotoLightboxProps {
  photo: PhotoAttachment | null;
  language: Language;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, language, onClose }) => {
  const { url, error } = usePhotoUrl(photo?.path);
  if (!photo) return null;
  const es = language === 'es';

  return (
    <div className="fixed inset-0 z-60 bg-ink/95 flex items-center justify-center p-0 sm:p-6 animate-fade-in" onClick={onClose}>
      <div
        className="relative w-full sm:w-auto max-w-4xl h-dvh sm:h-auto sm:max-h-[90dvh] flex flex-col bg-ink overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-ink/60 text-surface text-xs border-b border-muted">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold uppercase px-1.5 py-0.5 rounded-sm text-[10px] bg-brand">
              {photo.kind === 'before'
                ? es ? 'Evidencia inicial' : 'Initial issue'
                : photo.kind === 'reopen'
                  ? es ? 'Por corregir' : 'Still wrong'
                  : es ? 'Después de reparar' : 'After repair'}
            </span>
            <span className="truncate text-line">{photo.fileName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-faint text-[11px] hidden sm:inline">
              {photo.uploadedBy.name}
              {photo.uploadedAt ? ` · ${formatCancunDateTime(photo.uploadedAt, language)}` : ''}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-surface/20 rounded-sm text-surface transition-colors cursor-pointer" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-2 bg-ink/80 overflow-auto min-h-[200px] min-w-[280px]">
          {url ? (
            <img src={url} alt={photo.fileName} className="max-h-[75dvh] max-w-full object-contain" />
          ) : error ? (
            <div className="text-line text-xs flex items-center gap-2">
              <ImageOff className="w-4 h-4" />
              {es ? 'No se pudo cargar la foto.' : 'Could not load the photo.'}
            </div>
          ) : (
            <Loader2 className="w-6 h-6 animate-spin text-line" />
          )}
        </div>
      </div>
    </div>
  );
};
