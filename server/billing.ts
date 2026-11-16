/**
 * Guthaben (Credits) pro Nutzer und Kauf über Stripe Checkout.
 *
 * - Jede Generierung kostet 1 Credit (Spalte public.profiles.credits, neue Nutzer starten mit dem Spalten-Default).
 * - Abziehen/Zurückgeben/Gutschreiben läuft atomar über die SQL-Funktionen consume_credit, refund_credit, grant_credits.
 * - Gekauft wird auf der Stripe-Bezahlseite; gutgeschrieben wird ausschließlich über den signierten Stripe-Webhook.
 */
import express, { type NextFunction, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { currentUser } from './auth.js';
import { ProxyError } from './errors.js';
import { getClient, historyEnabled } from './history.js';

const PACK_CREDITS = positiveInt(process.env.CREDIT_PACK_SIZE, 25);
const PACK_PRICE_CENTS = positiveInt(process.env.CREDIT_PACK_PRICE_CENTS, 999);
const CURRENCY = 'eur';

function positiveInt(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

/** Stripe-Keys erst zur Laufzeit lesen (die .env wird in app.ts nach den Imports geladen). */
function stripeKeys() {
  return {
    secret: process.env.STRIPE_SECRET_KEY?.trim() ?? '',
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() ?? '',
  };
}

let stripeClient: Stripe | null = null;
function stripe(): Stripe {
  const { secret } = stripeKeys();
  if (!secret) {
    throw new ProxyError(503, 'Der Kauf von Guthaben ist noch nicht eingerichtet.', {
      hint: 'STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET in der .env (bzw. als Vercel Environment Variables) setzen.',
    });
  }
  stripeClient ??= new Stripe(secret);
  return stripeClient;
}

/** Guthaben wird nur verlangt, wenn Supabase eingerichtet ist (sonst gibt es ohnehin keinen Login). */
export function creditsEnabled(): boolean {
  return historyEnabled();
}

export async function getCredits(userId: string): Promise<number> {
  const { data, error } = await getClient().from('profiles').select('credits').eq('id', userId).maybeSingle();
  if (error) throw new ProxyError(502, 'Das Guthaben konnte nicht geladen werden.');
  return (data as { credits?: number } | null)?.credits ?? 0;
}

/** Zieht 1 Credit ab. Gibt das Restguthaben zurück oder wirft 402, wenn keins mehr da ist. */
export async function consumeCredit(userId: string): Promise<number> {
  const { data, error } = await getClient().rpc('consume_credit', { p_user: userId });
  if (error) throw new ProxyError(502, 'Das Guthaben konnte nicht geprüft werden.');
  if (typeof data !== 'number') {
    throw new ProxyError(402, 'Dein Guthaben ist aufgebraucht.', {
      hint: 'Kaufe neues Guthaben über „Guthaben kaufen“, um weitere Bilder zu erstellen.',
    });
  }
  return data;
}

/** Gibt 1 Credit zurück (Generierung fehlgeschlagen). Fehler werden nur geloggt. */
export async function refundCredit(userId: string): Promise<void> {
  const { error } = await getClient().rpc('refund_credit', { p_user: userId });
  if (error) console.warn('[kleiderstudio] Credit konnte nicht zurückgegeben werden:', error.message);
}

function originOf(req: Request): string {
  return `${req.protocol}://${req.get('host')}`;
}

export function createBilling(requireUser: (req: Request, res: Response, next: NextFunction) => void) {
  const router = express.Router();

  /** Aktuelles Guthaben und das Kaufangebot; mit ?session=cs_… zusätzlich, ob dieser Kauf schon gutgeschrieben ist. */
  router.get('/', requireUser, async (req, res, next) => {
    try {
      const userId = currentUser(res).id;
      const session = typeof req.query.session === 'string' ? req.query.session : '';
      let purchaseGranted: boolean | undefined;
      if (/^cs_[A-Za-z0-9_]{10,200}$/.test(session)) {
        const { data, error } = await getClient()
          .from('credit_purchases')
          .select('stripe_session_id')
          .eq('stripe_session_id', session)
          .eq('user_id', userId)
          .maybeSingle();
        if (error) throw new ProxyError(502, 'Der Kauf konnte nicht geprüft werden.');
        purchaseGranted = Boolean(data);
      }
      res.set('Cache-Control', 'no-store').json({
        credits: await getCredits(userId),
        purchaseGranted,
        purchaseEnabled: Boolean(stripeKeys().secret && stripeKeys().webhookSecret),
        pack: { credits: PACK_CREDITS, priceCents: PACK_PRICE_CENTS, currency: CURRENCY },
      });
    } catch (error) {
      next(error);
    }
  });

  /** Legt eine Stripe-Checkout-Session an und gibt die URL der Bezahlseite zurück. */
  router.post('/checkout', requireUser, async (req, res, next) => {
    try {
      const user = currentUser(res);
      const origin = originOf(req);
      const session = await stripe().checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: CURRENCY,
              unit_amount: PACK_PRICE_CENTS,
              product_data: { name: `${PACK_CREDITS} Bilder – Kleiderstudio` },
            },
          },
        ],
        client_reference_id: user.id,
        customer_email: user.email || undefined,
        metadata: { user_id: user.id, credits: String(PACK_CREDITS) },
        // {CHECKOUT_SESSION_ID} ersetzt Stripe selbst; die App fragt damit nach, ob genau dieser Kauf gebucht ist.
        success_url: `${origin}/?kauf=ok&session={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/?kauf=abbruch`,
      });
      if (!session.url) throw new ProxyError(502, 'Die Bezahlseite konnte nicht erstellt werden.');
      res.json({ url: session.url });
    } catch (error) {
      if (error instanceof ProxyError) {
        next(error);
        return;
      }
      console.warn('[kleiderstudio] Stripe Checkout fehlgeschlagen:', (error as Error).message);
      next(new ProxyError(502, 'Die Bezahlseite konnte nicht erstellt werden.'));
    }
  });

  /**
   * Stripe-Webhook: schreibt Guthaben nach erfolgreicher Zahlung gut. Braucht den Rohkörper für die Signaturprüfung.
   * Doppelte Zustellungen sind harmlos (grant_credits ist pro Session idempotent).
   */
  router.post('/webhook', express.raw({ type: '*/*', limit: '1mb' }), async (req, res) => {
    const { webhookSecret } = stripeKeys();
    const signature = req.get('stripe-signature');
    if (!webhookSecret || !signature || !Buffer.isBuffer(req.body)) {
      res.status(400).json({ error: 'Ungültige Webhook-Anfrage.' });
      return;
    }

    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(req.body, signature, webhookSecret);
    } catch {
      res.status(400).json({ error: 'Signatur ungültig.' });
      return;
    }

    try {
      if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
        const session = event.data.object;
        const userId = session.metadata?.user_id ?? session.client_reference_id ?? '';
        const credits = Number(session.metadata?.credits);
        if (session.payment_status === 'paid' && userId && Number.isInteger(credits) && credits > 0) {
          const { error } = await getClient().rpc('grant_credits', {
            p_session: session.id,
            p_user: userId,
            p_credits: credits,
            p_amount: session.amount_total ?? null,
            p_currency: session.currency ?? null,
          });
          // Fehler => 500, damit Stripe die Zustellung später wiederholt.
          if (error) throw new Error(error.message);
        }
      }
      res.json({ received: true });
    } catch (error) {
      console.error('[kleiderstudio] Stripe-Webhook fehlgeschlagen:', (error as Error).message);
      res.status(500).json({ error: 'Gutschrift fehlgeschlagen.' });
    }
  });

  return router;
}
