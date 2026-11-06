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
      className={`relative border border-[#DADCE0] rounded overflow-hidden aspect-square bg-[#F3F3F1] flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-[#6D4627]/40 ${className}`}
    >
      {url ? (
        <img src={url} alt={photo.fileName} className="w-full h-full object-cover" loading="lazy" />
      ) : error ? (
        <ImageOff className="w-4 h-4 text-[#9AA0A6]" />
      ) : (
        <Loader2 className="w-4 h-4 animate-spin text-[#9AA0A6]" />
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
    <div className="fixed inset-0 z-60 bg-black/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6" onClick={onClose}>
      <div
        className="relative max-w-4xl max-h-[90vh] flex flex-col bg-[#202124] rounded-lg overflow-hidden border border-[#5F6368]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 text-white text-xs border-b border-[#5F6368]">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold uppercase px-1.5 py-0.5 rounded text-[10px] bg-[#6D4627]">
              {photo.kind === 'before' ? (es ? 'Evidencia inicial' : 'Initial issue') : es ? 'Después de reparar' : 'After repair'}
            </span>
            <span className="truncate text-gray-300">{photo.fileName}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-[11px] hidden sm:inline">
              {photo.uploadedBy.name}
              {photo.uploadedAt ? ` · ${formatCancunDateTime(photo.uploadedAt, language)}` : ''}
            </span>
            <button onClick={onClose} className="p-1 hover:bg-white/20 rounded text-white transition-colors cursor-pointer" aria-label="Close">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 flex items-center justify-center p-2 bg-black/80 overflow-auto min-h-[200px] min-w-[280px]">
          {url ? (
            <img src={url} alt={photo.fileName} className="max-h-[75vh] max-w-full object-contain rounded" />
          ) : error ? (
            <div className="text-gray-300 text-xs flex items-center gap-2">
              <ImageOff className="w-4 h-4" />
              {es ? 'No se pudo cargar la foto.' : 'Could not load the photo.'}
            </div>
          ) : (
            <Loader2 className="w-6 h-6 animate-spin text-gray-300" />
          )}
        </div>
      </div>
    </div>
  );
};
