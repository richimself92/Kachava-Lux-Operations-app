import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAX_PHOTO_BYTES } from '../../shared/domain';
import { PhotoPrepError, preparePhoto, preparePhotos, resolvePhotoType } from './photoPrep';

const fileOf = (size: number, name: string, type: string) => new File([new Uint8Array(size)], name, { type });

interface CanvasStub {
  width: number;
  height: number;
}

/** Fakes the browser image pipeline; blobSizes gives the output size of each encode attempt. */
function stubBrowser(blobSizes: number[], { decodes = true, width = 4000, height = 3000 } = {}) {
  const drawn: { width: number; height: number; quality: number }[] = [];
  let attempt = 0;

  class FakeImage {
    naturalWidth = width;
    naturalHeight = height;
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(_url: string) {
      queueMicrotask(() => (decodes ? this.onload?.() : this.onerror?.()));
    }
  }

  vi.stubGlobal('Image', FakeImage);
  vi.stubGlobal('document', {
    createElement: () => {
      const canvas: CanvasStub & Record<string, unknown> = {
        width: 0,
        height: 0,
        getContext: () => ({ fillRect: () => undefined, drawImage: () => undefined, fillStyle: '' }),
        toBlob: (done: (b: Blob | null) => void, _type: string, quality: number) => {
          drawn.push({ width: canvas.width, height: canvas.height, quality });
          done(new Blob([new Uint8Array(blobSizes[attempt++] ?? 0)], { type: 'image/jpeg' }));
        },
      };
      return canvas;
    },
  });
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:fake');
  const revoke = vi.spyOn(URL, 'revokeObjectURL').mockReturnValue(undefined);
  return { drawn, revoke };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolvePhotoType', () => {
  it('canonicalizes the aliases and casing phones report', () => {
    expect(resolvePhotoType({ type: 'image/jpg', name: 'a.jpg' })).toBe('image/jpeg');
    expect(resolvePhotoType({ type: 'IMAGE/JPEG', name: 'a.jpg' })).toBe('image/jpeg');
  });

  it('falls back to the extension when the browser reports no type', () => {
    expect(resolvePhotoType({ type: '', name: 'IMG_1.JPG' })).toBe('image/jpeg');
    expect(resolvePhotoType({ type: '', name: 'shot.heic' })).toBe('image/heic');
  });

  it('returns empty when neither type nor a known extension is available', () => {
    expect(resolvePhotoType({ type: '', name: '1000001234' })).toBe('');
  });
});

describe('preparePhoto', () => {
  it('returns compliant photos untouched', async () => {
    const file = fileOf(1024, 'a.jpg', 'image/jpeg');
    await expect(preparePhoto(file)).resolves.toBe(file);
  });

  it('fixes a missing content type without re-encoding', async () => {
    const out = await preparePhoto(fileOf(1024, 'a.jpg', ''));
    expect(out.type).toBe('image/jpeg');
    expect(out.size).toBe(1024);
    expect(out.name).toBe('a.jpg');
  });

  it('keeps rejecting PDF and HEIC with a format error', async () => {
    await expect(preparePhoto(fileOf(10, 'a.pdf', 'application/pdf'))).rejects.toMatchObject({ reason: 'bad_type' });
    await expect(preparePhoto(fileOf(10, 'a.heic', 'image/heic'))).rejects.toMatchObject({ reason: 'bad_type' });
    await expect(preparePhoto(fileOf(10, 'a.heic', ''))).rejects.toMatchObject({ reason: 'bad_type' });
  });

  it('shrinks an oversized camera photo to a JPEG within the limit', async () => {
    const { drawn, revoke } = stubBrowser([2_000_000]);
    const out = await preparePhoto(fileOf(MAX_PHOTO_BYTES + 1, 'camera.png', 'image/png'));
    expect(out).toMatchObject({ name: 'camera.jpg', type: 'image/jpeg', size: 2_000_000 });
    expect(drawn[0]).toMatchObject({ width: 2560, height: 1920 });
    expect(revoke).toHaveBeenCalledWith('blob:fake');
  });

  it('steps down until the output fits', async () => {
    const { drawn } = stubBrowser([MAX_PHOTO_BYTES + 1, 3_000_000]);
    const out = await preparePhoto(fileOf(MAX_PHOTO_BYTES + 1, 'a.jpg', 'image/jpeg'));
    expect(out.size).toBe(3_000_000);
    expect(drawn).toHaveLength(2);
    expect(drawn[1].width).toBe(2048);
  });

  it('never upscales small images', async () => {
    const { drawn } = stubBrowser([1000], { width: 800, height: 600 });
    await preparePhoto(fileOf(MAX_PHOTO_BYTES + 1, 'a.jpg', 'image/jpeg'));
    expect(drawn[0]).toMatchObject({ width: 800, height: 600 });
  });

  it('reports too_large when no attempt fits', async () => {
    const big = MAX_PHOTO_BYTES + 1;
    stubBrowser([big, big, big]);
    await expect(preparePhoto(fileOf(big, 'a.jpg', 'image/jpeg'))).rejects.toMatchObject({ reason: 'too_large', fileName: 'a.jpg' });
  });

  it('reports the right error when the image cannot be decoded', async () => {
    stubBrowser([], { decodes: false });
    await expect(preparePhoto(fileOf(MAX_PHOTO_BYTES + 1, 'a.jpg', 'image/jpeg'))).rejects.toMatchObject({ reason: 'too_large' });
    await expect(preparePhoto(fileOf(100, '1000001234', ''))).rejects.toMatchObject({ reason: 'bad_type' });
  });

  it('converts an untyped, extensionless image that decodes', async () => {
    stubBrowser([1000]);
    const out = await preparePhoto(fileOf(100, '1000001234', ''));
    expect(out).toMatchObject({ name: '1000001234.jpg', type: 'image/jpeg' });
  });
});

describe('preparePhotos', () => {
  it('fails the batch on the first invalid file', async () => {
    const batch = [fileOf(10, 'a.jpg', 'image/jpeg'), fileOf(10, 'b.pdf', 'application/pdf')];
    await expect(preparePhotos(batch)).rejects.toBeInstanceOf(PhotoPrepError);
  });
});
