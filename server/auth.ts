/**
 * Anmeldung über Supabase Auth (E-Mail, Name, Passwort). Der Server spricht mit Supabase und legt
 * die Session in httpOnly-Cookies ab – der Browser sieht weder Tokens noch Keys.
 */
import express, { type CookieOptions, type NextFunction, type Request, type Response } from 'express';
import { AuthError, createClient, type Session, type SupabaseClient, type User } from '@supabase/supabase-js';
import { ProxyError } from './errors.js';
import { credentials, historyEnabled } from './history.js';

/** Öffentliche Nutzerdaten. Muss zu AuthUser in src/types.ts passen. */
export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Locals {
      user?: AuthUser;
    }
  }
}

const ACCESS_COOKIE = 'ks_at';
const REFRESH_COOKIE = 'ks_rt';
const REFRESH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const AUTH_ATTEMPTS_PER_MINUTE = 5;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;
/** bcrypt (von Supabase genutzt) wertet nur die ersten 72 Bytes aus. */
const MAX_PASSWORD_LENGTH = 72;
const MAX_NAME_LENGTH = 80;

/** Frischer Client pro Aufruf: nach einem Login hält ein Client die Nutzer-Session, die darf nicht geteilt werden. */
function createAuthClient(): SupabaseClient {
  if (!historyEnabled()) {
    throw new ProxyError(503, 'Die Anmeldung ist nicht eingerichtet.', {
      hint: 'SUPABASE_URL und SUPABASE_SECRET_KEY in der .env (bzw. als Vercel Environment Variables) setzen.',
    });
  }
  const { url, key } = credentials();
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function readCookies(req: Request): Record<string, string> {
  const result: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    try {
      result[name] = decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      // Ungültig kodiertes Cookie ignorieren.
    }
  }
  return result;
}

function toAuthUser(user: User): AuthUser {
  const email = user.email ?? '';
  const metaName = typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '';
  return { id: user.id, email, name: metaName || email.split('@')[0] || 'Nutzer' };
}

/** Echter Ausfall (Netzwerk/5xx) statt ungültiger Session? Dann nicht abmelden, sondern Fehler melden. */
function isOutage(error: AuthError): boolean {
  return error.name === 'AuthRetryableFetchError' || (error.status ?? 0) >= 500;
}

function badRequest(message: string): ProxyError {
  return new ProxyError(400, message);
}

function readString(body: unknown, key: string): string {
  const value = (body as Record<string, unknown> | undefined)?.[key];
  return typeof value === 'string' ? value : '';
}

