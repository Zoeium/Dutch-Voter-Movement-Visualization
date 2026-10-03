import {useLayoutEffect, useMemo, useRef, useState} from 'react';
import {Info} from 'lucide-react';
import type {ElectionYear} from '@/types';
import {buildStripeId, toggleButtonClass} from '@/components/diagramUtils';
import {useI18n, type TranslationKey} from '@/theme';

interface TurnoutDiagramProps {
  elections: ElectionYear[];
}

type ScaleMode = 'absolute' | 'percentage';
type SegmentKind = 'valid' | 'blanco' | 'invalid' | 'notVoted';

interface HoveredSegment {
  year: string;
  segment: SegmentKind;
}

interface TurnoutBar {
  year: string;
  electorate: number;
  notVoted: number;
  validVotes: number;
  blancoVotes: number;
  nonValidVotes: number;
  turnoutPct: number;
  validPct: number;
  isCombined: boolean; // true if blanco and invalid are combined
}

interface SegmentValues {
  valid: number;
  blanco: number;
  nonValid: number;
  notVoted: number;
}

const EMBER = '#f59e0b';
const RED = '#ef4444';
const SLATE = '#475569';
const EMERALD = '#10b981';

/** Format a vote count with locale-aware thousands separators. */
function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

/** Format a percentage with one decimal place. */
function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

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

/** Convert raw election totals into reusable turnout bars independent from the React tree. */
function buildTurnoutBars(elections: ElectionYear[]): TurnoutBar[] {
  return elections
    .filter((e) => e.voteTotals && e.voteTotals.electorate > 0)
    .map((e) => {
      const t = e.voteTotals;
      const turnoutPct = t.electorate > 0 ? (t.total_votes / t.electorate) * 100 : 0;
      const validPct = t.total_votes > 0 ? (t.valid_votes / t.total_votes) * 100 : 0;

      let blancoVotes = t.blanco_votes || 0;
      let nonValidVotes = t.non_valid_votes || 0;
      let isCombined = false;

      if (t.non_valid_votes_and_blanco_votes !== undefined) {
        blancoVotes = Math.round(t.non_valid_votes_and_blanco_votes);
        nonValidVotes = 0;
        isCombined = true;
      }

      return {
        year: e.year,
        electorate: t.electorate || 0,
        notVoted: t.not_voted || 0,
        validVotes: t.valid_votes || 0,
        blancoVotes,
        nonValidVotes,
        turnoutPct,
        validPct,
        isCombined,
      };
    });
}

/** Normalise a bar once into the four category values for the active scale mode. */
function getSegmentValues(bar: TurnoutBar, scaleMode: ScaleMode): SegmentValues {
  if (scaleMode === 'percentage') {
    const pct = (value: number) => (bar.electorate > 0 ? (value / bar.electorate) * 100 : 0);
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

/** Render a positioned HTML tooltip when its target is visible. */
function Tooltip({x, y, visible, children}: Readonly<{
  x: number;
  y: number;
  visible: boolean;
  children: React.ReactNode;
}>) {
  if (!visible) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none rounded-lg px-3 py-2 text-xs shadow-xl whitespace-nowrap border"
      style={{
        left: x,
        top: y,
        transform: 'translate(-50%, -100%)',
        backgroundColor: 'var(--c-tooltip-bg)',
        borderColor: 'var(--c-tooltip-border)',
        color: 'var(--c-tooltip-text)',
      }}
    >
      {children}
    </div>
  );
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
    />
  );
}

