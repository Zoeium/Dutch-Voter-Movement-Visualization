import {useMemo, useState} from 'react';
import type {ElectionYear} from '@/types';
import {EmptyState} from '@/components/shared';
import {DEFAULT_TURNOUT_VIEW, type ScaleMode, type SegmentKind, type TurnoutView} from '@/components/turnoutView';
import {
  buildStripeId,
  formatElectionLabel,
  formatNumber,
  formatPct,
  toggleButtonClass,
} from '@/components/diagramUtils';
import {useI18n, type Language, type TranslationKey} from '@/theme';

interface TurnoutDiagramProps {
  elections: ElectionYear[];
  /** The scale and hidden categories to start with; counts with everything shown when left out. */
  view?: TurnoutView;
  /** Called when the visitor changes the scale or a category, so it is kept and shared. */
  onViewChange?: (view: TurnoutView) => void;
}

// Smallest scale the chart is drawn at; below this it scrolls sideways instead.
const MIN_CHART_SCALE = 0.5;

interface HoveredSegment {
  year: string;
  segment: SegmentKind;
}

interface TurnoutBar {
  year: string;
  electorate: number;
  notVoted: number;
  totalVotes: number;
  validVotes: number;
  blancoVotes: number;
  nonValidVotes: number;
  turnoutPct: number;   // of the electorate
  notVotedPct: number;  // of the electorate
  validPct: number;     // of the votes cast
  isCombined: boolean; // true if blanco and invalid are combined
}

interface SegmentValues {
  valid: number;
  blanco: number;
  nonValid: number;
  notVoted: number;
}

// Theme colours (index.css), checked for contrast against the card in both themes.
const EMERALD = 'var(--c-turnout-valid)';
const EMBER = 'var(--c-turnout-blank)';
const RED = 'var(--c-turnout-invalid)';
const SLATE = 'var(--c-turnout-not-voted)';

/** Format a scaled axis value into a compact label. */
function formatAxisValue(value: number, scaleMode: ScaleMode): string {
  if (scaleMode === 'percentage') {
    return `${value.toFixed(1)}%`;
  }

  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }

  return `${(value / 1000).toFixed(0)}K`;
}

/**
 * Convert raw election totals into reusable turnout bars independent from the React tree.
 * Only elections with an electorate get a bar, so every share below can divide by it.
 */
function buildTurnoutBars(elections: ElectionYear[]): TurnoutBar[] {
  return elections
    .filter((e) => e.voteTotals.electorate > 0)
    .map((e) => {
      const t = e.voteTotals;
      const isCombined = typeof t.non_valid_votes_and_blanco_votes === 'number';

      return {
        year: e.year,
        electorate: t.electorate,
        notVoted: t.not_voted,
        totalVotes: t.total_votes,
        validVotes: t.valid_votes,
        // A combined count is drawn in the blanco segment.
        blancoVotes: isCombined ? Math.round(t.non_valid_votes_and_blanco_votes ?? 0) : t.blanco_votes,
        nonValidVotes: isCombined ? 0 : t.non_valid_votes,
        turnoutPct: (t.total_votes / t.electorate) * 100,
        notVotedPct: (t.not_voted / t.electorate) * 100,
        validPct: t.total_votes > 0 ? (t.valid_votes / t.total_votes) * 100 : 0,
        isCombined,
      };
    });
}

/** Normalise a bar once into the four category values for the active scale mode. */
function getSegmentValues(bar: TurnoutBar, scaleMode: ScaleMode): SegmentValues {
  if (scaleMode === 'percentage') {
    const pct = (value: number) => (value / bar.electorate) * 100;
    return {
      valid: pct(bar.validVotes),
      blanco: pct(bar.blancoVotes),
      nonValid: pct(bar.nonValidVotes),
      notVoted: pct(bar.notVoted),
    };
  }

  return {
    valid: bar.validVotes,
    blanco: bar.blancoVotes,
    nonValid: bar.nonValidVotes,
    notVoted: bar.notVoted,
  };
}

