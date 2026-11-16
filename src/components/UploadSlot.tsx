import { Camera, ImagePlus, LoaderCircle } from 'lucide-react';
import { useRef, useState, type DragEvent } from 'react';
import { useObjectUrl } from '../hooks/useObjectUrl';
import type { ImageAsset, SlotKey } from '../types';
import { ImageMeta } from './ImageMeta';

interface UploadSlotProps {
  slot: SlotKey;
  title: string;
  description: string;
  asset: ImageAsset | null;
  error: string | null;
  busy: boolean;
  active: boolean;
  onActivate: (slot: SlotKey) => void;
  onFile: (slot: SlotKey, file: File) => void;
  onRemove: (slot: SlotKey) => void;
}

function firstImageFile(list: FileList | null | undefined): File | null {
  if (!list) return null;
  return Array.from(list).find((file) => file.type.startsWith('image/')) ?? list[0] ?? null;
}

export function UploadSlot({
  slot,
  title,
  description,
  asset,
  error,
  busy,
  active,
  onActivate,
  onFile,
  onRemove,
}: UploadSlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);
  const [dragging, setDragging] = useState(false);
  const previewUrl = useObjectUrl(asset?.blob);

  const openPicker = () => inputRef.current?.click();
  const openCamera = () => {
    onActivate(slot);
    cameraRef.current?.click();
  };

  const handleInput = (input: HTMLInputElement) => {
    const file = firstImageFile(input.files);
    if (file) onFile(slot, file);
    input.value = '';
  };

  const handleDragEnter = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const handleDragLeave = (event: DragEvent) => {
    event.preventDefault();
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const handleDrop = (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepth.current = 0;
    setDragging(false);
    onActivate(slot);
    const file = firstImageFile(event.dataTransfer.files);
    if (file) onFile(slot, file);
  };

  return (
    <section
      className="flex min-w-0 flex-col gap-2"
      aria-label={`${title} (${slot})`}
      onPointerEnter={() => onActivate(slot)}
      onFocusCapture={() => onActivate(slot)}
    >
      <h2 className="px-0.5 text-sm font-semibold">{title}</h2>

      <div
        role="button"
        tabIndex={0}
        aria-label={asset ? `${title} ersetzen` : `${title} hinzufügen`}
        onClick={openPicker}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openPicker();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={[
          'relative flex cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed bg-surface transition-colors',
          asset ? 'aspect-[4/5]' : 'aspect-[16/10]',
          dragging
            ? 'border-accent bg-accent/5'
            : active
              ? 'border-line-strong'
              : 'border-line hover:border-line-strong',
        ].join(' ')}
      >
        {asset && previewUrl ? (
          <img src={previewUrl} alt={asset.name} className="size-full object-contain p-2" draggable={false} />
        ) : (
          <div className="flex max-w-[18rem] flex-col items-center px-6 text-center">
            <span className="mb-3 flex size-11 items-center justify-center rounded-full bg-raised">
              <ImagePlus className="size-5 text-muted" strokeWidth={1.75} aria-hidden />
            </span>
            <p className="text-[15px] font-semibold">Bild hochladen</p>
            <p className="mt-1 text-sm text-muted">{description}</p>
            <p className="mt-3 text-xs text-subtle pointer-coarse:hidden">Drag &amp; Drop, klicken oder Strg+V</p>
            <p className="mt-3 hidden text-xs text-subtle pointer-coarse:block">Tippen, um ein Bild auszuwählen</p>
          </div>
        )}

        {dragging && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/85 text-sm font-medium">
            Loslassen zum {asset ? 'Ersetzen' : 'Hinzufügen'}
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/70">
            <LoaderCircle className="size-5 animate-spin text-muted" aria-label="Bild wird gelesen" />
          </div>
        )}
      </div>

      {/* Auf Touch-Geräten: Kamera direkt öffnen (die Dateiauswahl bietet sie nicht auf jedem Handy an). */}
      <button
        type="button"
        className="btn-secondary hidden h-10 w-full pointer-coarse:inline-flex"
        onClick={openCamera}
        disabled={busy}
      >
        <Camera className="size-4" aria-hidden />
        Foto aufnehmen
      </button>

      {(error || asset) && (
        <div className="flex min-h-9 items-center justify-between gap-3 px-0.5">
          {error ? (
            <p className="text-xs text-danger" role="alert">
              {error}
            </p>
          ) : asset ? (
            <>
              <div className="min-w-0">
                <p className="truncate text-xs" title={asset.name}>
                  {asset.name}
                </p>
                <ImageMeta asset={asset} />
              </div>
              <div className="flex shrink-0 gap-1">
                <button type="button" className="btn-ghost h-8 px-2.5" onClick={openPicker}>
                  Ersetzen
                </button>
                <button type="button" className="btn-ghost h-8 px-2.5" onClick={() => onRemove(slot)}>
                  Entfernen
                </button>
              </div>
            </>
          ) : null}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => handleInput(event.target)}
      />
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => handleInput(event.target)}
      />
    </section>
  );
}
