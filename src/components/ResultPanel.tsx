import { Download, Expand, RotateCcw, Undo2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { TapeMeasure } from './TapeMeasure';
import { useElapsed } from '../hooks/useElapsed';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { formatSeconds } from '../lib/format';
import type { GenerationResult, ImageAsset, RequestState, ResultMode } from '../types';
import { CompareSlider } from './CompareSlider';
import { ImageMeta } from './ImageMeta';
import { Lightbox } from './Lightbox';
import { SegmentedControl } from './SegmentedControl';

const MODE_OPTIONS: Array<{ value: ResultMode; label: string }> = [
  { value: 'result', label: 'Ergebnis' },
  { value: 'compare', label: 'Vergleich' },
  { value: 'all', label: 'Alle 3' },
];

interface ResultPanelProps {
  state: RequestState;
  onAbort: () => void;
  onRetry: () => void;
  canRetry: boolean;
  onUseAsImage1: (output: ImageAsset) => void;
  onDownload: (output: ImageAsset) => void;
}

export function ResultPanel({ state, onAbort, onRetry, canRetry, onUseAsImage1, onDownload }: ResultPanelProps) {
  return (
    <section className="card flex min-h-0 animate-view-in flex-col" aria-label="Ergebnis" aria-live="polite">
      {state.status === 'success' ? (
        <SuccessView key={state.result.output.id} result={state.result} onUseAsImage1={onUseAsImage1} onDownload={onDownload} />
      ) : (
        <>
          <PanelHeader title="Ergebnis" />
          <Stage>
            {state.status === 'idle' && <EmptyView />}
            {state.status === 'loading' && (
              <LoadingView startedAt={state.startedAt} onAbort={onAbort} />
            )}
            {state.status === 'error' && (
              <ErrorView state={state} onRetry={onRetry} canRetry={canRetry} />
            )}
          </Stage>
        </>
      )}
    </section>
  );
}

function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex min-h-14 flex-wrap items-center justify-between gap-3 px-4 py-3">
      <h2 className="text-lg font-bold tracking-tight">{title}</h2>
      {children}
    </header>
  );
}

function Stage({ children }: { children: ReactNode }) {
  return (
    <div
      className="relative mx-4 flex h-[min(70vh,720px)] min-h-[360px] items-center justify-center overflow-hidden rounded-xl border border-line bg-canvas"
      style={{ containerType: 'size' }}
    >
      {children}
    </div>
  );
}

function EmptyView() {
  return (
    <div className="flex max-w-sm flex-col items-center gap-5 px-6 text-center">
      <p className="text-sm leading-relaxed text-muted">
        Füge oben eine Person und ein Kleidungsstück hinzu und tippe auf „Anprobieren“. Das Ergebnis erscheint hier.
      </p>
    </div>
  );
}

function LoadingView({ startedAt, onAbort }: { startedAt: number; onAbort: () => void }) {
  const elapsed = useElapsed(startedAt);
  return (
    <div className="flex w-full max-w-md animate-fade-in flex-col items-center gap-5 px-6 text-center">
      <div>
        <p className="font-display text-5xl font-extrabold tracking-tight tabular-nums [font-stretch:80%]">
          {formatSeconds(elapsed)}
        </p>
        <p className="mt-2 text-sm text-muted">Wir nehmen Maß und passen das Teil an. Das dauert meist unter einer Minute.</p>
      </div>
      <TapeMeasure motion="run" className="w-full max-w-xs" />
      <button type="button" className="btn-secondary" onClick={onAbort}>
        Anfrage abbrechen
      </button>
    </div>
  );
}

