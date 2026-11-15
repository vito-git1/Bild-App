import { PROXY_ENDPOINT } from '../config';
import { notifyUnauthorized } from './apiClient';
import type { ProxyErrorBody, RequestFailure, ResultSource } from '../types';
import type { PreparedUpload } from './image';

export class WebhookError extends Error {
  readonly failure: RequestFailure;

  constructor(failure: RequestFailure) {
    super(failure.message);
    this.name = 'WebhookError';
    this.failure = failure;
  }
}

export interface WebhookResponse {
  blob: Blob;
  mime: string;
  durationMs: number;
  source: ResultSource;
  /** true, wenn der Server das Ergebnis im Cloud-Verlauf gespeichert hat. */
  historySaved: boolean;
}

interface SendOptions {
  image1: PreparedUpload;
  image2: PreparedUpload;
  signal: AbortSignal;
}

const SOURCES: ResultSource[] = ['binary', 'base64', 'url'];

function isProxyErrorBody(value: unknown): value is ProxyErrorBody {
  return typeof value === 'object' && value !== null && typeof (value as ProxyErrorBody).error === 'string';
}

/** Sendet beide Bilder an den Express-Proxy; die Webhook-URL kennt nur der Server. */
export async function sendToWebhook({ image1, image2, signal }: SendOptions): Promise<WebhookResponse> {
  const form = new FormData();
  form.append('image1', image1.blob, image1.name);
  form.append('image2', image2.blob, image2.name);

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(PROXY_ENDPOINT, { method: 'POST', body: form, signal });
  } catch (error) {
    if (signal.aborted) {
      throw new WebhookError({ message: 'Die Anfrage wurde abgebrochen.', aborted: true });
    }
    throw new WebhookError({
      message: 'Der Kleiderstudio-Server ist nicht erreichbar.',
      hint: 'Läuft der Express-Server (npm run dev bzw. npm start)?',
      rawBody: error instanceof Error ? error.message : undefined,
    });
  }

  const contentType = (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();

  if (!response.ok) {
    // 401 kommt vom eigenen Server (nicht von n8n – dessen Fehler werden als 502 gemeldet).
    if (response.status === 401) notifyUnauthorized();
    const text = await response.text().catch(() => '');
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      body = undefined;
    }

    if (isProxyErrorBody(body)) {
      throw new WebhookError({
        message: body.error,
        httpStatus: body.upstreamStatus ?? response.status,
        rawBody: body.upstreamBody,
        hint: body.hint,
      });
    }
    throw new WebhookError({
      message: `Der Server antwortete mit HTTP ${response.status}.`,
      httpStatus: response.status,
      rawBody: text || undefined,
    });
  }

  if (!contentType.startsWith('image/')) {
    throw new WebhookError({
      message: 'Die Antwort ist kein Bild.',
      rawBody: await response.text().catch(() => undefined),
    });
  }

  const blob = await response.blob();
  const headerDuration = Number(response.headers.get('x-processing-time-ms'));
  const headerSource = response.headers.get('x-result-source') as ResultSource | null;

  return {
    blob: blob.type === contentType ? blob : new Blob([blob], { type: contentType }),
    mime: contentType,
    durationMs: Number.isFinite(headerDuration) && headerDuration > 0 ? headerDuration : performance.now() - startedAt,
    source: headerSource && SOURCES.includes(headerSource) ? headerSource : 'binary',
    historySaved: response.headers.get('x-history-saved') === '1',
  };
}
