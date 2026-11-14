import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from './components/ActionBar';
import { HistoryView } from './components/HistoryView';
import { ResultPanel } from './components/ResultPanel';
import { TopNav } from './components/TopNav';
import { UploadSlot } from './components/UploadSlot';
import { sendToWebhook, WebhookError } from './lib/api';
import { addHistoryEntry } from './lib/historyDb';
import { createId } from './lib/id';
import {
  assetFromStored,
  createImageAsset,
  downloadBlob,
  prepareUpload,
  resultFilename,
  storedFromAsset,
} from './lib/image';
import { loadSamples } from './lib/samples';
import type { HistoryEntry, ImageAsset, RequestState, SlotKey, UploadFormat, View } from './types';

type SlotRecord<T> = Record<SlotKey, T>;

const SLOTS: Array<{ key: SlotKey; title: string; description: string }> = [
  { key: 'image1', title: 'Person', description: 'Bild der Person hochladen' },
  { key: 'image2', title: 'Kleidungsstück', description: 'Bild des Kleidungsstücks hochladen' },
];

/** Bilder werden vor dem Senden als WebP komprimiert (Fallback JPEG). */
const UPLOAD_FORMAT: UploadFormat = 'webp';

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA';
}

export default function App() {
  const [view, setView] = useState<View>('studio');

  const [assets, setAssets] = useState<SlotRecord<ImageAsset | null>>({ image1: null, image2: null });
  const [slotErrors, setSlotErrors] = useState<SlotRecord<string | null>>({ image1: null, image2: null });
  const [slotBusy, setSlotBusy] = useState<SlotRecord<boolean>>({ image1: false, image2: false });
  const [activeSlot, setActiveSlot] = useState<SlotKey>('image1');
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [request, setRequest] = useState<RequestState>({ status: 'idle' });

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const sending = request.status === 'loading';

  const blockedReason = useMemo<string | null>(() => {
    if (!assets.image1 && !assets.image2) return 'Bitte zwei Bilder hinzufügen.';
    if (!assets.image1) return 'Bitte ein Bild der Person hinzufügen.';
    if (!assets.image2) return 'Bitte ein Bild des Kleidungsstücks hinzufügen.';
    return null;
  }, [assets]);

  const canSend = blockedReason === null && !sending;

  // ---------- Bilder ----------

  const setSlot = useCallback((slot: SlotKey, asset: ImageAsset | null) => {
    setAssets((prev) => ({ ...prev, [slot]: asset }));
    setSlotErrors((prev) => ({ ...prev, [slot]: null }));
  }, []);

  const handleFile = useCallback(
    async (slot: SlotKey, file: Blob, name: string) => {
      setSlotBusy((prev) => ({ ...prev, [slot]: true }));
      setSlotErrors((prev) => ({ ...prev, [slot]: null }));
      try {
        setSlot(slot, await createImageAsset(file, name));
      } catch (error) {
        setSlotErrors((prev) => ({
          ...prev,
          [slot]: error instanceof Error ? error.message : 'Das Bild konnte nicht gelesen werden.',
        }));
      } finally {
        setSlotBusy((prev) => ({ ...prev, [slot]: false }));
      }
    },
    [setSlot],
  );

  const handleSwap = () => {
    setAssets((prev) => ({ image1: prev.image2, image2: prev.image1 }));
    setSlotErrors({ image1: null, image2: null });
  };

  const handleClear = () => {
    setAssets({ image1: null, image2: null });
    setSlotErrors({ image1: null, image2: null });
  };

  const handleLoadSamples = async () => {
    setLoadingSamples(true);
    try {
      const samples = await loadSamples();
      setAssets(samples);
      setSlotErrors({ image1: null, image2: null });
      setView('studio');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Beispielbilder konnten nicht geladen werden.';
      setSlotErrors({ image1: message, image2: null });
    } finally {
      setLoadingSamples(false);
    }
  };

  // ---------- Senden ----------

  const send = useCallback(async () => {
    const { image1, image2 } = assets;
    if (!image1 || !image2 || blockedReason) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const requestId = ++requestIdRef.current;
    const format = UPLOAD_FORMAT;
    const isCurrent = () => requestIdRef.current === requestId;

    setRequest({ status: 'loading', startedAt: Date.now() });

    try {
      const [upload1, upload2] = await Promise.all([prepareUpload(image1, format), prepareUpload(image2, format)]);
      if (controller.signal.aborted) throw new WebhookError({ message: 'Die Anfrage wurde abgebrochen.', aborted: true });

      const response = await sendToWebhook({
        image1: upload1,
        image2: upload2,
        signal: controller.signal,
      });

      const createdAt = Date.now();
      let output: ImageAsset;
      try {
        output = await createImageAsset(response.blob, resultFilename(response.mime, createdAt));
      } catch {
        throw new WebhookError({ message: 'Das Ergebnis konnte nicht als Bild gelesen werden.' });
      }
      if (!isCurrent()) return;

      setRequest({
        status: 'success',
        result: {
          output,
          inputs: { image1, image2 },
          durationMs: response.durationMs,
          source: response.source,
        },
      });

      const entry: HistoryEntry = {
        id: createId(),
        createdAt,
        durationMs: response.durationMs,
        uploadFormat: format,
        source: response.source,
        image1: storedFromAsset(image1),
        image2: storedFromAsset(image2),
        output: storedFromAsset(output),
      };
      addHistoryEntry(entry)
        .then(() => setHistoryRevision((value) => value + 1))
        .catch((error: unknown) => console.warn('Verlauf konnte nicht gespeichert werden:', error));
    } catch (error) {
      if (!isCurrent()) return;
      const failure =
        error instanceof WebhookError
          ? error.failure
          : { message: error instanceof Error ? error.message : 'Unbekannter Fehler beim Senden.' };
      setRequest({ status: 'error', failure });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [assets, blockedReason]);

  const handleAbort = () => abortRef.current?.abort();

  // Laufende Anfrage beim Schließen abbrechen.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ---------- Tastatur & Zwischenablage ----------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view !== 'studio') return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) {
        event.preventDefault();
        void send();
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (view !== 'studio' || isEditableTarget(event.target)) return;
      const file = Array.from(event.clipboardData?.files ?? []).find((item) => item.type.startsWith('image/'));
      if (!file) return;
      event.preventDefault();
      const name = file.name && file.name !== 'image.png' ? file.name : `eingefuegt-${Date.now()}.${file.type.split('/')[1] ?? 'png'}`;
      void handleFile(activeSlot, file, name);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('paste', onPaste);
    };
  }, [view, canSend, send, handleFile, activeSlot]);

  // ---------- Ergebnis & Verlauf ----------

  const handleDownloadOutput = (output: ImageAsset) => downloadBlob(output.blob, output.name);

  const handleUseAsImage1 = (output: ImageAsset) => {
    setSlot('image1', { ...output, id: createId() });
  };

  const handleRestore = (entry: HistoryEntry) => {
    const image1 = assetFromStored(entry.image1);
    const image2 = assetFromStored(entry.image2);
    setAssets({ image1, image2 });
    setSlotErrors({ image1: null, image2: null });
    setRequest({
      status: 'success',
      result: {
        output: assetFromStored(entry.output),
        inputs: { image1, image2 },
        durationMs: entry.durationMs,
        source: entry.source,
      },
    });
    setView('studio');
  };

  const handleDownloadEntry = (entry: HistoryEntry) =>
    downloadBlob(entry.output.blob, resultFilename(entry.output.type, entry.createdAt));

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav view={view} onViewChange={setView} onLoadSamples={handleLoadSamples} loadingSamples={loadingSamples} />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {view === 'studio' && (
          <div className="mx-auto flex max-w-[820px] flex-col gap-8 pt-4 sm:pt-8">
            <header className="text-center">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">KI-Bild-Generator</h1>
              <p className="mt-3 text-[15px] text-muted sm:text-base">
                Lade ein Personenbild und ein Kleidungsstück hoch, um ein neues Bild zu generieren
              </p>
            </header>

            <div className="flex flex-col gap-6">
              <div className="flex flex-col gap-6">
                <div className="grid gap-5 sm:grid-cols-2">
                  {SLOTS.map((slot) => (
                    <UploadSlot
                      key={slot.key}
                      slot={slot.key}
                      title={slot.title}
                      description={slot.description}
                      asset={assets[slot.key]}
                      error={slotErrors[slot.key]}
                      busy={slotBusy[slot.key]}
                      active={activeSlot === slot.key}
                      onActivate={setActiveSlot}
                      onFile={(key, file) => void handleFile(key, file, file.name)}
                      onRemove={(key) => setSlot(key, null)}
                    />
                  ))}
                </div>
                <ActionBar
                  canSwap={Boolean(assets.image1 || assets.image2)}
                  canClear={Boolean(assets.image1 || assets.image2)}
                  canSend={canSend}
                  sending={sending}
                  blockedReason={sending ? null : blockedReason}
                  onSwap={handleSwap}
                  onClear={handleClear}
                  onSend={() => void send()}
                />
              </div>

              {request.status !== 'idle' && (
                <ResultPanel
                  state={request}
                  onAbort={handleAbort}
                  onRetry={() => void send()}
                  canRetry={canSend}
                  onUseAsImage1={handleUseAsImage1}
                  onDownload={handleDownloadOutput}
                />
              )}
            </div>

            <p className="pb-4 text-center text-xs text-subtle">Powered by KI-Bildgenerierung</p>
          </div>
        )}

        {view === 'history' && (
          <HistoryView revision={historyRevision} onRestore={handleRestore} onDownload={handleDownloadEntry} />
        )}

      </main>
    </div>
  );
}
