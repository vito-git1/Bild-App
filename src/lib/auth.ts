import { AUTH_ENDPOINT } from '../config';
import type { AuthUser } from '../types';
import { request, toApiError } from './apiClient';

function postJson(path: string, body?: unknown): Promise<Response> {
  return request(`${AUTH_ENDPOINT}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

/** Aktuell angemeldeter Nutzer oder null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const response = await request(`${AUTH_ENDPOINT}/me`, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await toApiError(response, 'Die Anmeldung konnte nicht geprüft werden.');
  const body = (await response.json()) as { user: AuthUser | null };
  return body.user;
}

export interface RegisterResult {
  needsConfirmation: boolean;
  user?: AuthUser;
}

export async function register(input: { name: string; email: string; password: string }): Promise<RegisterResult> {
  const response = await postJson('register', input);
  if (!response.ok) throw await toApiError(response, 'Die Registrierung ist fehlgeschlagen.');
  return (await response.json()) as RegisterResult;
}

export async function login(input: { email: string; password: string }): Promise<AuthUser> {
  const response = await postJson('login', input);
  if (!response.ok) throw await toApiError(response, 'Die Anmeldung ist fehlgeschlagen.');
  const body = (await response.json()) as { user: AuthUser };
  return body.user;
}

/** Fordert die E-Mail zum Zurücksetzen des Passworts an (Antwort ist immer neutral). */
export async function requestPasswordReset(email: string): Promise<void> {
  const response = await postJson('forgot', { email });
  if (!response.ok) throw await toApiError(response, 'Die E-Mail konnte nicht verschickt werden.');
}

/** Setzt mit dem Token aus dem Link ein neues Passwort; meldet danach direkt an (falls möglich). */
export async function resetPassword(input: { accessToken: string; password: string }): Promise<AuthUser | null> {
  const response = await postJson('reset', input);
  if (!response.ok) throw await toApiError(response, 'Das Passwort konnte nicht geändert werden.');
  const body = (await response.json()) as { user: AuthUser | null };
  return body.user;
}

export async function logout(): Promise<void> {
  const response = await postJson('logout');
  if (!response.ok) throw await toApiError(response, 'Abmelden fehlgeschlagen.');
}