function getTooltipDetail(
  bar: TurnoutBar,
  hoveredSegment: HoveredSegment | null,
  t: (key: TranslationKey) => string
): React.ReactNode {
  if (!hoveredSegment) return null;

  const notVotedPct = bar.electorate > 0 ? Math.min(100, Math.max(0, (bar.notVoted / bar.electorate) * 100)) : 0;

  switch (hoveredSegment.segment) {
    case 'valid':
      return (
        <div className="mt-1 pt-1 border-t text-emerald-400" style={{borderColor: 'var(--c-tooltip-border)'}}>
          {t('valid')}: {formatNumber(bar.validVotes)} ({formatPct(bar.validPct)} {t('validOfCast')})
        </div>
      );
    case 'blanco':
      return (
        <div className="mt-1 pt-1 border-t text-amber-400" style={{borderColor: 'var(--c-tooltip-border)'}}>
          {bar.isCombined ? `${t('blancoInvalidCombined')}: ` : `${t('blanco')}: `}{formatNumber(bar.blancoVotes)}
        </div>
      );
    case 'invalid':
      return (
        <div className="mt-1 pt-1 border-t text-red-400" style={{borderColor: 'var(--c-tooltip-border)'}}>
          {t('invalid')}: {formatNumber(bar.nonValidVotes)}
        </div>
      );
    case 'notVoted':
      return (
        <div className="mt-1 pt-1 border-t text-app-muted" style={{borderColor: 'var(--c-tooltip-border)'}}>
          {t('didNotVote')}: {formatNumber(bar.notVoted)} ({formatPct(notVotedPct)})
        </div>
      );
    default:
      return null;
  }
}

