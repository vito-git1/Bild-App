import type { ProxyErrorBody } from '../types';

/** Fehler einer Anfrage an die eigene API, inkl. optionalem Hinweis des Servers. */
export class ApiError extends Error {
  readonly hint?: string;
  readonly status: number;

  constructor(message: string, status: number, hint?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.hint = hint;
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Wird aufgerufen, wenn der Server 401 meldet (Session abgelaufen oder abgemeldet). */
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  unauthorizedHandler = handler;
}

export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

export async function toApiError(response: Response, fallback: string): Promise<ApiError> {
  if (response.status === 401) notifyUnauthorized();
  const body = (await response.json().catch(() => null)) as ProxyErrorBody | null;
  return new ApiError(body?.error ?? fallback, response.status, body?.hint);
}

export async function request(input: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(input, { credentials: 'same-origin', ...init });
  } catch {
    throw new ApiError('Der Kleiderstudio-Server ist nicht erreichbar.', 0);
  }
}

/** Fehlermeldung samt Hinweis für die Anzeige. */
export function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.hint) return `${error.message} ${error.hint}`;
  return error instanceof Error ? error.message : fallback;
}
