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
        <span className="truncate font-display text-[15px] font-semibold tracking-tight">Kleiderstudio</span>

        {user ? (
          <nav aria-label="Ansichten" className="flex items-center gap-1">
            {TABS.map((tab) => {
              const active = tab.value === view;
              return (
                <button
                  key={tab.value}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onViewChange(tab.value)}
                  className={[
                    'h-8 rounded-md px-2.5 text-sm font-medium transition-colors sm:px-3',
                    active ? 'bg-raised text-fg' : 'text-muted hover:text-fg',
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
