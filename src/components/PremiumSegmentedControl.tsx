import { useRef, type CSSProperties } from 'react';

type SegmentOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

export function PremiumSegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  className = '',
}: {
  label: string;
  options: readonly SegmentOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  className?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(0, options.findIndex((option) => option.value === value));

  function move(from: number, direction: number) {
    let next = from;
    for (let step = 0; step < options.length; step += 1) {
      next = (next + direction + options.length) % options.length;
      const option = options[next];
      if (option && !option.disabled) {
        buttons.current[next]?.focus();
        onValueChange(option.value);
        return;
      }
    }
  }

  return (
    <div
      className={`premium-segmented-control ${className}`.trim()}
      role="radiogroup"
      aria-label={label}
      style={{ '--segment-count': options.length, '--segment-index': activeIndex } as CSSProperties}
    >
      <span className="premium-segmented-thumb" aria-hidden="true" />
      {options.map((option, index) => {
        const selected = index === activeIndex;
        return (
          <button
            key={option.value}
            ref={(node) => { buttons.current[index] = node; }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-disabled={option.disabled || undefined}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onValueChange(option.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
                event.preventDefault();
                move(index, 1);
              } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
                event.preventDefault();
                move(index, -1);
              } else if (event.key === 'Home') {
                event.preventDefault();
                const first = options.findIndex((item) => !item.disabled);
                if (first >= 0) {
                  buttons.current[first]?.focus();
                  onValueChange(options[first]!.value);
                }
              } else if (event.key === 'End') {
                event.preventDefault();
                let last = options.length - 1;
                while (last >= 0 && options[last]?.disabled) last -= 1;
                if (last >= 0) {
                  buttons.current[last]?.focus();
                  onValueChange(options[last]!.value);
                }
              }
            }}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
