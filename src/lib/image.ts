import { MAX_UPLOAD_BYTES } from '../config';
import type { ImageAsset, StoredImage, UploadFormat } from '../types';
import { formatBytes } from './format';
import { createId } from './id';

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
};

const MIME_LABELS: Record<string, string> = {
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
  'image/gif': 'GIF',
  'image/avif': 'AVIF',
  'image/svg+xml': 'SVG',
  'image/bmp': 'BMP',
  'image/heic': 'HEIC',
};

export function extensionForMime(mime: string): string {
  return MIME_EXTENSIONS[mime] ?? 'bin';
}

export function labelForMime(mime: string): string {
  return MIME_LABELS[mime] ?? (mime.replace(/^image\//, '').toUpperCase() || 'Unbekannt');
}

export function replaceExtension(name: string, extension: string): string {
  const base = name.replace(/\.[^./\\]+$/, '') || 'bild';
  return `${base}.${extension}`;
}

async function measure(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === 'function' && blob.type !== 'image/svg+xml') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      const size = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return size;
    } catch {
      // Fallback über <img> (z. B. ältere Safari-Versionen).
    }
  }
  const image = await loadImageElement(blob);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function loadImageElement(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Die Datei konnte nicht als Bild gelesen werden.'));
    };
    image.src = url;
  });
}

/** Liest Datei oder Blob ein, prüft Typ und Größe und ermittelt die Auflösung. */
export async function createImageAsset(blob: Blob, name: string): Promise<ImageAsset> {
  if (blob.type && !blob.type.startsWith('image/')) {
    throw new Error('Bitte eine Bilddatei verwenden.');
  }
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(`Die Datei ist ${formatBytes(blob.size)} groß. Erlaubt sind höchstens ${formatBytes(MAX_UPLOAD_BYTES)}.`);
  }

  let size: { width: number; height: number };
  try {
    size = await measure(blob);
  } catch {
    throw new Error('Die Datei konnte nicht als Bild gelesen werden. Unterstützt werden u. a. JPEG, PNG und WebP.');
  }

  return {
    id: createId(),
    blob,
    name,
    type: blob.type || 'application/octet-stream',
    size: blob.size,
    width: size.width,
    height: size.height,
  };
}

export function assetFromStored(stored: StoredImage): ImageAsset {
  return { id: createId(), ...stored };
}

export function storedFromAsset(asset: ImageAsset): StoredImage {
  return {
    blob: asset.blob,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    width: asset.width,
    height: asset.height,
  };
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Das Bild konnte nicht konvertiert werden.'))),
      type,
      quality,
    );
  });
}

/** Längste Bildseite beim Upload. Hält beide Bilder sicher unter dem Vercel-Limit von 4,5 MB pro Anfrage. */
export const MAX_UPLOAD_DIMENSION = 2048;
/** Bis zu dieser Größe darf ein Bild unverändert gesendet werden. */
const MAX_UNCHANGED_BYTES = 1.5 * 1024 * 1024;

async function drawToCanvas(blob: Blob, fillBackground: boolean, maxDimension: number): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas wird von diesem Browser nicht unterstützt.');

  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let bitmap: ImageBitmap | null = null;

  try {
    bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const image = await loadImageElement(blob);
    source = image;
    width = image.naturalWidth;
    height = image.naturalHeight;
  }

  const scale = Math.min(1, maxDimension / Math.max(width, height));
  const sourceWidth = width;
  const sourceHeight = height;
  width = Math.max(1, Math.round(width * scale));
  height = Math.max(1, Math.round(height * scale));

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingQuality = 'high';
  if (fillBackground) {
    // JPEG kennt keine Transparenz – transparente Bereiche werden weiß.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
  }
  context.drawImage(source, 0, 0, sourceWidth, sourceHeight, 0, 0, width, height);
  bitmap?.close();
  return canvas;
}

export interface PreparedUpload {
  blob: Blob;
  name: string;
}

/** Konvertiert und verkleinert ein Bild clientseitig für den Upload. */
export async function prepareUpload(asset: ImageAsset, format: UploadFormat): Promise<PreparedUpload> {
  const fitsLimits =
    Math.max(asset.width, asset.height) <= MAX_UPLOAD_DIMENSION && asset.size <= MAX_UNCHANGED_BYTES;

  const targetType = format === 'jpeg' ? 'image/jpeg' : 'image/webp';
  if (fitsLimits && (format === 'original' || asset.type === targetType)) {
    return { blob: asset.blob, name: asset.name };
  }

  const canvas = await drawToCanvas(asset.blob, targetType === 'image/jpeg', MAX_UPLOAD_DIMENSION);
  let blob = await canvasToBlob(canvas, targetType, 0.9);

  // Browser ohne WebP-Encoder liefern stillschweigend PNG – dann auf JPEG ausweichen.
  if (blob.type !== targetType) {
    const jpegCanvas = targetType === 'image/webp' ? await drawToCanvas(asset.blob, true, MAX_UPLOAD_DIMENSION) : canvas;
    blob = await canvasToBlob(jpegCanvas, 'image/jpeg', 0.9);
  }

  return { blob, name: replaceExtension(asset.name, extensionForMime(blob.type)) };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

export function resultFilename(mime: string, timestamp = Date.now()): string {
  const stamp = new Date(timestamp).toISOString().replace(/[:T]/g, '-').slice(0, 19);
  return `kleiderstudio-${stamp}.${extensionForMime(mime)}`;
}
