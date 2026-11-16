import { CircleCheck, Coins, LoaderCircle, X } from 'lucide-react';
import { formatPrice, type BillingInfo } from '../lib/billing';

interface CreditsBarProps {
  billing: BillingInfo | null;
  buying: boolean;
  error: string | null;
  notice: string | null;
  onBuy: () => void;
  onDismissNotice: () => void;
}

/** Zeigt das Restguthaben und den Kauf-Knopf über dem Studio. */
export function CreditsBar({ billing, buying, error, notice, onBuy, onDismissNotice }: CreditsBarProps) {
  if (!billing) return null;
  const empty = billing.credits <= 0;
  const price = formatPrice(billing.pack.priceCents, billing.pack.currency);

  return (
    <div className="flex flex-col gap-2">
      {notice && (
        <div className="flex items-start gap-2 rounded-lg bg-raised px-3 py-2 text-sm" role="status">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden />
          <span className="flex-1">{notice}</span>
          <button type="button" className="text-muted hover:text-fg" onClick={onDismissNotice} aria-label="Hinweis schließen">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <div
        className={[
          'card flex flex-wrap items-center justify-between gap-3 px-4 py-3',
          empty ? 'border-danger/40' : '',
        ].join(' ')}
      >
        <div className="flex items-center gap-2 text-sm">
          <Coins className="size-4 text-muted" aria-hidden />
          {empty ? (
            <span className="font-medium text-danger">Dein Guthaben ist aufgebraucht.</span>
          ) : (
            <span>
              Noch <strong>{billing.credits}</strong> {billing.credits === 1 ? 'Bild' : 'Bilder'}
            </span>
          )}
        </div>
        {billing.purchaseEnabled && (
          <button
            type="button"
            className={[empty ? 'btn-primary' : 'btn-secondary', 'h-9'].join(' ')}
            onClick={onBuy}
            disabled={buying}
          >
            {buying && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            {billing.pack.credits} Bilder für {price}
          </button>
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
