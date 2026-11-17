export const PROXY_ENDPOINT = '/api/webhook';

/** Cloud-Verlauf (Supabase), nur über den Server erreichbar. */
export const HISTORY_ENDPOINT = '/api/history';

/** Anmeldung (Supabase Auth über den Server, Session in httpOnly-Cookies). */
export const AUTH_ENDPOINT = '/api/auth';

/** Guthaben und Kauf über Stripe (über den Server). */
export const BILLING_ENDPOINT = '/api/billing';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
