interface Option<T extends string> {
  value: T;
  label: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  options: Option<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
}: SegmentedControlProps<T>) {
  const index = Math.max(0, options.findIndex((option) => option.value === value));
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="relative grid shrink-0 auto-cols-fr grid-flow-col rounded-lg border border-line bg-canvas p-0.5"
    >
      {/* Gleitender Hintergrund unter der aktiven Option */}
      <span
        aria-hidden
        className="absolute inset-y-0.5 left-0.5 rounded-md bg-surface shadow-[0_1px_2px_rgb(23_32_54/0.15)] transition-transform duration-300 ease-out-soft"
        style={{ width: `calc((100% - 4px) / ${options.length})`, transform: `translateX(${index * 100}%)` }}
      />
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={[
              'relative rounded-md font-medium transition-colors',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-sm',
              active ? 'text-fg' : 'text-muted hover:text-fg',
            ].join(' ')}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
