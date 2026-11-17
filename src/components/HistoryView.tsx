import { Download, LoaderCircle, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDate, formatSeconds } from '../lib/format';
import { messageOf } from '../lib/apiClient';
import { deleteHistoryEntry, listHistoryEntries } from '../lib/history';
import type { HistoryEntry, HistoryImage } from '../types';
import { ImageMeta } from './ImageMeta';

interface HistoryViewProps {
  /** Wird nach jeder neuen Generierung erhöht, um die Liste neu zu laden. */
  revision: number;
  onRestore: (entry: HistoryEntry) => Promise<void>;
  onDownload: (entry: HistoryEntry) => Promise<void>;
}


export function HistoryView({ revision, onRestore, onDownload }: HistoryViewProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setEntries(await listHistoryEntries());
      setError(null);
    } catch (loadError) {
      setEntries([]);
      setError(messageOf(loadError, 'Der Verlauf konnte nicht geladen werden.'));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, revision]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!entries || !needle) return entries ?? [];
    return entries.filter((entry) =>
      [entry.image1.name, entry.image2.name, entry.output.name].some((name) => name.toLowerCase().includes(needle)),
    );
  }, [entries, query]);

  /** Führt eine Aktion für einen Eintrag aus und sperrt dessen Buttons solange. */
  const runFor = async (id: string, action: () => Promise<void>, fallback: string) => {
    setBusyId(id);
    setError(null);
    try {
      await action();
    } catch (actionError) {
      setError(messageOf(actionError, fallback));
    } finally {
      setBusyId((current) => (current === id ? null : current));
    }
  };

  const handleDelete = (id: string) =>
    runFor(
      id,
      async () => {
        if (!window.confirm('Diesen Eintrag endgültig löschen?')) return;
        await deleteHistoryEntry(id);
        setEntries((current) => current?.filter((entry) => entry.id !== id) ?? null);
      },
      'Eintrag konnte nicht gelöscht werden.',
    );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight [font-stretch:80%]">Verlauf</h1>
          <p className="meta mt-0.5">
            {entries ? `${entries.length} ${entries.length === 1 ? 'Generierung' : 'Generierungen'}` : 'Wird geladen …'}
            <span className="px-1.5 text-subtle">·</span>
            in deinem Konto gespeichert
          </p>
        </div>
        <label className="relative w-full sm:w-72">
          <span className="sr-only">Nach Dateiname suchen</span>
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Nach Dateiname suchen"
            className="input pl-9"
          />
        </label>
      </div>

      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {entries === null ? (
        <div className="card flex h-48 items-center justify-center">
          <LoaderCircle className="size-5 animate-spin text-muted" aria-label="Verlauf wird geladen" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card flex h-48 flex-col items-center justify-center gap-1 px-6 text-center">
          <p className="text-sm">{entries.length === 0 ? 'Noch keine Generierungen' : 'Keine Treffer'}</p>
          <p className="text-xs text-muted">
            {entries.length === 0
              ? 'Jede fertige Anprobe landet automatisch hier.'
              : `Kein Dateiname enthält „${query.trim()}“.`}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              busy={busyId === entry.id}
              onRestore={() => void runFor(entry.id, () => onRestore(entry), 'Eintrag konnte nicht geladen werden.')}
              onDownload={() => void runFor(entry.id, () => onDownload(entry), 'Download fehlgeschlagen.')}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ image, label, large = false }: { image: HistoryImage; label: string; large?: boolean }) {
  return (
    <div className={`relative overflow-hidden bg-canvas ${large ? 'col-span-2 row-span-2' : ''}`}>
      <img
        src={image.url}
        alt={`${label}: ${image.name}`}
        className="size-full object-contain transition-transform duration-500 ease-out-soft group-hover:scale-[1.03]"
        loading="lazy"
      />
      <span className="absolute bottom-1 left-1 rounded bg-canvas/85 px-1.5 text-[10px] font-medium text-muted">{label}</span>
    </div>
  );
}

function HistoryCard({
  entry,
  busy,
  onRestore,
  onDownload,
  onDelete,
}: {
  entry: HistoryEntry;
  busy: boolean;
  onRestore: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="card group flex flex-col overflow-hidden">
      <div className="grid aspect-[3/2] grid-cols-3 grid-rows-2 gap-px border-b border-line bg-line">
        <Thumb image={entry.output} label="Ergebnis" large />
        <Thumb image={entry.image1} label="Person" />
        <Thumb image={entry.image2} label="Kleidungsstück" />
      </div>
      <div className="flex flex-1 flex-col gap-1 px-4 py-3">
        <p className="truncate text-sm" title={`${entry.image1.name} + ${entry.image2.name}`}>
          {entry.image1.name} <span className="text-subtle">+</span> {entry.image2.name}
        </p>
        <p className="meta">
          {formatDate(entry.createdAt)}
          <span className="px-1.5 text-subtle">·</span>
          {formatSeconds(entry.durationMs)}
        </p>
        <ImageMeta asset={entry.output} />
      </div>
      <div className="flex gap-1 border-t border-line px-2 py-2">
        <button type="button" className="btn-ghost h-8 px-2.5" onClick={onRestore} disabled={busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <RotateCcw className="size-4" aria-hidden />
          )}
          Wiederherstellen
        </button>
        <button type="button" className="btn-ghost h-8 px-2.5" onClick={onDownload} disabled={busy}>
          <Download className="size-4" aria-hidden />
          Download
        </button>
        <button
          type="button"
          className="btn-ghost ml-auto h-8 px-2.5 hover:text-danger"
          onClick={onDelete}
          disabled={busy}
          aria-label="Eintrag löschen"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
