import { CircleCheck, Coins, LoaderCircle, X } from 'lucide-react';
import { useId, useState } from 'react';
import { formatPrice, type BillingInfo } from '../lib/billing';

interface CreditsBarProps {
  billing: BillingInfo | null;
  buying: boolean;
  error: string | null;
  notice: string | null;
  onBuy: (waiverAccepted: boolean) => void;
  onDismissNotice: () => void;
}

/** Zeigt das Restguthaben und den Kauf-Knopf (mit Pflicht-Zustimmung zum Widerrufsverzicht) über dem Studio. */
export function CreditsBar({ billing, buying, error, notice, onBuy, onDismissNotice }: CreditsBarProps) {
  const [confirming, setConfirming] = useState(false);
  const [waiver, setWaiver] = useState(false);
  const id = useId();

  if (!billing) return null;
  const empty = billing.credits <= 0;
  const price = formatPrice(billing.pack.priceCents, billing.pack.currency);
  const packLabel = `${billing.pack.credits} Bilder für ${price}`;

  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <div className="flex animate-slide-down items-start gap-2 rounded-lg bg-raised px-3 py-2 text-sm" role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button type="button" className="text-muted hover:text-fg" onClick={onDismissNotice} aria-label="Hinweis schließen">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div className={['card flex flex-col gap-3 px-4 py-3', empty ? 'border-danger/40' : ''].join(' ')}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm">
            <Coins className="size-4 text-muted" aria-hidden />
            {empty ? (
              <span className="font-medium text-danger">Dein Guthaben ist aufgebraucht.</span>
            ) : (
              <span>
                Noch{' '}
                {/* key: Zahl hüpft kurz, wenn sich das Guthaben ändert */}
                <strong key={billing.credits} className="inline-block animate-pop font-display text-base tabular-nums">
                  {billing.credits}
                </strong>{' '}
                {billing.credits === 1 ? 'Bild' : 'Bilder'}
              </span>
            )}
          </div>
          {billing.purchaseEnabled && !confirming && (
            <button
              type="button"
              className={[empty ? 'btn-primary' : 'btn-secondary', 'h-9'].join(' ')}
              onClick={() => setConfirming(true)}
            >
              {packLabel}
            </button>
          )}
        </div>

        {billing.purchaseEnabled && confirming && (
          <div className="flex animate-slide-down flex-col gap-3 border-t border-line pt-3">
            <label className="flex items-start gap-2.5 text-sm" htmlFor={`${id}-waiver`}>
              <input
                id={`${id}-waiver`}
                type="checkbox"
                className="mt-1 size-4 shrink-0 accent-fg"
                checked={waiver}
                onChange={(event) => setWaiver(event.target.checked)}
              />
              <span>
                Ich verlange ausdrücklich, dass das Guthaben sofort nach der Zahlung gutgeschrieben wird. Mir ist bekannt,
                dass ich dadurch mein{' '}
                <a href="/widerruf" target="_blank" rel="noopener" className="underline underline-offset-2">
                  Widerrufsrecht
                </a>{' '}
                verliere. Es gelten die{' '}
                <a href="/agb" target="_blank" rel="noopener" className="underline underline-offset-2">
                  AGB
                </a>
                .
              </span>
            </label>
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="btn-ghost h-9"
                onClick={() => {
                  setConfirming(false);
                  setWaiver(false);
                }}
                disabled={buying}
              >
                Abbrechen
              </button>
              <button type="button" className="btn-primary h-9" onClick={() => onBuy(waiver)} disabled={!waiver || buying}>
                {buying && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                Zahlungspflichtig kaufen – {price}
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
