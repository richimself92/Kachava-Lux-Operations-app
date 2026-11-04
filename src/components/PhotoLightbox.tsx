import React from 'react';
import { X, Download, ExternalLink } from 'lucide-react';
import { PhotoAttachment } from '../types';

interface PhotoLightboxProps {
  photo: PhotoAttachment | null;
  onClose: () => void;
}

export const PhotoLightbox: React.FC<PhotoLightboxProps> = ({ photo, onClose }) => {
  if (!photo) return null;

  return (
    <div 
      className="fixed inset-0 z-60 bg-black/90 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="relative max-w-4xl max-h-[90vh] flex flex-col bg-[#202124] rounded-lg overflow-hidden border border-[#5F6368]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-black/60 text-white text-xs border-b border-[#5F6368]">
          <div className="flex items-center gap-2 truncate">
            <span className="font-semibold uppercase px-1.5 py-0.5 rounded text-[10px] bg-[#6D4627]">
              {photo.type === 'before' ? 'Initial Issue Evidence' : 'After-Repair Evidence'}
            </span>
            <span className="truncate text-gray-300">{photo.fileName}</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-gray-400 text-[11px] hidden sm:inline">
              Uploaded by {photo.uploadedByName} ({new Date(photo.uploadedAt).toLocaleTimeString()})
            </span>
            <button
              onClick={onClose}
              className="p-1 hover:bg-white/20 rounded text-white transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Image Display */}
        <div className="flex-1 flex items-center justify-center p-2 bg-black/80 overflow-auto">
          <img
            src={photo.url}
            alt={photo.fileName}
            className="max-h-[75vh] max-w-full object-contain rounded"
          />
        </div>
      </div>
    </div>
  );
};
