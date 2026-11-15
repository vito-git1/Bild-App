export type SlotKey = 'image1' | 'image2';

export type UploadFormat = 'webp' | 'jpeg' | 'original';

export type View = 'studio' | 'history';

export type ResultMode = 'result' | 'compare' | 'all';

export type ResultSource = 'binary' | 'base64' | 'url';

/** Ein geladenes Bild inklusive Metadaten. Object-URLs werden in den Komponenten erzeugt. */
export interface ImageAsset {
  id: string;
  blob: Blob;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}

export interface RequestFailure {
  message: string;
  httpStatus?: number;
  rawBody?: string;
  hint?: string;
  aborted?: boolean;
}

export interface GenerationResult {
  output: ImageAsset;
  inputs: Record<SlotKey, ImageAsset>;
  durationMs: number;
  source: ResultSource;
}

export type RequestState =
  | { status: 'idle' }
  | { status: 'loading'; startedAt: number }
  | { status: 'error'; failure: RequestFailure }
  | { status: 'success'; result: GenerationResult };

/** Bild eines Verlaufseintrags; wird über den Server aus Supabase geladen. */
export interface HistoryImage {
  /** Same-Origin-URL, z. B. /api/history/<id>/output */
  url: string;
  name: string;
  type: string;
  size: number;
  /** 0, falls die Abmessungen nicht ermittelt werden konnten. */
  width: number;
  height: number;
}

/** Eintrag im Cloud-Verlauf. Muss zu HistoryEntryDto in server/history.ts passen. */
export interface HistoryEntry {
  id: string;
  createdAt: number;
  durationMs: number;
  source: ResultSource;
  image1: HistoryImage;
  image2: HistoryImage;
  output: HistoryImage;
}

/** Angemeldeter Nutzer. Muss zu AuthUser in server/auth.ts passen. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

/** Fehlerformat des Express-Proxys. */
export interface ProxyErrorBody {
  error: string;
  upstreamStatus?: number;
  upstreamContentType?: string;
  upstreamBody?: string;
  hint?: string;
}