interface BarSegmentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  restOpacity: number;
  rounded?: boolean;
  hovered: boolean;
  onHover: () => void;
  /** The tooltip: the election's numbers and this segment's. */
  title: string;
}

/** One stacked bar segment: the hover convention (opacity + pointer) is defined once. */
function BarSegment({
  x,
  y,
  width,
  height,
  color,
  restOpacity,
  rounded = false,
  hovered,
  onHover,
  title,
}: Readonly<BarSegmentProps>) {
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={rounded ? 2 : undefined}
      fill={color}
      fillOpacity={hovered ? 1 : restOpacity}
      onMouseEnter={onHover}
      style={{cursor: 'pointer', transition: 'fill-opacity 0.15s ease'}}
    >
      <title>{title}</title>
    </rect>
  );
}

/** The line of a segment's own numbers in its tooltip. */
function segmentDetail(bar: TurnoutBar, segment: SegmentKind, t: (key: TranslationKey) => string): string {
  switch (segment) {
    case 'valid':
      return `${t('valid')}: ${formatNumber(bar.validVotes)} (${formatPct(bar.validPct)} ${t('validOfCast')})`;
    case 'blanco':
      return `${bar.isCombined ? t('blancoInvalidCombined') : t('blanco')}: ${formatNumber(bar.blancoVotes)}`;
    case 'invalid':
      return `${t('invalid')}: ${formatNumber(bar.nonValidVotes)}`;
    case 'notVoted':
      return `${t('didNotVote')}: ${formatNumber(bar.notVoted)} (${formatPct(bar.notVotedPct)})`;
  }
}

/** A segment's tooltip: the election, its electorate and turnout, then the segment itself. */
function segmentTitle(bar: TurnoutBar, segment: SegmentKind, t: (key: TranslationKey) => string, lang: Language): string {
  return [
    `${formatElectionLabel(bar.year, lang)} ${t('election')}`,
    `${t('electorate')}: ${formatNumber(bar.electorate)}`,
    `${t('turnoutLabel')}: ${formatNumber(bar.totalVotes)} (${formatPct(bar.turnoutPct)})`,
    segmentDetail(bar, segment, t),
  ].join('\n');
}

