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

export interface StoredImage {
  blob: Blob;
  name: string;
  type: string;
  size: number;
  width: number;
  height: number;
}

export interface HistoryEntry {
  id: string;
  createdAt: number;
  durationMs: number;
  /** Nur in älteren Einträgen vorhanden. */
  webhookUrl?: string;
  uploadFormat: UploadFormat;
  source: ResultSource;
  image1: StoredImage;
  image2: StoredImage;
  output: StoredImage;
}

/** Fehlerformat des Express-Proxys. */
export interface ProxyErrorBody {
  error: string;
  upstreamStatus?: number;
  upstreamContentType?: string;
  upstreamBody?: string;
  hint?: string;
}