function ErrorView({
  state,
  onRetry,
  canRetry,
}: {
  state: Extract<RequestState, { status: 'error' }>;
  onRetry: () => void;
  canRetry: boolean;
}) {
  const { failure } = state;
  const hint =
    failure.hint ??
    (failure.httpStatus === 404
      ? 'Der Webhook wurde nicht gefunden. Prüfe in n8n, ob der Workflow aktiviert ist und der Pfad exakt stimmt.'
      : undefined);

  return (
    <div className="flex h-full w-full animate-fade-in flex-col gap-4 overflow-y-auto p-5">
      <div>
        <p className="font-display text-base font-semibold">
          {failure.aborted ? 'Anprobe abgebrochen' : 'Anprobe fehlgeschlagen'}
          {failure.httpStatus !== undefined && (
            <span className="ml-2 font-mono text-sm font-medium text-danger tabular-nums">HTTP {failure.httpStatus}</span>
          )}
        </p>
        <p className="mt-1 text-sm text-muted">{failure.message}</p>
      </div>

      {hint && <p className="border-l-2 border-notice/60 pl-3 text-sm text-fg/90">{hint}</p>}

      {failure.rawBody && (
        <details className="group min-h-0">
          <summary className="cursor-pointer text-xs font-medium text-muted hover:text-fg">Technische Details</summary>
          <pre className="mt-1.5 max-h-64 animate-slide-down overflow-auto rounded-lg border border-line bg-surface p-3 font-mono text-xs leading-relaxed whitespace-pre-wrap break-all text-fg/90">
            {failure.rawBody}
          </pre>
        </details>
      )}

      <div>
        <button type="button" className="btn-secondary" onClick={onRetry} disabled={!canRetry}>
          <RotateCcw className="size-4" aria-hidden />
          Erneut anprobieren
        </button>
      </div>
    </div>
  );
}

function SuccessView({
  result,
  onUseAsImage1,
  onDownload,
}: {
  result: GenerationResult;
  onUseAsImage1: (output: ImageAsset) => void;
  onDownload: (output: ImageAsset) => void;
}) {
  const [mode, setMode] = useState<ResultMode>('result');
  const [lightboxOpen, setLightboxOpen] = useState(false);
  /** Vorhang wird nur beim ersten Anzeigen eines Ergebnisses gezeigt und danach entfernt. */
  const [curtain, setCurtain] = useState(true);
  const outputUrl = useObjectUrl(result.output.blob);
  const image1Url = useObjectUrl(result.inputs.image1.blob);
  const image2Url = useObjectUrl(result.inputs.image2.blob);
  const { output } = result;

  return (
    <>
      <PanelHeader title="Ergebnis">
        <SegmentedControl label="Ansicht" options={MODE_OPTIONS} value={mode} onChange={setMode} size="sm" />
      </PanelHeader>

      <Stage>
        {curtain && (
          <>
            <span className="curtain curtain-left" aria-hidden />
            <span className="curtain curtain-right" aria-hidden onAnimationEnd={() => setCurtain(false)} />
          </>
        )}
        {outputUrl && mode === 'result' && (
          <button
            type="button"
            className="size-full cursor-zoom-in"
            onClick={() => setLightboxOpen(true)}
            aria-label="Ergebnis im Vollbild anzeigen"
          >
            <img src={outputUrl} alt="Ergebnis" className={['size-full object-contain', curtain ? 'curtain-reveal' : ''].join(' ')} />
          </button>
        )}
        {outputUrl && image1Url && mode === 'compare' && (
          <CompareSlider beforeUrl={image1Url} afterUrl={outputUrl} width={output.width} height={output.height} />
        )}
        {mode === 'all' && (
          <div className="grid size-full grid-cols-3 gap-px bg-line">
            {[
              { url: image1Url, label: 'Person' },
              { url: image2Url, label: 'Kleidungsstück' },
              { url: outputUrl, label: 'Ergebnis' },
            ].map((item) => (
              <figure key={item.label} className="flex min-w-0 animate-fade-in flex-col bg-canvas">
                <div className="flex min-h-0 flex-1 items-center justify-center p-2">
                  {item.url && <img src={item.url} alt={item.label} className="max-h-full max-w-full object-contain" />}
                </div>
                <figcaption className="truncate border-t border-line px-2 py-1.5 text-center text-xs text-muted">
                  {item.label}
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </Stage>

      <footer className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <ImageMeta
          asset={output}
          extra={[formatSeconds(result.durationMs)]}
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-ghost" onClick={() => setLightboxOpen(true)}>
            <Expand className="size-4" aria-hidden />
            Vollbild
          </button>
          <button type="button" className="btn-secondary" onClick={() => onUseAsImage1(output)}>
            <Undo2 className="size-4" aria-hidden />
            Als Person übernehmen
          </button>
          <button type="button" className="btn-primary" onClick={() => onDownload(output)}>
            <Download className="size-4" aria-hidden />
            Herunterladen
          </button>
        </div>
      </footer>

      {lightboxOpen && outputUrl && (
        <Lightbox
          url={outputUrl}
          alt="Ergebnis"
          caption={output.name}
          onDownload={() => onDownload(output)}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
