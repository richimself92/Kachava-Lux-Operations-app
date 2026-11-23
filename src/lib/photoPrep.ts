import { ALLOWED_PHOTO_TYPES, MAX_PHOTO_BYTES } from '../../shared/domain';

export type PhotoPrepFailure = 'bad_type' | 'too_large';

export class PhotoPrepError extends Error {
  constructor(
    public readonly reason: PhotoPrepFailure,
    public readonly fileName: string,
  ) {
    super(`${reason}: ${fileName}`);
    this.name = 'PhotoPrepError';
  }
}

// Phones report JPEGs under several names, and some Android pickers report no type at all.
const TYPE_ALIASES: Record<string, string> = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'image/x-png': 'image/png',
};

const EXTENSION_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
};

/** Canonical MIME type for a picked file, or '' when it cannot be told from its metadata. */
export function resolvePhotoType(file: Pick<File, 'type' | 'name'>): string {
  const reported = file.type.trim().toLowerCase();
  if (reported) return TYPE_ALIASES[reported] ?? reported;
  const extension = file.name.includes('.') ? file.name.split('.').pop()!.toLowerCase() : '';
  return EXTENSION_TYPES[extension] ?? '';
}

// Each step trades detail for size; 2560px stays under the iOS canvas area limit.
const JPEG_ATTEMPTS = [
  { maxEdge: 2560, quality: 0.82 },
  { maxEdge: 2048, quality: 0.72 },
  { maxEdge: 1600, quality: 0.6 },
];

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image could not be decoded'));
    image.src = url;
  });
}

function renderJpeg(image: HTMLImageElement, maxEdge: number, quality: number): Promise<Blob | null> {
  const scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(image.naturalWidth * scale);
  canvas.height = Math.round(image.naturalHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) return Promise.resolve(null);
  // JPEG has no alpha channel: transparent PNG areas would otherwise turn black.
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        // Mobile Safari keeps canvas memory until the backing store is emptied.
        canvas.width = 0;
        canvas.height = 0;
        resolve(blob);
      },
      'image/jpeg',
      quality,
    );
  });
}

function jpegFileName(name: string): string {
  const base = name.replace(/\.[^.]*$/, '');
  return `${base || 'photo'}.jpg`;
}

async function reencodeAsJpeg(file: File, decodeFailure: PhotoPrepFailure): Promise<File> {
  const url = URL.createObjectURL(file);
  try {
    let image: HTMLImageElement;
    try {
      image = await loadImage(url);
    } catch {
      throw new PhotoPrepError(decodeFailure, file.name);
    }
    for (const { maxEdge, quality } of JPEG_ATTEMPTS) {
      const blob = await renderJpeg(image, maxEdge, quality);
      if (blob && blob.size <= MAX_PHOTO_BYTES) {
        return new File([blob], jpegFileName(file.name), { type: 'image/jpeg', lastModified: file.lastModified });
      }
    }
    throw new PhotoPrepError('too_large', file.name);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Makes a picked photo acceptable to the Storage rules: a correct content type and
 * at most MAX_PHOTO_BYTES. Photos that already comply keep their original bytes.
 */
export async function preparePhoto(file: File): Promise<File> {
  const type = resolvePhotoType(file);
  const isAllowed = (ALLOWED_PHOTO_TYPES as readonly string[]).includes(type);
  if (type && !isAllowed) throw new PhotoPrepError('bad_type', file.name);
  if (isAllowed && file.size <= MAX_PHOTO_BYTES) {
    return type === file.type ? file : new File([file], file.name, { type, lastModified: file.lastModified });
  }
  return reencodeAsJpeg(file, isAllowed ? 'too_large' : 'bad_type');
}

/** One at a time: decoding several full-size camera photos at once can crash a phone's tab. */
export async function preparePhotos(files: File[]): Promise<File[]> {
  const prepared: File[] = [];
  for (const file of files) prepared.push(await preparePhoto(file));
  return prepared;
}
