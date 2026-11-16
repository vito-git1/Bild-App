import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import { ActionBar } from './components/ActionBar';
import { AuthView } from './components/AuthView';
import { CreditsBar } from './components/CreditsBar';
import { HistoryView } from './components/HistoryView';
import { LegalFooter } from './components/LegalFooter';
import { ResultPanel } from './components/ResultPanel';
import { TopNav } from './components/TopNav';
import { UploadSlot } from './components/UploadSlot';
import { sendToWebhook, WebhookError } from './lib/api';
import { messageOf, setUnauthorizedHandler } from './lib/apiClient';
import { getCurrentUser, logout } from './lib/auth';
import { getBilling, startCheckout, type BillingInfo } from './lib/billing';
import { assetFromHistory, fetchHistoryBlob } from './lib/history';
import { createId } from './lib/id';
import { createImageAsset, downloadBlob, prepareUpload, resultFilename } from './lib/image';
import { loadSamples } from './lib/samples';
import type { AuthUser, HistoryEntry, ImageAsset, RequestState, SlotKey, UploadFormat, View } from './types';

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
  /** undefined = wird geprüft, null = abgemeldet. */
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined);
  const [view, setView] = useState<View>('studio');

  const [assets, setAssets] = useState<SlotRecord<ImageAsset | null>>({ image1: null, image2: null });
  const [slotErrors, setSlotErrors] = useState<SlotRecord<string | null>>({ image1: null, image2: null });
  const [slotBusy, setSlotBusy] = useState<SlotRecord<boolean>>({ image1: false, image2: false });
  const [activeSlot, setActiveSlot] = useState<SlotKey>('image1');
  const [loadingSamples, setLoadingSamples] = useState(false);
  const [historyRevision, setHistoryRevision] = useState(0);
  const [request, setRequest] = useState<RequestState>({ status: 'idle' });
  const [billing, setBilling] = useState<BillingInfo | null>(null);
  const [buying, setBuying] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [billingNotice, setBillingNotice] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  // ---------- Guthaben ----------

  const refreshBilling = useCallback(async (session?: string) => {
    try {
      const info = await getBilling(session);
      setBilling(info);
      return info;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setBilling(null);
      return;
    }
    // Rückkehr von Stripe (?kauf=ok / ?kauf=abbruch): Hinweis zeigen und die URL aufräumen.
    const params = new URLSearchParams(window.location.search);
    const purchase = params.get('kauf');
    const session = params.get('session') ?? undefined;
    if (purchase) window.history.replaceState(null, '', window.location.pathname);

    void (async () => {
      if (purchase === 'abbruch') {
        await refreshBilling();
        setBillingNotice('Kauf abgebrochen – es wurde nichts berechnet.');
        return;
      }
      if (purchase !== 'ok' || !session) {
        await refreshBilling();
        return;
      }
      setBillingNotice('Danke für deinen Kauf! Dein Guthaben wird gutgeschrieben …');
      // Stripe meldet die Zahlung per Webhook – das kann ein paar Sekunden dauern (oder ist schon passiert).
      for (let attempt = 0; attempt < 15; attempt += 1) {
        const info = await refreshBilling(session);
        if (info?.purchaseGranted) {
          setBillingNotice(`Danke für deinen Kauf! Du hast jetzt ${info.credits} Bilder.`);
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
      setBillingNotice('Danke für deinen Kauf! Die Gutschrift kann noch einen Moment dauern – lade die Seite gleich neu.');
    })();
  }, [user, refreshBilling]);

  const handleBuy = async (waiverAccepted: boolean) => {
    setBuying(true);
    setBillingError(null);
    try {
      await startCheckout(waiverAccepted);
    } catch (error) {
      setBillingError(messageOf(error, 'Die Bezahlseite konnte nicht geöffnet werden.'));
      setBuying(false);
    }
  };

  const sending = request.status === 'loading';

  const blockedReason = useMemo<string | null>(() => {
    if (!assets.image1 && !assets.image2) return 'Bitte zwei Bilder hinzufügen.';
    if (!assets.image1) return 'Bitte ein Bild der Person hinzufügen.';
    if (!assets.image2) return 'Bitte ein Bild des Kleidungsstücks hinzufügen.';
    if (billing && billing.credits <= 0) return 'Kein Guthaben mehr – bitte Guthaben kaufen.';
    return null;
  }, [assets, billing]);

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

      // Der Server speichert erfolgreiche Generierungen selbst im Cloud-Verlauf (Supabase).
      if (response.historySaved) setHistoryRevision((value) => value + 1);
    } catch (error) {
      if (!isCurrent()) return;
      const failure =
        error instanceof WebhookError
          ? error.failure
          : { message: error instanceof Error ? error.message : 'Unbekannter Fehler beim Senden.' };
      setRequest({ status: 'error', failure });
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
      void refreshBilling();
    }
  }, [assets, blockedReason, refreshBilling]);

  const handleAbort = () => abortRef.current?.abort();

  // Laufende Anfrage beim Schließen abbrechen.
  useEffect(() => () => abortRef.current?.abort(), []);

  // ---------- Anmeldung ----------

  /** Setzt das Studio zurück, damit nach dem Abmelden keine Bilder des vorherigen Kontos sichtbar bleiben. */
  const resetSession = useCallback(() => {
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setAssets({ image1: null, image2: null });
    setSlotErrors({ image1: null, image2: null });
    setRequest({ status: 'idle' });
    setView('studio');
  }, []);

  useEffect(() => {
    let cancelled = false;
    getCurrentUser()
      .then((current) => !cancelled && setUser(current))
      .catch(() => !cancelled && setUser(null));
    // Server meldet 401 => Session abgelaufen, zurück zur Anmeldung.
    setUnauthorizedHandler(() => {
      setUser(null);
      resetSession();
    });
    return () => {
      cancelled = true;
      setUnauthorizedHandler(null);
    };
  }, [resetSession]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.warn('Abmelden fehlgeschlagen:', error);
    }
    setUser(null);
    resetSession();
  };

  // ---------- Tastatur & Zwischenablage ----------

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (view !== 'studio' || !user) return;
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && canSend) {
        event.preventDefault();
        void send();
      }
    };

    const onPaste = (event: ClipboardEvent) => {
      if (view !== 'studio' || !user || isEditableTarget(event.target)) return;
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
  }, [view, user, canSend, send, handleFile, activeSlot]);

  // ---------- Ergebnis & Verlauf ----------

  const handleDownloadOutput = (output: ImageAsset) => downloadBlob(output.blob, output.name);

  const handleUseAsImage1 = (output: ImageAsset) => {
    setSlot('image1', { ...output, id: createId() });
  };

  /** Lädt die Bilder eines Verlaufseintrags vom Server und stellt sie im Studio wieder her. */
  const handleRestore = async (entry: HistoryEntry) => {
    const [image1, image2, output] = await Promise.all([
      assetFromHistory(entry.image1),
      assetFromHistory(entry.image2),
      assetFromHistory(entry.output),
    ]);
    abortRef.current?.abort();
    requestIdRef.current += 1;
    setAssets({ image1, image2 });
    setSlotErrors({ image1: null, image2: null });
    setRequest({
      status: 'success',
      result: {
        output: { ...output, name: resultFilename(output.type, entry.createdAt) },
        inputs: { image1, image2 },
        durationMs: entry.durationMs,
        source: entry.source,
      },
    });
    setView('studio');
  };

  const handleDownloadEntry = async (entry: HistoryEntry) => {
    downloadBlob(await fetchHistoryBlob(entry.output), resultFilename(entry.output.type, entry.createdAt));
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <TopNav
        user={user ?? null}
        view={view}
        onViewChange={setView}
        onLoadSamples={handleLoadSamples}
        loadingSamples={loadingSamples}
        onLogout={() => void handleLogout()}
      />

      <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 sm:py-8">
        {user === undefined && (
          <div className="flex justify-center pt-24">
            <LoaderCircle className="size-6 animate-spin text-muted" aria-label="Anmeldung wird geprüft" />
          </div>
        )}

        {user === null && <AuthView onAuthenticated={setUser} />}

        {user && view === 'studio' && (
          <div className="mx-auto flex max-w-[820px] flex-col gap-8 pt-4 sm:pt-8">
            <header className="text-center">
              <h1 className="font-display text-3xl font-bold tracking-tight sm:text-[2.5rem]">KI-Bild-Generator</h1>
              <p className="mt-3 text-[15px] text-muted sm:text-base">
                Lade ein Personenbild und ein Kleidungsstück hoch, um ein neues Bild zu generieren
              </p>
            </header>

            <CreditsBar
              billing={billing}
              buying={buying}
              error={billingError}
              notice={billingNotice}
              onBuy={(waiverAccepted) => void handleBuy(waiverAccepted)}
              onDismissNotice={() => setBillingNotice(null)}
            />

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

        {user && view === 'history' && (
          <HistoryView revision={historyRevision} onRestore={handleRestore} onDownload={handleDownloadEntry} />
        )}

      </main>
      <LegalFooter />
    </div>
  );
}
