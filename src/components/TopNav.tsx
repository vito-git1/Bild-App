import { LoaderCircle, LogOut } from 'lucide-react';
import type { AuthUser, View } from '../types';

const TABS: Array<{ value: View; label: string }> = [
  { value: 'studio', label: 'Studio' },
  { value: 'history', label: 'Verlauf' },
];

interface TopNavProps {
  /** null = abgemeldet: dann nur Logo, keine Navigation. */
  user: AuthUser | null;
  view: View;
  onViewChange: (view: View) => void;
  onLoadSamples: () => void;
  loadingSamples: boolean;
  onLogout: () => void;
}

export function TopNav({ user, view, onViewChange, onLoadSamples, loadingSamples, onLogout }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <span className="flex min-w-0 items-center gap-2 font-display text-[17px] font-extrabold tracking-tight">
          <span className="h-3 w-5 shrink-0 rounded-[3px] border border-tape-edge bg-tape" aria-hidden />
          <span className="truncate">Kleiderstudio</span>
        </span>

        {user ? (
          <nav aria-label="Ansichten" className="flex items-center">
            {TABS.map((tab) => {
              const active = tab.value === view;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onViewChange(tab.value)}
                  className={[
                    'relative h-14 px-2.5 text-sm font-semibold transition-colors sm:px-3',
                    // Aktiver Tab: Maßband-Streifen unten, der beim Wechsel aufgezogen wird.
                    "after:absolute after:inset-x-2.5 after:bottom-0 after:h-[3px] after:origin-left after:rounded-t-sm after:bg-tape after:transition-transform after:duration-300 after:ease-out-soft after:content-[''] sm:after:inset-x-3",
                    active ? 'text-fg after:scale-x-100' : 'text-muted after:scale-x-0 hover:text-fg',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </nav>
        ) : (
          <span />
        )}

        {user && (
          <div className="flex items-center justify-end gap-1 sm:gap-2">
            <button type="button" className="btn-secondary" onClick={onLoadSamples} disabled={loadingSamples}>
              {loadingSamples && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              <span className="hidden sm:inline">Beispiel laden</span>
              <span className="sm:hidden">Beispiel</span>
            </button>
            <span className="hidden max-w-[12rem] truncate text-sm text-muted lg:inline" title={user.email}>
              {user.name}
            </span>
            <button type="button" className="btn-ghost h-8 px-2.5" onClick={onLogout} title={`Abmelden (${user.email})`}>
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">Abmelden</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
