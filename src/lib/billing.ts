import { BILLING_ENDPOINT } from '../config';
import { request, toApiError } from './apiClient';

/** Antwort von GET /api/billing – muss zum Server (server/billing.ts) passen. */
export interface BillingInfo {
  credits: number;
  purchaseEnabled: boolean;
  pack: { credits: number; priceCents: number; currency: string };
  /** Nur bei Abfrage mit Session-ID: true, wenn dieser Kauf schon gutgeschrieben ist. */
  purchaseGranted?: boolean;
}

export async function getBilling(session?: string): Promise<BillingInfo> {
  const url = session ? `${BILLING_ENDPOINT}?session=${encodeURIComponent(session)}` : BILLING_ENDPOINT;
  const response = await request(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw await toApiError(response, 'Das Guthaben konnte nicht geladen werden.');
  return (await response.json()) as BillingInfo;
}

/** Erstellt eine Stripe-Bezahlseite und leitet dorthin weiter. */
export async function startCheckout(): Promise<void> {
  const response = await request(`${BILLING_ENDPOINT}/checkout`, {
    method: 'POST',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw await toApiError(response, 'Die Bezahlseite konnte nicht geöffnet werden.');
  const { url } = (await response.json()) as { url: string };
  if (!url.startsWith('https://checkout.stripe.com/')) throw new Error('Unerwartete Bezahlseite.');
  window.location.assign(url);
}

export function formatPrice(cents: number, currency: string): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: currency.toUpperCase() }).format(cents / 100);
}
