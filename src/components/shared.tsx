/**
 * Shared UI components used by more than one diagram so the gradient markup and
 * the dual-thumb range-slider markup are defined once.
 */

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
      <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700"/>
      <div
        className="absolute h-1.5 rounded-full bg-emerald-500"
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
