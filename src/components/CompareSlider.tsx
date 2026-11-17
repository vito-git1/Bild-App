import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

interface CompareSliderProps {
  beforeUrl: string;
  afterUrl: string;
  width: number;
  height: number;
  /** Bewegt den Regler einmal kurz hin und her, um zu zeigen, dass man ihn ziehen kann. */
  intro?: boolean;
  beforeLabel?: string;
}

/** Startet nach `delay` ms eine kurze Pendelbewegung; bricht ab, sobald der Nutzer selbst eingreift. */
function useIntroSweep(enabled: boolean, setPosition: (value: number) => void) {
  const cancelRef = useRef<() => void>(() => {});

  useEffect(() => {
    if (!enabled || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let frame = 0;
    let cancelled = false;
    const delay = 1900;
    const duration = 2600;
    const timer = window.setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        if (cancelled) return;
        const t = Math.min(1, (now - start) / duration);
        // 50 → 22 → 78 → 50, weich ein- und ausgeblendet
        const eased = 0.5 - Math.cos(t * Math.PI) / 2;
        setPosition(50 - 28 * Math.sin(eased * Math.PI * 2));
        if (t < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }, delay);
    cancelRef.current = () => {
      cancelled = true;
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
    return cancelRef.current;
  }, [enabled, setPosition]);

  return () => cancelRef.current();
}

/** Vorher/Nachher-Vergleich: links image1, rechts das Ergebnis. */
export function CompareSlider({
  beforeUrl,
  afterUrl,
  width,
  height,
  intro = false,
  beforeLabel = 'Person',
}: CompareSliderProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(50);
  const stopIntro = useIntroSweep(intro, setPosition);

  const updateFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return;
    setPosition(Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100)));
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    stopIntro();
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
    stopIntro();
    setPosition(Math.min(100, Math.max(0, next)));
  };

  return (
    <div
      ref={containerRef}
      role="slider"
      tabIndex={0}
      aria-label={`Vergleich zwischen ${beforeLabel} und Ergebnis`}
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
      <img src={beforeUrl} alt={`Vorher (${beforeLabel})`} className="absolute inset-0 size-full object-contain" draggable={false} />
      <img
        src={afterUrl}
        alt="Nachher (Ergebnis)"
        className="absolute inset-0 size-full object-contain"
        style={{ clipPath: `inset(0 0 0 ${position}%)` }}
        draggable={false}
      />
      <div
        className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-tape shadow-[0_0_0_1px_rgb(23_32_54/0.35)]"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 left-1/2 flex h-10 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full border border-tape-edge bg-tape shadow-md">
          <div className="h-3.5 w-px bg-fg/70" />
          <div className="h-3.5 w-px bg-fg/70" />
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