/** Render election turnout as an interactive stacked bar chart. */
export default function TurnoutDiagram({elections}: Readonly<TurnoutDiagramProps>) {
  const {t} = useI18n();
  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rectsRef = useRef<{
    svgWidth: number;
    svgHeight: number;
    svgLeft: number;
    svgTop: number;
    containerLeft: number;
    containerTop: number;
  } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<HoveredSegment | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>('absolute');
  const [showValid, setShowValid] = useState(true);
  const [showBlanco, setShowBlanco] = useState(true);
  const [showInvalid, setShowInvalid] = useState(true);
  const [showNotVoted, setShowNotVoted] = useState(true);

  const bars = useMemo(() => buildTurnoutBars(elections), [elections]);

  const modeValues = useMemo(
    () => bars.map((bar) => getSegmentValues(bar, scaleMode)),
    [bars, scaleMode]
  );

  useLayoutEffect(() => {
    const measure = () => {
      const svgEl = svgRef.current;
      const containerEl = containerRef.current;
      if (!svgEl || !containerEl) return;

      const svgRect = svgEl.getBoundingClientRect();
      const containerRect = containerEl.getBoundingClientRect();
      rectsRef.current = {
        svgWidth: svgRect.width,
        svgHeight: svgRect.height,
        svgLeft: svgRect.left,
        svgTop: svgRect.top,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
      };
    };

    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [bars]);

  const barHeight = 220;
  const barWidth = Math.max(40, Math.min(64, 1200 / bars.length));
  const gap = Math.max(24, Math.min(48, 600 / bars.length));
  const chartWidth = bars.length * (barWidth + gap) + gap;
  const labelSpace = 80;
  const svgWidth = chartWidth + labelSpace * 2;
  const svgHeight = barHeight + 120;
  const hoveredBar = hovered ? bars.find((bar) => bar.year === hovered) ?? null : null;

  const tooltipPosition = useMemo(() => {
    if (!hoveredBar) return null;

    const barIndex = bars.indexOf(hoveredBar);
    const vx = labelSpace + gap + barIndex * (barWidth + gap) + barWidth / 2;
    const vy = 40;

    let x = vx;
    let y = vy;
    const rects = rectsRef.current;
    if (rects) {
      const scaleX = svgWidth > 0 ? rects.svgWidth / svgWidth : 1;
      const scaleY = svgHeight > 0 ? rects.svgHeight / svgHeight : 1;
      x = rects.svgLeft - rects.containerLeft + vx * scaleX;
      y = rects.svgTop - rects.containerTop + vy * scaleY;
    }

    return {x, y};
  }, [bars, barWidth, gap, hoveredBar, labelSpace, svgHeight, svgWidth]);

  if (bars.length === 0) {
    return (
      <div className="flex items-center justify-center h-96 text-app-muted">
        <div className="text-center">
          <Info className="w-12 h-12 mx-auto mb-3 opacity-50"/>
          <p>{t('noTurnoutData')}</p>
        </div>
      </div>
    );
  }

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

  const legendItems: { key: SegmentKind; label: string; color: string; active: boolean; setActive: (value: boolean) => void }[] = [
    {key: 'valid', label: t('validVotes'), color: EMERALD, active: showValid, setActive: setShowValid},
    {key: 'blanco', label: t('blanco'), color: EMBER, active: showBlanco, setActive: setShowBlanco},
    {key: 'invalid', label: t('invalid'), color: RED, active: showInvalid, setActive: setShowInvalid},
    {key: 'notVoted', label: t('didNotVote'), color: SLATE, active: showNotVoted, setActive: setShowNotVoted},
  ];

  return (
    <div className="relative" ref={containerRef}>
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
              onClick={() => item.setActive(!item.active)}
              className={`flex items-center gap-1.5 px-2 py-1 rounded transition-all ${
                item.active ? 'opacity-100' : 'opacity-40'
              } hover:bg-app-btn`}
            >
              <span className="w-3 h-3 rounded-sm" style={{backgroundColor: item.color}}/>
              <span className={item.active ? 'text-app-text' : 'text-app-subtle line-through'}>{item.label}</span>
            </button>
          ))}
        </div>
        <p className="text-xs text-app-subtle italic">
          {t('blancoBeforeNote')}
        </p>
      </div>

      <div className="w-full">
        <svg ref={svgRef} width="100%" height={svgHeight} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="block" preserveAspectRatio="xMidYMid meet">
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
                    restOpacity={0.7}
                    rounded
                    hovered={isSegmentHovered(bar.year, 'notVoted')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'notVoted'})}
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
                    restOpacity={0.8}
                    hovered={isSegmentHovered(bar.year, 'invalid')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'invalid'})}
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
                      restOpacity={0.8}
                      hovered={isSegmentHovered(bar.year, 'blanco')}
                      onHover={() => setHoveredSegment({year: bar.year, segment: 'blanco'})}
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
                    restOpacity={0.8}
                    rounded
                    hovered={isSegmentHovered(bar.year, 'valid')}
                    onHover={() => setHoveredSegment({year: bar.year, segment: 'valid'})}
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
                  {bar.year}
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

      {/* Tooltip */}
      {hoveredBar && tooltipPosition && (
        <Tooltip x={tooltipPosition.x} y={tooltipPosition.y} visible={true}>
          <div className="font-semibold mb-1" style={{color: 'var(--c-tooltip-text)'}}>{hoveredBar.year} {t('election')}</div>
          <div style={{color: 'var(--c-text-muted)'}}>{t('electorate')}: {formatNumber(hoveredBar.electorate)}</div>
          <div style={{color: 'var(--c-text-muted)'}}>{t('turnoutLabel')}: {formatNumber(hoveredBar.validVotes + hoveredBar.blancoVotes + hoveredBar.nonValidVotes)} ({formatPct(hoveredBar.turnoutPct)})</div>
          {hoveredSegment ? (
            getTooltipDetail(hoveredBar, hoveredSegment, t)
          ) : (
            <>
              <div className="text-emerald-500">{t('valid')}: {formatNumber(hoveredBar.validVotes)} ({formatPct(hoveredBar.validPct)} {t('validOfCast')})</div>
              {hoveredBar.isCombined ? (
                <div className="text-amber-500">{t('blancoInvalid')}: {formatNumber(hoveredBar.blancoVotes)}</div>
              ) : (
                <>
                  <div className="text-amber-500">{t('blanco')}: {formatNumber(hoveredBar.blancoVotes)}</div>
                  <div className="text-red-500">{t('invalid')}: {formatNumber(hoveredBar.nonValidVotes)}</div>
                </>
              )}
              <div style={{color: 'var(--c-text-muted)'}}>{t('didNotVote')}: {formatNumber(hoveredBar.notVoted)}</div>
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}
