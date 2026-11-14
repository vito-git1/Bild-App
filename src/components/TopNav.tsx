import { LoaderCircle } from 'lucide-react';
import type { View } from '../types';

const TABS: Array<{ value: View; label: string }> = [
  { value: 'studio', label: 'Studio' },
  { value: 'history', label: 'Verlauf' },
];

interface TopNavProps {
  view: View;
  onViewChange: (view: View) => void;
  onLoadSamples: () => void;
  loadingSamples: boolean;
}

export function TopNav({ view, onViewChange, onLoadSamples, loadingSamples }: TopNavProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-canvas/95 backdrop-blur">
      <div className="mx-auto grid h-14 max-w-[1440px] grid-cols-[1fr_auto_1fr] items-center gap-3 px-4 sm:px-6">
        <span className="truncate font-display text-[15px] font-semibold tracking-tight">Kleiderstudio</span>

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

        <div className="flex justify-end">
          <button type="button" className="btn-secondary" onClick={onLoadSamples} disabled={loadingSamples}>
            {loadingSamples && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
            <span className="hidden sm:inline">Beispiel laden</span>
            <span className="sm:hidden">Beispiel</span>
          </button>
        </div>
      </div>
    </header>
  );
}
