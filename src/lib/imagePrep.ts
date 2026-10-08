/**
 * Shrinking and re-encoding an image before it is uploaded as a profile image.
 *
 * Redrawing is the point, more than the size: the bytes that leave are pixels
 * only, so EXIF (location included) is gone whatever eHagaki's compression
 * setting is — it hands the original on untouched when it decides not to
 * compress. Orientation survives because `createImageBitmap` applies it.
 */

/** Long-edge caps. Avatars are drawn small everywhere, banners full width. */
export const MAX_EDGE = { picture: 1024, banner: 1920 } as const;

const QUALITY = 0.9;

/** Thrown when the browser cannot decode the file (HEIC outside Safari, say). */
export class ImageDecodeError extends Error {
  constructor() {
    super('この画像形式は読み込めません');
    this.name = 'ImageDecodeError';
  }
}

/** The size to draw at: within `maxEdge` on the long side, never enlarged. */
export function fitWithin(
  width: number,
  height: number,
  maxEdge: number
): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

/**
 * Encodings to try, best first. WebP keeps transparency at a small size; Safari
 * cannot encode it from a canvas, and then a source that may be transparent
 * falls back to PNG and everything else to JPEG.
 */
export function outputTypes(sourceType: string): string[] {
  const mayBeTransparent = ['image/png', 'image/gif', 'image/webp', 'image/avif'].includes(
    sourceType
  );
  return ['image/webp', mayBeTransparent ? 'image/png' : 'image/jpeg'];
}

/** GIF is kept as is: redrawing would freeze an animation, and the format has no EXIF. */
export function keepsOriginal(type: string): boolean {
  return type === 'image/gif';
}

export function renameFor(name: string, type: string): string {
  const ext = type === 'image/jpeg' ? 'jpg' : type.replace('image/', '');
  const stem = name.replace(/\.[^./]*$/, '') || 'image';
  return `${stem}.${ext}`;
}

type Canvas = OffscreenCanvas | HTMLCanvasElement;

function makeCanvas(width: number, height: number): Canvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function encode(canvas: Canvas, type: string): Promise<Blob | null> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type, quality: QUALITY }).catch(() => null);
  }
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));
}

/** The file to upload in place of `file`: redrawn within `maxEdge`, without metadata. */
export async function prepareImage(file: File, maxEdge: number): Promise<File> {
  if (keepsOriginal(file.type)) return file;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImageDecodeError();
  }

  try {
    const { width, height } = fitWithin(bitmap.width, bitmap.height, maxEdge);
    const canvas = makeCanvas(width, height);
    for (const type of outputTypes(file.type)) {
      const ctx = canvas.getContext('2d') as
        | OffscreenCanvasRenderingContext2D
        | CanvasRenderingContext2D
        | null;
      if (!ctx) break;
      ctx.clearRect(0, 0, width, height);
      // JPEG has no alpha; transparent pixels would otherwise turn black.
      if (type === 'image/jpeg') {
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, width, height);
      }
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(bitmap, 0, 0, width, height);
      const blob = await encode(canvas, type);
      // A browser that cannot encode `type` hands back PNG instead of failing.
      if (blob && blob.type === type) {
        return new File([blob], renameFor(file.name, type), { type });
      }
    }
  } finally {
    bitmap.close();
  }
  throw new ImageDecodeError();
}
