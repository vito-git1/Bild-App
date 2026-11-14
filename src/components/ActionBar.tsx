import { ArrowLeftRight, LoaderCircle, Sparkles, X } from 'lucide-react';

interface ActionBarProps {
  canSwap: boolean;
  canClear: boolean;
  canSend: boolean;
  sending: boolean;
  blockedReason: string | null;
  onSwap: () => void;
  onClear: () => void;
  onSend: () => void;
}

/** Zentrierter „Generieren“-Button mit kleinen Zusatzaktionen darunter. */
export function ActionBar({
  canSwap,
  canClear,
  canSend,
  sending,
  blockedReason,
  onSwap,
  onClear,
  onSend,
}: ActionBarProps) {
  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onSend}
        disabled={!canSend}
        title={blockedReason ?? 'Strg+Enter'}
        className="inline-flex h-12 min-w-44 items-center justify-center gap-2 rounded-xl bg-fg px-7 text-[15px] font-semibold text-white shadow-[0_4px_14px_rgb(30_33_48/0.18)] transition enabled:hover:-translate-y-px enabled:hover:bg-black disabled:cursor-not-allowed disabled:bg-raised disabled:text-subtle disabled:shadow-[0_2px_8px_rgb(30_33_48/0.08)]"
      >
        {sending ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="size-4" aria-hidden />
        )}
        {sending ? 'Wird generiert …' : 'Generieren'}
      </button>

      <p className="min-h-4 text-xs text-subtle">{sending ? '' : blockedReason ?? 'oder Strg+Enter'}</p>

      {(canSwap || canClear) && (
        <div className="flex gap-1">
          <button type="button" className="btn-ghost h-8 px-2.5 text-xs" onClick={onSwap} disabled={!canSwap}>
            <ArrowLeftRight className="size-3.5" aria-hidden />
            Tauschen
          </button>
          <button type="button" className="btn-ghost h-8 px-2.5 text-xs" onClick={onClear} disabled={!canClear}>
            <X className="size-3.5" aria-hidden />
            Leeren
          </button>
        </div>
      )}
    </div>
  );
}
