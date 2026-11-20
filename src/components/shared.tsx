/**
 * Shared UI used by more than one view: the ribbon gradient, the range control with its
 * dual-thumb slider, and the empty-state message, so each is defined once.
 */

import {useI18n} from '@/theme';
import {toggleButtonClass} from '@/components/diagramUtils';

interface RibbonGradientProps {
  id: string;
  x1: number;
  x2: number;
  sourceColor: string;
  targetColor: string;
}

/** Shared two-stop source->target linear gradient (Alluvial + Parliament). */
export function RibbonGradient({id, x1, x2, sourceColor, targetColor}: Readonly<RibbonGradientProps>) {
  return (
    <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={0} x2={x2} y2={0}>
      <stop offset="0%" stopColor={sourceColor} stopOpacity={1}/>
      <stop offset="100%" stopColor={targetColor} stopOpacity={0.95}/>
    </linearGradient>
  );
}

// Quick ranges, counted back from the newest item (`0` means every item).
const RANGE_PRESETS = [
  {labelKey: 'all', size: 0},
  {labelKey: 'last10', size: 10},
  {labelKey: 'last5', size: 5},
] as const;

interface RangeControlProps {
  /** One label per item (an election or a cabinet), oldest first. */
  labels: string[];
  start: number;
  end: number;
  onChange: (start: number, end: number) => void;
}

/**
 * The range control of every view with a time axis: "Range:", the slider, the first and
 * last item shown, and quick ranges. Presets that would show everything anyway are left out.
 */
export function RangeControl({labels, start, end, onChange}: Readonly<RangeControlProps>) {
  const {t} = useI18n();
  const count = labels.length;
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-sm font-medium text-app-muted whitespace-nowrap">{t('range')}</span>
      <DualRangeSlider
        min={0}
        max={Math.max(0, count - 1)}
        start={start}
        end={end}
        onStartChange={(value) => onChange(value, end)}
        onEndChange={(value) => onChange(start, value)}
        startAriaLabel={t('rangeStart')}
        endAriaLabel={t('rangeEnd')}
      />
      <span className="text-xs text-app-muted whitespace-nowrap">
        {labels[start] ?? ''} — {labels[end] ?? ''}
      </span>
      <div className="flex items-center gap-1.5">
        {RANGE_PRESETS.filter((preset) => preset.size === 0 || preset.size < count).map((preset) => {
          const presetStart = preset.size === 0 ? 0 : count - preset.size;
          const isActive = start === presetStart && end === count - 1;
          return (
            <button
              type="button"
              key={preset.labelKey}
              onClick={() => onChange(presetStart, count - 1)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${toggleButtonClass(isActive)}`}
            >
              {t(preset.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The message a view shows when it has nothing to draw. */
export function EmptyState({message}: Readonly<{ message: string }>) {
  return (
    <div className="flex items-center justify-center h-48 text-app-muted">
      <p>{message}</p>
    </div>
  );
}

interface DualRangeSliderProps {
  min: number;
  max: number;
  start: number;
  end: number;
  onStartChange: (value: number) => void;
  onEndChange: (value: number) => void;
  startAriaLabel?: string;
  endAriaLabel?: string;
}

/** Dual-thumb range slider: one track, one fill, two overlapping range inputs. */
export function DualRangeSlider({
  min,
  max,
  start,
  end,
  onStartChange,
  onEndChange,
  startAriaLabel,
  endAriaLabel,
}: Readonly<DualRangeSliderProps>) {
  const span = Math.max(1, max - min);

  return (
    <div className="relative w-56 h-6 flex items-center">
      <div className="absolute inset-x-0 h-1.5 rounded-full" style={{backgroundColor: 'var(--c-slider-track)'}}/>
      <div
        className="absolute h-1.5 rounded-full bg-app-accent"
        style={{
          left: `${((start - min) / span) * 100}%`,
          right: `${100 - ((end - min) / span) * 100}%`,
        }}
      />
      <input
        type="range"
        aria-label={startAriaLabel}
        min={min}
        max={max}
        value={start}
        onChange={(e) => onStartChange(Math.min(Number(e.target.value), end))}
        className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
        // The end thumb is always 4 and later in the DOM, so when the thumbs
        // coincide the start thumb must sit strictly above it to be grabbable.
        style={{zIndex: start === end ? 5 : 3}}
      />
      <input
        type="range"
        aria-label={endAriaLabel}
        min={min}
        max={max}
        value={end}
        onChange={(e) => onEndChange(Math.max(Number(e.target.value), start))}
        className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
        style={{zIndex: 4}}
      />
    </div>
  );
}
