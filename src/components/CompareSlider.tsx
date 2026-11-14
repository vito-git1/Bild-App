import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  width: number;
  height: number;
}

/** Vorher/Nachher-Vergleich: links image1, rechts das Ergebnis. */
export function CompareSlider({ beforeUrl, afterUrl, width, height }: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);

  const updateFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    updateFromPointer(event.clientX);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event.clientX);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.shiftKey ? 10 : 2;
    const next =
      event.key === 'ArrowLeft' ? position - step
      : event.key === 'ArrowRight' ? position + step
      : event.key === 'Home' ? 0
      : event.key === 'End' ? 100
      : null;
    if (next === null) return;
    event.preventDefault();
    setPosition(Math.min(100, Math.max(0, next)));
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label="Vergleich zwischen image1 und Ergebnis"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(position)}
      aria-valuetext={`${Math.round(position)} % Vorher`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onKeyDown={handleKeyDown}
      className="relative cursor-ew-resize touch-none overflow-hidden rounded-lg select-none"
      // Füllt den Container (container-type: size) unter Beibehaltung des Seitenverhältnisses.
      style={{ aspectRatio: `${width} / ${height}`, width: `min(100cqw, calc(100cqh * ${width / height}))` }}
    >
      <img src={beforeUrl} alt="Vorher (image1)" className="absolute inset-0 size-full object-contain" draggable={false} />
      <img
        src={afterUrl}
        alt="Nachher (Ergebnis)"
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        draggable={false}
      />
      <div className="pointer-events-none absolute inset-y-0 w-px bg-fg/90" style={{ left: `${position}%` }}>
        <div className="absolute top-1/2 left-1/2 flex h-8 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-md border border-line-strong bg-canvas">
          <div className="h-3 w-px bg-fg/70" />
        </div>
      </div>
      <span className="pointer-events-none absolute top-2 left-2 rounded bg-canvas/80 px-1.5 py-0.5 text-[11px] text-muted">
        Vorher
      </span>
      <span className="pointer-events-none absolute top-2 right-2 rounded bg-canvas/80 px-1.5 py-0.5 text-[11px] text-muted">
        Nachher
      </span>
    </div>
  );
}
