interface TapeMeasureProps {
  /** unroll: rollt beim ersten Anzeigen aus; run: läuft dauerhaft (Wartezustand); still: ohne Bewegung. */
  motion?: 'unroll' | 'run' | 'still';
  className?: string;
}

/** Dekoratives Maßband – das Erkennungszeichen von Kleiderstudio. */
export function TapeMeasure({ motion = 'still', className = '' }: TapeMeasureProps) {
  return (
    <div className={`flex items-center ${className}`} aria-hidden>
      {/* Gehäuse */}
      <span className="relative z-10 flex size-7 shrink-0 items-center justify-center rounded-md bg-fg">
        <span className="size-2 rounded-full bg-tape" />
      </span>
      <span className="relative -ml-px min-w-0 flex-1">
        <span
          className={['tape block', motion === 'unroll' ? 'tape-unroll' : '', motion === 'run' ? 'tape-run' : ''].join(' ')}
        />
        {/* Metallhaken am Bandende */}
        <span
          className={[
            'absolute top-1/2 h-[1.625rem] w-1.5 -translate-x-full -translate-y-1/2 rounded-[2px] bg-fg',
            motion === 'unroll' ? 'tape-hook' : 'left-full',
          ].join(' ')}
        />
      </span>
    </div>
  );
}
