/**
 * Express-App mit der Proxy-API. Wird lokal von server.ts und auf Vercel von api/webhook.ts genutzt.
 */
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import multer from 'multer';
import { fetch, FormData, type Response as UndiciResponse } from 'undici';
import { findImageInJson, sniffImageMime, type ImagePayload } from './imageResponse.js';
import { findValidationError, guardedAgent, parseWebhookUrl, UrlValidationError } from './ssrf.js';
import { createAuth, currentUser, sameOriginGuard } from './auth.js';
import { ProxyError, type ProxyErrorBody } from './errors.js';
import {
  deleteGeneration,
  getGenerationImage,
  historyEnabled,
  isHistoryId,
  isHistoryImageKind,
  listGenerations,
  saveGeneration,
} from './history.js';

// .env laden, falls vorhanden (lokal). Auf Vercel kommen die Werte aus den Environment Variables.
try {
  process.loadEnvFile?.(path.resolve(process.cwd(), '.env'));
} catch {
  // Keine .env-Datei – Umgebungsvariablen verwenden.
}

const ON_VERCEL = Boolean(process.env.VERCEL);

/** Ziel-Webhook. Bleibt auf dem Server und wird nie an den Browser ausgeliefert. */
const WEBHOOK_URL = process.env.WEBHOOK_URL?.trim() ?? '';
if (!WEBHOOK_URL) {
  console.warn('WEBHOOK_URL ist nicht gesetzt – bitte in der .env eintragen (siehe .env.example).');
}
export const IS_PROD = ON_VERCEL || process.argv.includes('--prod') || process.env.NODE_ENV === 'production';
/** Optionales gemeinsames Geheimnis; wird als Header an n8n gesendet (Header Auth im Webhook-Node). */
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET?.trim() ?? '';
const WEBHOOK_SECRET_HEADER = 'X-Kleiderstudio-Secret';

/** Schutz vor Kosten-Missbrauch: Anfragen pro IP und Minute sowie gleichzeitige Generierungen. */
const RATE_LIMIT_PER_MINUTE = Number(process.env.RATE_LIMIT_PER_MINUTE ?? 10);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT ?? 3);

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const MAX_RESPONSE_BYTES = 60 * 1024 * 1024;
const UPSTREAM_TIMEOUT_MS = 120_000;
const MAX_ERROR_BODY_CHARS = 8_000;

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

export const app = express();
app.disable('x-powered-by');
// Auf Vercel steht die echte Client-IP in X-Forwarded-For (für die Drosselung pro IP).
if (ON_VERCEL) app.set('trust proxy', true);

// Sicherheits-Header für alle Antworten.
app.use((_req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  });
  if (IS_PROD) {
    res.set(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com",
        "img-src 'self' blob: data:",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "frame-ancestors 'none'",
        "form-action 'none'",
      ].join('; '),
    );
  }
  next();
});

// Verändernde API-Anfragen nur von der eigenen Seite (CSRF-Schutz für die Session-Cookies).
app.use('/api', sameOriginGuard);

const { router: authRouter, requireUser } = createAuth(IS_PROD);
app.use('/api/auth', authRouter);

const requestLog = new Map<string, number[]>();
let activeGenerations = 0;

/** Einfache In-Memory-Drosselung für den kostenpflichtigen Endpunkt (pro Nutzer). */
function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = res.locals.user?.id ?? req.ip ?? 'unbekannt';
  const now = Date.now();
  const recent = (requestLog.get(key) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) {
    requestLog.set(key, recent);
    next(new ProxyError(429, 'Zu viele Anfragen. Bitte eine Minute warten.'));
    return;
  }
  if (activeGenerations >= MAX_CONCURRENT) {
    next(new ProxyError(429, 'Gerade laufen zu viele Generierungen. Bitte gleich erneut versuchen.'));
    return;
  }
  recent.push(now);
  requestLog.set(key, recent);
  if (requestLog.size > 10_000) requestLog.clear();
  next();
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post(
  '/api/webhook',
  requireUser,
  rateLimit,
  upload.fields([
    { name: 'image1', maxCount: 1 },
    { name: 'image2', maxCount: 1 },
  ]),
  async (req: Request, res: Response, next: NextFunction) => {
    const startedAt = performance.now();
    activeGenerations += 1;
    let released = false;
    const release = () => {
      if (!released) {
        released = true;
        activeGenerations -= 1;
      }
    };
    res.on('close', release);

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
          headers: {
            Accept: 'image/*, application/octet-stream, application/json;q=0.9, */*;q=0.5',
            ...(WEBHOOK_SECRET ? { [WEBHOOK_SECRET_HEADER]: WEBHOOK_SECRET } : {}),
          },
        });
      } catch (error) {
        throw translateFetchError(error, timeoutSignal, clientAbort.signal);
      }

      const payload = await readImagePayload(upstream, signal, timeoutSignal);
      if (clientAbort.signal.aborted) return;

      const durationMs = Math.round(performance.now() - startedAt);
      const historySaved = await saveToHistory(currentUser(res).id, image1, image2, payload, durationMs);
      if (clientAbort.signal.aborted) return;

      res
        .status(200)
        .set({
          'Content-Type': payload.mime,
          'Content-Length': String(payload.buffer.length),
          'X-Processing-Time-Ms': String(durationMs),
          'X-Result-Source': payload.source,
          'X-History-Saved': historySaved ? '1' : '0',
          'Cache-Control': 'no-store',
          'Content-Security-Policy': "default-src 'none'; sandbox",
        })
        .end(payload.buffer);
    } catch (error) {
      next(error);
    } finally {
      release();
    }
  },
);

