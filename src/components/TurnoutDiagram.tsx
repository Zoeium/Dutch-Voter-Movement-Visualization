import {useMemo, useState} from 'react';
import type {ElectionYear} from '@/types';

interface TurnoutDiagramProps {
  elections: ElectionYear[];
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
}

const EMBER = '#f59e0b';
const RED = '#ef4444';
const SLATE = '#475569';
const EMERALD = '#10b981';

function formatNumber(n: number): string {
  return n.toLocaleString('en-US');
}

function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

function Tooltip({x, y, visible, children}: {
  x: number;
  y: number;
  visible: boolean;
  children: React.ReactNode;
}) {
  if (!visible) return null;
  return (
    <div
      className="absolute z-20 pointer-events-none bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-200 shadow-xl whitespace-nowrap"
      style={{left: x, top: y, transform: 'translate(-50%, -100%)'}}
    >
      {children}
    </div>
  );
}

export default function TurnoutDiagram({elections}: Readonly<TurnoutDiagramProps>) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);

  const bars: TurnoutBar[] = useMemo(() => {
    return elections.map((e) => {
      const t = e.voteTotals;
      const turnoutPct = t.electorate > 0 ? (t.total_votes / t.electorate) * 100 : 0;
      const validPct = t.total_votes > 0 ? (t.valid_votes / t.total_votes) * 100 : 0;
      return {
        year: e.year,
        electorate: t.electorate,
        notVoted: t.not_voted,
        validVotes: t.valid_votes,
        blancoVotes: t.blanco_votes,
        nonValidVotes: t.non_valid_votes,
        turnoutPct,
        validPct,
      };
    });
  }, [elections]);

  if (bars.length === 0) {
    return null;
  }

  const maxElectorate = Math.max(...bars.map((b) => b.electorate));
  const barHeight = 220;
  const barWidth = 64;
  const gap = 48;
  const chartWidth = bars.length * (barWidth + gap) + gap;
  const labelSpace = 80;
  const svgWidth = chartWidth + labelSpace * 2;
  const svgHeight = barHeight + 120;

  const scale = barHeight / maxElectorate;

  return (
    <div className="relative">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-4 text-xs text-gray-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{backgroundColor: EMERALD}}/>
          Valid votes
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{backgroundColor: EMBER}}/>
          Blanco
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{backgroundColor: RED}}/>
          Invalid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-3 rounded-sm" style={{backgroundColor: SLATE}}/>
          Did not vote
        </span>
      </div>

      <svg width={svgWidth} height={svgHeight} className="block overflow-visible" style={{maxWidth: '100%'}}>
        {/* Y-axis grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const y = 40 + barHeight - barHeight * frac;
          const value = Math.round(maxElectorate * frac);
          return (
            <g key={frac}>
              <line
                x1={labelSpace - 8}
                x2={svgWidth - labelSpace}
                y1={y}
                y2={y}
                stroke="#374151"
                strokeWidth={1}
                strokeDasharray="3 4"
              />
              <text
                x={labelSpace - 12}
                y={y}
                dy="0.35em"
                textAnchor="end"
                className="fill-gray-500 text-[10px]"
              >
                {value >= 1_000_000 ? `${(value / 1_000_000).toFixed(1)}M` : `${(value / 1000).toFixed(0)}K`}
              </text>
            </g>
          );
        })}

        {bars.map((bar, i) => {
          const x = labelSpace + gap + i * (barWidth + gap);
          const yBase = 40 + barHeight;

          const validH = bar.validVotes * scale;
          const blancoH = bar.blancoVotes * scale;
          const nonValidH = bar.nonValidVotes * scale;
          const notVotedH = bar.notVoted * scale;

          const validY = yBase - validH;
          const blancoY = validY - blancoH;
          const nonValidY = blancoY - nonValidH;
          const notVotedY = nonValidY - notVotedH;

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
              <rect
                x={x}
                y={notVotedY}
                width={barWidth}
                height={notVotedH}
                rx={2}
                fill={SLATE}
                fillOpacity={hoveredSegment === `${bar.year}-notVoted` ? 1 : 0.7}
                onMouseEnter={() => setHoveredSegment(`${bar.year}-notVoted`)}
                style={{cursor: 'pointer', transition: 'fill-opacity 0.15s ease'}}
              />
              {/* Non-valid */}
              <rect
                x={x}
                y={nonValidY}
                width={barWidth}
                height={nonValidH}
                fill={RED}
                fillOpacity={hoveredSegment === `${bar.year}-invalid` ? 1 : 0.8}
                onMouseEnter={() => setHoveredSegment(`${bar.year}-invalid`)}
                style={{cursor: 'pointer', transition: 'fill-opacity 0.15s ease'}}
              />
              {/* Blanco */}
              <rect
                x={x}
                y={blancoY}
                width={barWidth}
                height={blancoH}
                fill={EMBER}
                fillOpacity={hoveredSegment === `${bar.year}-blanco` ? 1 : 0.8}
                onMouseEnter={() => setHoveredSegment(`${bar.year}-blanco`)}
                style={{cursor: 'pointer', transition: 'fill-opacity 0.15s ease'}}
              />
              {/* Valid votes */}
              <rect
                x={x}
                y={validY}
                width={barWidth}
                height={validH}
                rx={2}
                fill={EMERALD}
                fillOpacity={hoveredSegment === `${bar.year}-valid` ? 1 : 0.8}
                onMouseEnter={() => setHoveredSegment(`${bar.year}-valid`)}
                style={{cursor: 'pointer', transition: 'fill-opacity 0.15s ease'}}
              />

              {/* Turnout percentage above bar */}
              <text
                x={x + barWidth / 2}
                y={notVotedY - 8}
                textAnchor="middle"
                className="fill-gray-200 text-xs font-bold"
              >
                {formatPct(bar.turnoutPct)}
              </text>
              <text
                x={x + barWidth / 2}
                y={notVotedY - 22}
                textAnchor="middle"
                className="fill-gray-500 text-[10px]"
              >
                turnout
              </text>

              {/* Year label below bar */}
              <text
                x={x + barWidth / 2}
                y={yBase + 20}
                textAnchor="middle"
                className="fill-gray-300 text-sm font-semibold"
              >
                {bar.year}
              </text>

              {/* Electorate count */}
              <text
                x={x + barWidth / 2}
                y={yBase + 36}
                textAnchor="middle"
                className="fill-gray-500 text-[10px]"
              >
                {formatNumber(bar.electorate)}
              </text>
            </g>
          );
        })}
      </svg>

      {/* Tooltip */}
      {hovered && (() => {
        const bar = bars.find((b) => b.year === hovered);
        if (!bar) return null;
        const i = bars.indexOf(bar);
        const x = labelSpace + gap + i * (barWidth + gap) + barWidth / 2;
        const y = 40;

        let segmentDetail: React.ReactNode = null;
        if (hoveredSegment) {
          const seg = hoveredSegment.split('-').slice(1).join('-');
          if (seg === 'valid') {
            segmentDetail = (
              <div className="mt-1 pt-1 border-t border-gray-700 text-emerald-400">
                Valid: {formatNumber(bar.validVotes)} ({formatPct(bar.validPct)} of cast)
              </div>
            );
          } else if (seg === 'blanco') {
            segmentDetail = (
              <div className="mt-1 pt-1 border-t border-gray-700 text-amber-400">
                Blanco: {formatNumber(bar.blancoVotes)}
              </div>
            );
          } else if (seg === 'invalid') {
            segmentDetail = (
              <div className="mt-1 pt-1 border-t border-gray-700 text-red-400">
                Invalid: {formatNumber(bar.nonValidVotes)}
              </div>
            );
          } else if (seg === 'notVoted') {
            segmentDetail = (
              <div className="mt-1 pt-1 border-t border-gray-700 text-gray-400">
                Did not vote: {formatNumber(bar.notVoted)} ({formatPct(100 - bar.turnoutPct)})
              </div>
            );
          }
        }

        return (
          <Tooltip x={x} y={y} visible={true}>
            <div className="font-semibold text-gray-100 mb-1">{bar.year} election</div>
            <div className="text-gray-400">Electorate: {formatNumber(bar.electorate)}</div>
            <div className="text-gray-400">Turnout: {formatNumber(bar.validVotes + bar.blancoVotes + bar.nonValidVotes)} ({formatPct(bar.turnoutPct)})</div>
            <div className="text-emerald-400">Valid: {formatNumber(bar.validVotes)} ({formatPct(bar.validPct)} of cast)</div>
            <div className="text-amber-400">Blanco: {formatNumber(bar.blancoVotes)}</div>
            <div className="text-red-400">Invalid: {formatNumber(bar.nonValidVotes)}</div>
            <div className="text-gray-400">Did not vote: {formatNumber(bar.notVoted)}</div>
            {segmentDetail}
          </Tooltip>
        );
      })()}
    </div>
  );
}
