import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { fetch, FormData, type Response as UndiciResponse } from 'undici';
import { findImageInJson, sniffImageMime, type ImagePayload } from './server/imageResponse';
import { findValidationError, guardedAgent, parseWebhookUrl, UrlValidationError } from './server/ssrf';

const ROOT = path.dirname(fileURLToPath(import.meta.url));

// .env laden, falls vorhanden (Node ≥ 20.12).
try {
  process.loadEnvFile?.(path.join(ROOT, '.env'));
} catch {
  // Keine .env-Datei – Standardwerte verwenden.
}

/** Ziel-Webhook. Bleibt auf dem Server und wird nie an den Browser ausgeliefert. */
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() ?? '';
if (!WEBHOOK_URL) {
  console.warn('WEBHOOK_URL ist nicht gesetzt – bitte in der .env eintragen (siehe .env.example).');
}
const IS_PROD = process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
const PORT = Number(process.env.PORT ?? 3000);

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 60 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;
const MAX_ERROR_BODY_CHARS = 8_000;

interface ProxyErrorBody {
  error: string;
  upstreamStatus?: number;
  upstreamContentType?: string;
  upstreamBody?: string;
  hint?: string;
}

class ProxyError extends Error {
  readonly statusCode: number;
  readonly details: Omit<ProxyErrorBody, 'error'>;

  constructor(statusCode: number, message: string, details: Omit<ProxyErrorBody, 'error'> = {}) {
    super(message);
    this.statusCode = statusCode;
    this.details = details;
  }
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: 2, fields: 4, fieldSize: 8 * 1024 },
  fileFilter: (_req, file, callback) => {
    if (file.fieldname !== 'image1' && file.fieldname !== 'image2') {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', file.fieldname));
      return;
    }
    callback(null, true);
  },
});

const app = express();
app.disable('x-powered-by');

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post(
  '/api/webhook',
  upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = performance.now();

    try {
      const files = req.files as Record<string, Express.Multer.File[] | undefined> | undefined;
      const image1 = files?.image1?.[0];
      const image2 = files?.image2?.[0];
      if (!image1 || !image2) {
        throw new ProxyError(400, 'Beide Bilder (image1 und image2) sind erforderlich.');
      }

      const target = parseWebhookUrl(WEBHOOK_URL);

      const clientAbort = new AbortController();
      res.on('close', () => {
        if (!res.writableEnded) clientAbort.abort();
      });
      const timeoutSignal = AbortSignal.timeout(UPSTREAM_TIMEOUT_MS);
      const signal = AbortSignal.any([clientAbort.signal, timeoutSignal]);

      const form = new FormData();
      form.append('image1', toBlob(image1), image1.originalname || 'image1');
      form.append('image2', toBlob(image2), image2.originalname || 'image2');

      let upstream: UndiciResponse;
      try {
        upstream = await fetch(target, {
          method: 'POST',
          body: form,
          signal,
          dispatcher: guardedAgent,
          headers: { Accept: 'image/*, application/octet-stream, application/json;q=0.9, */*;q=0.5' },
        });
      } catch (error) {
        throw translateFetchError(error, timeoutSignal, clientAbort.signal);
      }

      const payload = await readImagePayload(upstream, signal, timeoutSignal);
      if (clientAbort.signal.aborted) return;

      res
        .status(200)
        .set({
          'Content-Type': payload.mime,
          'Content-Length': String(payload.buffer.length),
          'X-Processing-Time-Ms': String(Math.round(performance.now() - startedAt)),
          'X-Result-Source': payload.source,
          'Cache-Control': 'no-store',
        })
        .end(payload.buffer);
    } catch (error) {
      next(error);
    }
  },
);

function toBlob(file: Express.Multer.File): Blob {
  return new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || 'application/octet-stream' });
}