/** Render election turnout as an interactive stacked bar chart. */
export default function TurnoutDiagram({elections, view: initialView, onViewChange}: Readonly<TurnoutDiagramProps>) {
  const {lang, t} = useI18n();
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const [view, setView] = useState<TurnoutView>(initialView ?? DEFAULT_TURNOUT_VIEW);
  const changeView = (next: TurnoutView) => {
    setView(next);
    onViewChange?.(next);
  };
  const scaleMode = view.scale;
  const isShown = (segment: SegmentKind) => !view.hidden.includes(segment);
  const showValid = isShown('valid');
  const showBlanco = isShown('blanco');
  const showInvalid = isShown('invalid');
  const showNotVoted = isShown('notVoted');
  const setScaleMode = (scale: ScaleMode) => changeView({...view, scale});
  const toggleSegment = (segment: SegmentKind) =>
    changeView({
      ...view,
      hidden: isShown(segment) ? [...view.hidden, segment] : view.hidden.filter((hidden) => hidden !== segment),
    });

  const bars = useMemo(() => buildTurnoutBars(elections), [elections]);

  const modeValues = useMemo(
    () => bars.map((bar) => getSegmentValues(bar, scaleMode)),
    [bars, scaleMode]
  );

  const barHeight = 220;
  const barWidth = Math.max(40, Math.min(64, 1200 / bars.length));
  const gap = Math.max(24, Math.min(48, 600 / bars.length));
  const chartWidth = bars.length * (barWidth + gap) + gap;
  const labelSpace = 80;
  const svgWidth = chartWidth + labelSpace * 2;
  const svgHeight = barHeight + 120;

  if (bars.length === 0) return <EmptyState message={t('noTurnoutData')}/>;

  const maxValue = Math.max(
    0,
    ...modeValues.map((values) => {
      let total = 0;
      if (showValid) total += values.valid;
      if (showBlanco) total += values.blanco;
      if (showInvalid) total += values.nonValid;
      if (showNotVoted) total += values.notVoted;
      return total;
    })
  );

  const scale = maxValue > 0 ? barHeight / maxValue : 0;

  const isSegmentHovered = (year: string, segment: SegmentKind) =>
    hoveredSegment?.year === year && hoveredSegment.segment === segment;

  const legendItems: { key: SegmentKind; label: string; color: string; active: boolean }[] = [
    {key: 'valid', label: t('validVotes'), color: EMERALD, active: showValid},
    {key: 'blanco', label: t('blanco'), color: EMBER, active: showBlanco},
    {key: 'invalid', label: t('invalid'), color: RED, active: showInvalid},
    {key: 'notVoted', label: t('didNotVote'), color: SLATE, active: showNotVoted},
  ];

  return (
    <div className="relative">
      {/* Scale mode toggle */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-sm font-medium text-app-muted">{t('scale')}</span>
        <button
          type="button"
          onClick={() => setScaleMode('absolute')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(scaleMode === 'absolute')}`}
        >
          {t('absolute')}
        </button>
        <button
          type="button"
          onClick={() => setScaleMode('percentage')}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${toggleButtonClass(scaleMode === 'percentage')}`}
        >
          {t('percentage')}
        </button>
      </div>

      {/* Legend with toggles */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {legendItems.map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => toggleSegment(item.key)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                item.active ? 'opacity-100' : 'opacity-40'
              } hover:bg-app-btn`}
            >
              <span className="w-3 h-3 rounded-xs" style={{backgroundColor: item.color}}/>
              <span className={item.active ? 'text-app-text' : 'text-app-subtle line-through'}>{item.label}</span>
            </button>
          ))}
        </div>
        {bars.some((bar) => bar.isCombined) && (
          <p className="text-xs text-app-subtle italic">
            {t('blancoBeforeNote')}
          </p>
        )}
      </div>

      {/* Scales with the card, but never below half size: narrower screens scroll the chart
          sideways instead of shrinking it until the labels are unreadable. */}
      <div className="w-full overflow-x-auto">
        <svg
          data-export-chart
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="block mx-auto"
          preserveAspectRatio="xMidYMid meet"
          style={{width: '100%', height: 'auto', maxWidth: svgWidth, minWidth: svgWidth * MIN_CHART_SCALE}}
        >
          {/* Y-axis label */}
          <text
            x={10}
            y={40 + barHeight / 2}
            textAnchor="middle"
            className="fill-app-muted text-[10px] font-medium"
            transform={`rotate(-90, 10, ${40 + barHeight / 2})`}
          >
            {scaleMode === 'percentage' ? t('pctOfElectorate') : t('numberVotes')}
          </text>

          {/* Y-axis grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
            const y = 40 + barHeight - barHeight * frac;
            const value = scaleMode === 'percentage'
              ? Math.round(maxValue * frac * 10) / 10
              : Math.round(maxValue * frac);
            const tickLabel = formatAxisValue(value, scaleMode);

            return (
              <g key={frac}>
                <line
                  x1={labelSpace - 8}
                  x2={svgWidth - labelSpace}
                  y1={y}
                  y2={y}
                  stroke="var(--c-grid-line)"
                  strokeWidth={1}
                  strokeDasharray="3 4"
                />
                <text
                  x={labelSpace - 12}
                  y={y}
                  dy="0.35em"
                  textAnchor="end"
                  className="fill-app-axis text-[10px]"
                >
                  {tickLabel}
                </text>
              </g>
            );
          })}

          {bars.map((bar, i) => {
            const x = labelSpace + gap + i * (barWidth + gap);
            const yBase = 40 + barHeight;
            const values = modeValues[i];
            if (!values) return null;
            const stripeId = buildStripeId(bar.year);

            const validH = showValid ? values.valid * scale : 0;
            const blancoH = showBlanco ? values.blanco * scale : 0;
            const nonValidH = showInvalid ? values.nonValid * scale : 0;
            const notVotedH = showNotVoted ? values.notVoted * scale : 0;

            const validY = yBase - validH;
            const blancoY = validY - blancoH;
            const nonValidY = blancoY - nonValidH;
            const notVotedY = nonValidY - notVotedH;

            // Calculate total height for turnout percentage display
            const totalH = validH + blancoH + nonValidH + notVotedH;

            const isHovered = hovered === bar.year;
            const opacity = hovered && !isHovered ? 0.4 : 1;

            return (
              <g
                key={bar.year}
                onMouseEnter={() => setHovered(bar.year)}
                onMouseLeave={() => {
                  setHovered(null);
                  setHoveredSegment(null);
                }}
                style={{transition: 'opacity 0.2s ease', opacity}}
              >
                {/* Not voted */}
                {showNotVoted && notVotedH > 0 && (
                  <BarSegment
                    x={x}
                    y={notVotedY}
                    width={barWidth}
                    height={notVotedH}
                    color={SLATE}
                    restOpacity={1}
                    rounded
                    hovered={isSegmentHovered(bar.year, 'notVoted')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'notVoted'})}
                    title={segmentTitle(bar, 'notVoted', t, lang)}
                  />
                )}
                {/* Non-valid */}
                {showInvalid && nonValidH > 0 && (
                  <BarSegment
                    x={x}
                    y={nonValidY}
                    width={barWidth}
                    height={nonValidH}
                    color={RED}
                    restOpacity={1}
                    hovered={isSegmentHovered(bar.year, 'invalid')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'invalid'})}
                    title={segmentTitle(bar, 'invalid', t, lang)}
                  />
                )}
                {/* Blanco */}
                {showBlanco && blancoH > 0 && (
                  <>
                    <BarSegment
                      x={x}
                      y={blancoY}
                      width={barWidth}
                      height={blancoH}
                      color={EMBER}
                      restOpacity={1}
                      hovered={isSegmentHovered(bar.year, 'blanco')}
                      onHover={() => setHoveredSegment({year: bar.year, segment: 'blanco'})}
                      title={segmentTitle(bar, 'blanco', t, lang)}
                    />
                    {/* Pattern overlay for combined data */}
                    {bar.isCombined && (
                      <>
                        <defs>
                          <pattern id={stripeId} patternUnits="userSpaceOnUse" width="4" height="4" patternTransform="rotate(45)">
                            <line x1="0" y1="0" x2="0" y2="4" stroke="var(--c-grid-line)" strokeWidth="1" opacity="0.3"/>
                          </pattern>
                        </defs>
                        <rect
                          x={x}
                          y={blancoY}
                          width={barWidth}
                          height={blancoH}
                          fill={`url(#${stripeId})`}
                          pointerEvents="none"
                        />
                      </>
                    )}
                  </>
                )}
                {/* Valid votes */}
                {showValid && validH > 0 && (
                  <BarSegment
                    x={x}
                    y={validY}
                    width={barWidth}
                    height={validH}
                    color={EMERALD}
                    restOpacity={1}
                    rounded
                    hovered={isSegmentHovered(bar.year, 'valid')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'valid'})}
                    title={segmentTitle(bar, 'valid', t, lang)}
                  />
                )}

                {/* Turnout percentage above bar */}
                {totalH > 0 && (
                  <>
                    <text
                      x={x + barWidth / 2}
                      y={yBase - totalH - 8}
                      textAnchor="middle"
                      className="fill-app-text text-xs font-bold"
                    >
                      {formatPct(bar.turnoutPct)}
                    </text>
                    <text
                      x={x + barWidth / 2}
                      y={yBase - totalH - 22}
                      textAnchor="middle"
                      className="fill-app-subtle text-[10px]"
                    >
                      {t('turnout')}
                    </text>
                  </>
                )}

                {/* Year label below bar */}
                <text
                  x={x + barWidth / 2}
                  y={yBase + 20}
                  textAnchor="middle"
                  className="fill-app-muted text-sm font-semibold"
                >
                  {formatElectionLabel(bar.year, lang)}
                </text>

                {/* Electorate count */}
                <text
                  x={x + barWidth / 2}
                  y={yBase + 36}
                  textAnchor="middle"
                  className="fill-app-subtle text-[10px]"
                >
                  {formatNumber(bar.electorate)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

    </div>
  );
}
