import { ArrowLeftRight, LoaderCircle, Shirt, X } from 'lucide-react';

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

/** Zentrierter „Anprobieren“-Button mit kleinen Zusatzaktionen darunter. */
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
        className="group inline-flex h-14 min-w-52 items-center justify-center gap-2.5 rounded-full bg-fg px-8 font-display text-lg font-bold tracking-tight text-white shadow-[0_12px_28px_-12px_rgb(23_32_54/0.7)] transition-[transform,background-color,box-shadow] duration-200 ease-out-soft enabled:hover:-translate-y-0.5 enabled:hover:bg-accent enabled:hover:shadow-[0_16px_32px_-12px_rgb(44_79_184/0.6)] enabled:active:translate-y-0 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-raised disabled:text-subtle disabled:shadow-none"
      >
        {sending ? (
          <LoaderCircle className="size-5 animate-spin" aria-hidden />
        ) : (
          <Shirt
            className="size-5 transition-transform duration-300 ease-out-soft group-enabled:group-hover:-rotate-12"
            aria-hidden
          />
        )}
        {sending ? 'Anprobe läuft …' : 'Anprobieren'}
      </button>

      <p className="min-h-4 text-xs text-muted">{sending ? '' : blockedReason ?? 'oder Strg+Enter'}</p>

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
