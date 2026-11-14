import { Download, LoaderCircle, RotateCcw, Search, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useObjectUrl } from '../hooks/useObjectUrl';
import { formatDate, formatSeconds } from '../lib/format';
import { deleteHistoryEntry, listHistoryEntries } from '../lib/historyDb';
import type { HistoryEntry, StoredImage } from '../types';
import { ImageMeta } from './ImageMeta';

interface HistoryViewProps {
  /** Wird nach jeder neuen Generierung erhöht, um die Liste neu zu laden. */
  revision: number;
  onRestore: (entry: HistoryEntry) => void;
  onDownload: (entry: HistoryEntry) => void;
}

export function HistoryView({ revision, onRestore, onDownload }: HistoryViewProps) {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      setEntries(await listHistoryEntries());
      setError(null);
    } catch (loadError) {
      setEntries([]);
      setError(loadError instanceof Error ? loadError.message : 'Der Verlauf konnte nicht geladen werden.');
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

  const handleDelete = async (id: string) => {
    try {
      await deleteHistoryEntry(id);
      setEntries((current) => current?.filter((entry) => entry.id !== id) ?? null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Eintrag konnte nicht gelöscht werden.');
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-lg font-semibold">Verlauf</h1>
          <p className="meta mt-0.5">
            {entries ? `${entries.length} ${entries.length === 1 ? 'Generierung' : 'Generierungen'}` : 'Wird geladen …'}
            <span className="px-1.5 text-subtle">·</span>
            nur lokal in diesem Browser gespeichert
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
              ? 'Erfolgreiche Anfragen an den Webhook werden hier automatisch gespeichert.'
              : `Kein Dateiname enthält „${query.trim()}“.`}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <HistoryCard
              key={entry.id}
              entry={entry}
              onRestore={() => onRestore(entry)}
              onDownload={() => onDownload(entry)}
              onDelete={() => void handleDelete(entry.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ image, label, large = false }: { image: StoredImage; label: string; large?: boolean }) {
  const url = useObjectUrl(image.blob);
  return (
    <div className={`relative overflow-hidden bg-canvas ${large ? 'col-span-2 row-span-2' : ''}`}>
      {url && <img src={url} alt={`${label}: ${image.name}`} className="size-full object-contain" loading="lazy" />}
      <span className="absolute bottom-1 left-1 rounded bg-canvas/80 px-1 font-mono text-[10px] text-muted">{label}</span>
    </div>
  );
}

function HistoryCard({
  entry,
  onRestore,
  onDownload,
  onDelete,
}: {
  entry: HistoryEntry;
  onRestore: () => void;
  onDownload: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="card flex flex-col overflow-hidden">
      <div className="grid aspect-[3/2] grid-cols-3 grid-rows-2 gap-px border-b border-line bg-line">
        <Thumb image={entry.output} label="Ergebnis" large />
        <Thumb image={entry.image1} label="image1" />
        <Thumb image={entry.image2} label="image2" />
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
        <button type="button" className="btn-ghost h-8 px-2.5" onClick={onRestore}>
          <RotateCcw className="size-4" aria-hidden />
          Wiederherstellen
        </button>
        <button type="button" className="btn-ghost h-8 px-2.5" onClick={onDownload}>
          <Download className="size-4" aria-hidden />
          Download
        </button>
        <button
          type="button"
          className="btn-ghost ml-auto h-8 px-2.5 hover:text-danger"
          onClick={onDelete}
          aria-label="Eintrag löschen"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}
