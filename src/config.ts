export const PROXY_ENDPOINT = '/api/webhook';

/** Cloud-Verlauf (Supabase), nur über den Server erreichbar. */
export const HISTORY_ENDPOINT = '/api/history';

/** Anmeldung (Supabase Auth über den Server, Session in httpOnly-Cookies). */
export const AUTH_ENDPOINT = '/api/auth';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export const STORAGE_KEYS = {
  uploadFormat: 'kleiderstudio.uploadFormat',
} as const;