/** Speichert eine erfolgreiche Generierung im Cloud-Verlauf. Fehler brechen die Antwort nicht ab. */
async function saveToHistory(
  userId: string,
  image1: Express.Multer.File,
  image2: Express.Multer.File,
  payload: ImagePayload,
  durationMs: number,
): Promise<boolean> {
  if (!historyEnabled()) return false;
  // Nur echte Rasterbilder speichern, da sie später wieder an Browser ausgeliefert werden.
  const mime1 = sniffImageMime(image1.buffer);
  const mime2 = sniffImageMime(image2.buffer);
  if (!mime1 || !mime2) return false;
  try {
    await saveGeneration(userId, {
      image1: { buffer: image1.buffer, mime: mime1, name: image1.originalname || 'image1' },
      image2: { buffer: image2.buffer, mime: mime2, name: image2.originalname || 'image2' },
      output: { buffer: payload.buffer, mime: payload.mime, name: 'ergebnis' },
      durationMs,
      source: payload.source,
    });
    return true;
  } catch (error) {
    console.warn('[kleiderstudio] Verlauf konnte nicht gespeichert werden:', (error as Error).message);
    return false;
  }
}

function requireHistory(_req: Request, _res: Response, next: NextFunction) {
  if (!historyEnabled()) {
    next(
      new ProxyError(503, 'Der Cloud-Verlauf ist nicht eingerichtet.', {
        hint: 'SUPABASE_URL und SUPABASE_SECRET_KEY in der .env (bzw. als Vercel Environment Variables) setzen.',
      }),
    );
    return;
  }
  next();
}

app.get('/api/history', requireHistory, requireUser, async (_req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store').json({ entries: await listGenerations(currentUser(res).id) });
  } catch (error) {
    next(new ProxyError(502, (error as Error).message));
  }
});

app.get('/api/history/:id/:kind', requireHistory, requireUser, async (req, res, next) => {
  const { id, kind } = req.params as { id: string; kind: string };
  if (!isHistoryId(id) || !isHistoryImageKind(kind)) {
    next(new ProxyError(404, 'Bild nicht gefunden.'));
    return;
  }
  try {
    const image = await getGenerationImage(currentUser(res).id, id, kind);
    if (!image) throw new ProxyError(404, 'Bild nicht gefunden.');
    res
      .status(200)
      .set({
        'Content-Type': image.mime,
        'Content-Length': String(image.buffer.length),
        // Bilder eines Eintrags ändern sich nie.
        'Cache-Control': 'private, max-age=86400, immutable',
        Vary: 'Cookie',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      })
      .end(image.buffer);
  } catch (error) {
    next(error instanceof ProxyError ? error : new ProxyError(502, (error as Error).message));
  }
});

app.delete('/api/history/:id', requireHistory, requireUser, async (req, res, next) => {
  const { id } = req.params as { id: string };
  if (!isHistoryId(id)) {
    next(new ProxyError(404, 'Eintrag nicht gefunden.'));
    return;
  }
  try {
    const deleted = await deleteGeneration(currentUser(res).id, id);
    if (!deleted) throw new ProxyError(404, 'Eintrag nicht gefunden.');
    res.status(204).end();
  } catch (error) {
    next(error instanceof ProxyError ? error : new ProxyError(502, (error as Error).message));
  }
});

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

  // Nur per Magic Bytes erkannte Rasterformate werden durchgereicht – kein SVG (könnte Skripte enthalten).

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