function translateFetchError(
  error: unknown,
  timeoutSignal: AbortSignal,
  clientSignal: AbortSignal,
): Error {
  const validation = findValidationError(error);
  if (validation) return validation;
  if (clientSignal.aborted) return new ProxyError(499, 'Die Anfrage wurde abgebrochen.');
  if (timeoutSignal.aborted) {
    return new ProxyError(504, `n8n hat nicht innerhalb von ${UPSTREAM_TIMEOUT_MS / 1000} Sekunden geantwortet.`);
  }
  const cause = (error as { cause?: { code?: string; message?: string } }).cause;
  const detail = cause?.code ?? cause?.message ?? (error as Error).message;
  return new ProxyError(502, `Der Bildgenerator ist nicht erreichbar (${detail}).`);
}

async function readBody(response: UndiciResponse, timeoutSignal: AbortSignal): Promise<Buffer> {
  const declared = Number(response.headers.get('content-length') ?? 0);
  if (declared > MAX_RESPONSE_BYTES) {
    await response.body?.cancel();
    throw new ProxyError(502, 'Die Antwort von n8n ist zu groß.');
  }
  try {
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_RESPONSE_BYTES) throw new ProxyError(502, 'Die Antwort von n8n ist zu groß.');
    return buffer;
  } catch (error) {
    if (error instanceof ProxyError) throw error;
    if (timeoutSignal.aborted) {
      throw new ProxyError(504, `n8n hat nicht innerhalb von ${UPSTREAM_TIMEOUT_MS / 1000} Sekunden geantwortet.`);
    }
    throw new ProxyError(502, 'Die Antwort von n8n konnte nicht vollständig gelesen werden.');
  }
}

function bodyPreview(buffer: Buffer): string {
  const text = buffer.toString('utf8');
  return text.length > MAX_ERROR_BODY_CHARS ? `${text.slice(0, MAX_ERROR_BODY_CHARS)}\n…` : text;
}

function tryParseJson(buffer: Buffer): unknown {
  try {
    return JSON.parse(buffer.toString('utf8'));
  } catch {
    return undefined;
  }
}

function hintForStatus(status: number): string | undefined {
  if (status === 404) {
    return 'n8n kennt diesen Webhook nicht. Prüfe, ob der Workflow aktiviert ist (für /webhook/) bzw. „Listen for test event“ läuft (für /webhook-test/) und ob der Pfad exakt dem Webhook-Node entspricht.';
  }
  if (status === 401 || status === 403) {
    return 'Der Webhook verlangt eine Authentifizierung. Prüfe die Authentication-Einstellung im Webhook-Node.';
  }
  if (status === 500) {
    return 'Im Workflow ist ein Fehler aufgetreten. Details stehen in n8n unter „Executions“.';
  }
  return undefined;
}

async function readImagePayload(
  upstream: UndiciResponse,
  signal: AbortSignal,
  timeoutSignal: AbortSignal,
): Promise<ImagePayload> {
  const contentType = (upstream.headers.get('content-type') ?? '').toLowerCase();
  const buffer = await readBody(upstream, timeoutSignal);

  if (!upstream.ok) {
    throw new ProxyError(502, `n8n antwortete mit HTTP ${upstream.status}.`, {
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || undefined,
      upstreamBody: bodyPreview(buffer),
      hint: hintForStatus(upstream.status),
    });
  }

  const sniffed = sniffImageMime(buffer);
  if (sniffed) return { buffer, mime: sniffed, source: 'binary' };

  if (contentType.startsWith('image/') && buffer.length > 0) {
    // Formate ohne Magic-Byte-Prüfung (z. B. SVG) mit deklariertem Typ durchreichen.
    return { buffer, mime: contentType.split(';')[0].trim(), source: 'binary' };
  }

  const json = tryParseJson(buffer);
  if (json !== undefined) {
    const candidate = findImageInJson(json);
    if (candidate?.kind === 'inline') {
      return { buffer: candidate.buffer, mime: candidate.mime, source: 'base64' };
    }
    if (candidate?.kind === 'url') {
      return fetchImageFromUrl(candidate.url, signal, timeoutSignal);
    }

    const startedOnly =
      typeof json === 'object' && json !== null && (json as { message?: unknown }).message === 'Workflow was started';
    throw new ProxyError(502, 'n8n hat JSON ohne Bild zurückgegeben.', {
      upstreamStatus: upstream.status,
      upstreamContentType: contentType || undefined,
      upstreamBody: bodyPreview(buffer),
      hint: startedOnly
        ? 'Der Webhook antwortet sofort. Stelle im Webhook-Node „Respond“ auf „Using ‚Respond to Webhook‘ Node“ und gib dort das Bild als Binary File zurück.'
        : 'Gib das Bild im „Respond to Webhook“-Node als Binary File zurück, oder als JSON mit Data-URI, Base64 oder Bild-URL.',
    });
  }

  throw new ProxyError(502, buffer.length === 0 ? 'n8n hat eine leere Antwort gesendet.' : 'Die Antwort von n8n enthält kein erkennbares Bild.', {
    upstreamStatus: upstream.status,
    upstreamContentType: contentType || undefined,
    upstreamBody: buffer.length > 0 ? bodyPreview(buffer) : undefined,
    hint: buffer.length === 0
      ? 'Prüfe, ob der Workflow bis zum „Respond to Webhook“-Node durchläuft und dort ein Binary File zurückgibt.'
      : undefined,
  });
}