export function createAuth(isProd: boolean) {
  const cookieBase: CookieOptions = { httpOnly: true, sameSite: 'lax', secure: isProd, path: '/api' };

  const setSession = (res: Response, session: Session) => {
    res.cookie(ACCESS_COOKIE, session.access_token, { ...cookieBase, maxAge: session.expires_in * 1000 });
    res.cookie(REFRESH_COOKIE, session.refresh_token, { ...cookieBase, maxAge: REFRESH_MAX_AGE_MS });
  };

  const clearSession = (res: Response) => {
    res.clearCookie(ACCESS_COOKIE, cookieBase);
    res.clearCookie(REFRESH_COOKIE, cookieBase);
  };

  /** Ermittelt den Nutzer aus den Cookies und erneuert die Session bei Bedarf. */
  async function resolveUser(req: Request, res: Response): Promise<AuthUser | null> {
    const cookies = readCookies(req);
    const accessToken = cookies[ACCESS_COOKIE];
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!accessToken && !refreshToken) return null;

    const client = createAuthClient();

    if (accessToken) {
      const { data, error } = await client.auth.getUser(accessToken);
      if (data.user) return toAuthUser(data.user);
      if (error && isOutage(error)) throw new ProxyError(502, 'Die Anmeldung ist gerade nicht erreichbar.');
    }

    if (refreshToken) {
      const { data, error } = await client.auth.refreshSession({ refresh_token: refreshToken });
      if (data.session && data.user) {
        setSession(res, data.session);
        return toAuthUser(data.user);
      }
      if (error && isOutage(error)) throw new ProxyError(502, 'Die Anmeldung ist gerade nicht erreichbar.');
    }

    clearSession(res);
    return null;
  }

  /** Lässt nur angemeldete Nutzer durch und legt sie in res.locals.user ab. */
  async function requireUser(req: Request, res: Response, next: NextFunction) {
    try {
      const user = await resolveUser(req, res);
      if (!user) throw new ProxyError(401, 'Bitte melde dich an.');
      res.locals.user = user;
      next();
    } catch (error) {
      next(error);
    }
  }

  // Drosselung gegen Passwort-Raten und Mail-Spam.
  const attempts = new Map<string, number[]>();
  function limitAttempts(req: Request, _res: Response, next: NextFunction) {
    const key = req.ip ?? 'unbekannt';
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((time) => now - time < 60_000);
    if (recent.length >= AUTH_ATTEMPTS_PER_MINUTE) {
      attempts.set(key, recent);
      next(new ProxyError(429, 'Zu viele Versuche. Bitte eine Minute warten.'));
      return;
    }
    recent.push(now);
    attempts.set(key, recent);
    if (attempts.size > 10_000) attempts.clear();
    next();
  }

  const router = express.Router();
  router.use(express.json({ limit: '10kb' }));

  router.get('/me', async (req, res, next) => {
    try {
      res.set('Cache-Control', 'no-store');
      if (!historyEnabled()) {
        res.json({ user: null });
        return;
      }
      res.json({ user: await resolveUser(req, res) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/register', limitAttempts, async (req, res, next) => {
    try {
      const name = readString(req.body, 'name').trim();
      const email = readString(req.body, 'email').trim().toLowerCase();
      const password = readString(req.body, 'password');

      if (!name) throw badRequest('Bitte gib deinen Namen ein.');
      if (name.length > MAX_NAME_LENGTH) throw badRequest(`Der Name darf höchstens ${MAX_NAME_LENGTH} Zeichen lang sein.`);
      if (!EMAIL_PATTERN.test(email)) throw badRequest('Bitte gib eine gültige E-Mail-Adresse ein.');
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw badRequest(`Das Passwort muss mindestens ${MIN_PASSWORD_LENGTH} Zeichen lang sein.`);
      }
      if (Buffer.byteLength(password) > MAX_PASSWORD_LENGTH) {
        throw badRequest(`Das Passwort darf höchstens ${MAX_PASSWORD_LENGTH} Zeichen lang sein.`);
      }

      const { data, error } = await createAuthClient().auth.signUp({
        email,
        password,
        options: { data: { name }, emailRedirectTo: `${req.protocol}://${req.get('host')}/?bestaetigt=1` },
      });

      if (error) {
        if (error.code === 'weak_password') {
          throw badRequest('Das Passwort ist zu schwach. Bitte wähle ein längeres oder weniger gebräuchliches Passwort.');
        }
        if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
          throw new ProxyError(429, 'Gerade werden zu viele E-Mails verschickt. Bitte später erneut versuchen.');
        }
        if (error.code === 'user_already_exists' || error.code === 'email_exists') {
          // Neutral antworten, damit niemand prüfen kann, welche Adressen registriert sind.
          res.json({ needsConfirmation: true });
          return;
        }
        if (isOutage(error)) throw new ProxyError(502, 'Die Anmeldung ist gerade nicht erreichbar.');
        console.warn('[kleiderstudio] Registrierung fehlgeschlagen:', error.code ?? error.message);
        throw badRequest('Die Registrierung ist fehlgeschlagen. Bitte Eingaben prüfen.');
      }

      // Ist die E-Mail-Bestätigung im Dashboard abgeschaltet, kommt direkt eine Session zurück.
      if (data.session && data.user) {
        setSession(res, data.session);
        res.json({ needsConfirmation: false, user: toAuthUser(data.user) });
        return;
      }
      res.json({ needsConfirmation: true });
    } catch (error) {
      next(error);
    }
  });

  router.post('/login', limitAttempts, async (req, res, next) => {
    try {
      const email = readString(req.body, 'email').trim().toLowerCase();
      const password = readString(req.body, 'password');
      if (!email || !password) throw badRequest('Bitte E-Mail und Passwort eingeben.');

      const { data, error } = await createAuthClient().auth.signInWithPassword({ email, password });
      if (error || !data.session || !data.user) {
        if (error?.code === 'email_not_confirmed') {
          throw new ProxyError(403, 'Bitte bestätige zuerst deine E-Mail-Adresse über den Link in der E-Mail.');
        }
        if (error && isOutage(error)) throw new ProxyError(502, 'Die Anmeldung ist gerade nicht erreichbar.');
        throw new ProxyError(400, 'E-Mail oder Passwort ist falsch.');
      }

      setSession(res, data.session);
      res.json({ user: toAuthUser(data.user) });
    } catch (error) {
      next(error);
    }
  });

  router.post('/logout', async (req, res, next) => {
    try {
      const accessToken = readCookies(req)[ACCESS_COOKIE];
      if (accessToken && historyEnabled()) {
        // Refresh Token serverseitig ungültig machen; Fehler (z. B. abgelaufen) sind hier egal.
        await createAuthClient().auth.admin.signOut(accessToken, 'local').catch(() => undefined);
      }
      clearSession(res);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });

  return { router, requireUser };
}

/** Schutz gegen CSRF: verändernde API-Anfragen nur von der eigenen Seite. */
export function sameOriginGuard(req: Request, _res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    next();
    return;
  }
  const origin = req.get('origin');
  if (origin) {
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      // Ungültiger Origin => abweisen.
    }
    if (host !== req.get('host')) {
      next(new ProxyError(403, 'Anfrage von fremder Seite abgelehnt.'));
      return;
    }
  }
  next();
}

/** Angemeldeter Nutzer der aktuellen Anfrage (nur hinter requireUser verwenden). */
export function currentUser(res: Response): AuthUser {
  const user = res.locals.user;
  if (!user) throw new ProxyError(401, 'Bitte melde dich an.');
  return user;
}
