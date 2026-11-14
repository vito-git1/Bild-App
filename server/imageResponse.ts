export type ResultSource = 'binary' | 'base64' | 'url';

export interface ImagePayload {
  buffer: Buffer;
  mime: string;
  source: ResultSource;
}

/** Erkennt Bildformate anhand der Magic Bytes. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg';
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return 'image/gif';
  }
  if (bytes.length >= 12 && ascii(bytes, 4, 8) === 'ftyp') {
    const brand = ascii(bytes, 8, 12);
    if (brand === 'avif' || brand === 'avis') return 'image/avif';
  }
  return null;
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.subarray(start, end));
}

export type ImageCandidate =
  | { kind: 'inline'; buffer: Buffer; mime: string }
  | { kind: 'url'; url: string };

const DATA_URI = /^data:([a-z0-9.+-]+\/[a-z0-9.+-]+)?(?:;[^,]*)?;base64,(.+)$/is;
const BASE64_BODY = /^[A-Za-z0-9+/_-]+={0,2}$/;
const IMAGE_URL_EXT = /\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i;
const PREFERRED_KEYS = /^(image|images|output|result|data|base64|b64_json|file|url|image_?url|output_?url|src)$/i;
const MIN_BASE64_LENGTH = 64;
const MAX_DEPTH = 8;

function decodeInline(value: string): { buffer: Buffer; mime: string } | null {
  const trimmed = value.trim();
  const dataUri = DATA_URI.exec(trimmed);
  const payload = (dataUri ? dataUri[2] : trimmed).replace(/\s+/g, '');

  if (payload.length < MIN_BASE64_LENGTH || !BASE64_BODY.test(payload)) return null;

  const buffer = Buffer.from(payload, payload.includes('-') || payload.includes('_') ? 'base64url' : 'base64');
  const mime = sniffImageMime(buffer);
  if (!mime) return null;
  return { buffer, mime };
}

/**
 * Durchsucht eine JSON-Antwort von n8n nach einem Bild. Eingebettete Daten
 * (Data-URI/Base64) haben Vorrang vor Bild-URLs.
 */
export function findImageInJson(root: unknown): ImageCandidate | null {
  let inline: ImageCandidate | null = null;
  const urls: Array<{ url: string; score: number }> = [];

  const visit = (value: unknown, key: string, depth: number): void => {
    if (inline || depth > MAX_DEPTH || value === null || value === undefined) return;

    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value.trim())) {
        const url = value.trim();
        const score = (IMAGE_URL_EXT.test(url) ? 2 : 0) + (PREFERRED_KEYS.test(key) ? 1 : 0);
        urls.push({ url, score });
        return;
      }
      const decoded = decodeInline(value);
      if (decoded) inline = { kind: 'inline', ...decoded };
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) visit(item, key, depth + 1);
      return;
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>);
      // Bevorzugte Schlüssel zuerst durchsuchen.
      entries.sort(([a], [b]) => Number(PREFERRED_KEYS.test(b)) - Number(PREFERRED_KEYS.test(a)));
      for (const [childKey, child] of entries) visit(child, childKey, depth + 1);
    }
  };

  visit(root, '', 0);

  if (inline) return inline;
  if (urls.length === 0) return null;
  urls.sort((a, b) => b.score - a.score);
  return { kind: 'url', url: urls[0].url };
}