async function fetchImageFromUrl(
  rawUrl: string,
  signal: AbortSignal,
  timeoutSignal: AbortSignal,
): Promise<ImagePayload> {
  const url = parseWebhookUrl(rawUrl);
  let response: UndiciResponse;
  try {
    response = await fetch(url, { signal, dispatcher: guardedAgent, headers: { Accept: 'image/*' } });
  } catch (error) {
    const validation = findValidationError(error);
    if (validation) throw validation;
    throw new ProxyError(502, `Das Ergebnisbild unter ${url.host} konnte nicht geladen werden.`);
  }

  const buffer = await readBody(response, timeoutSignal);
  if (!response.ok) {
    throw new ProxyError(502, `Das Ergebnisbild konnte nicht geladen werden (HTTP ${response.status}).`, {
      upstreamStatus: response.status,
      upstreamBody: bodyPreview(buffer),
    });
  }

  const mime = sniffImageMime(buffer);
  if (!mime) {
    throw new ProxyError(502, 'Die von n8n gelieferte URL verweist nicht auf ein Bild.', {
      upstreamBody: bodyPreview(buffer),
    });
  }
  return { buffer, mime, source: 'url' };
}

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Unbekannter API-Endpunkt.' } satisfies ProxyErrorBody);
});

if (IS_PROD) {
  const dist = path.join(ROOT, 'dist');
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: ROOT, server: { middlewareMode: true }, appType: 'spa' });
  app.use(vite.middlewares);
}

app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (res.headersSent) {
    res.end();
    return;
  }

  if (error instanceof multer.MulterError) {
    const message =
      error.code === 'LIMIT_FILE_SIZE'
        ? `Eine Datei ist größer als ${MAX_FILE_BYTES / 1024 / 1024} MB.`
        : error.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Unerwartetes Dateifeld „${error.field ?? ''}“. Erlaubt sind image1 und image2.`
          : `Upload fehlgeschlagen (${error.code}).`;
    res.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: message } satisfies ProxyErrorBody);
    return;
  }

  if (error instanceof UrlValidationError) {
    res.status(error.statusCode).json({ error: error.message } satisfies ProxyErrorBody);
    return;
  }

  if (error instanceof ProxyError) {
    res.status(error.statusCode).json({ error: error.message, ...error.details } satisfies ProxyErrorBody);
    return;
  }

  console.error('[kleiderstudio] Unerwarteter Fehler:', error);
  res.status(500).json({ error: 'Interner Serverfehler.' } satisfies ProxyErrorBody);
});

app.listen(PORT, () => {
  console.log(`Kleiderstudio läuft auf http://localhost:${PORT} (${IS_PROD ? 'Produktion' : 'Entwicklung'})`);
});
