import {useState} from 'react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getPartyColor, getPartyDisplayName, resolvePartyName} from '@/data/loader';

interface ParliamentDiagramProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
}

interface PartyBlock {
  party: string;           // literal seat key (each key is its own block)
  canonical: string;       // resolved identity used for cross-column connection matching
  displayName: string;
  color: string;
  seats: number;
  isCoalition: boolean;
  columnIndex: number;     // index within the SELECTED range
  height: number;          // proportional to seats
  x: number;
  y: number;
}

const PX_PER_SEAT = 0.8;
const MIN_BLOCK_HEIGHT = 8;
const ROW_GAP = 6;
const COALITION_GAP = 26;
const BLOCK_WIDTH = 120;
const COLUMN_GAP = 90;
const LABEL_SPACE = 40;
const HEADER_SPACE = 50;
const LEGEND_SPACE = 62;
const SPLIT_OFFSET = 14;

function getSplitParents(party: string, parties: PartyInfo[]): string[] {
  const p = parties.find((x) => x.party === party || x.previous_names?.includes(party));
  return p?.split_off ?? [];
}

export default function ParliamentDiagram({coalitions, parties}: Readonly<ParliamentDiagramProps>) {
  const columns = coalitions.length;
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(Math.max(0, columns - 1));

  if (columns === 0) {
    return <div className="text-gray-400 text-center py-8">No coalition data available</div>;
  }

  const start = Math.max(0, Math.min(rangeStart, columns - 1));
  const end = Math.max(start, Math.min(rangeEnd, columns - 1));
  const selected = coalitions.slice(start, end + 1);
  const selectedCount = selected.length;
  const maxIndex = Math.max(1, columns - 1);

  // Build blocks per (selected) column, grouping by the LITERAL seat key so that
  // predecessor parties (e.g. PPR/PSP/CPN of GroenLinks) stay separate blocks until
  // they literally appear as a single party in the data.
  const colBlocks: PartyBlock[][] = selected.map((coalition, colIndex) => {
    const coalitionSet = new Set(coalition.coalition);

    const grouped = new Map<string, {seats: number; isCoalition: boolean}>();
    Object.entries(coalition.seats).forEach(([key, seats]) => {
      if (seats <= 0) return;
      const entry = grouped.get(key) ?? {seats: 0, isCoalition: false};
      entry.seats += seats;
      entry.isCoalition = entry.isCoalition || coalitionSet.has(key);
      grouped.set(key, entry);
    });

    const list = Array.from(grouped.entries()).map(([key, g]) => ({
      party: key,
      canonical: resolvePartyName(key, parties),
      displayName: getPartyDisplayName(key, parties),
      color: getPartyColor(key, parties),
      seats: g.seats,
      isCoalition: g.isCoalition,
      columnIndex: colIndex,
      height: Math.max(MIN_BLOCK_HEIGHT, g.seats * PX_PER_SEAT),
      x: LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP),
      y: 0,
    }) as PartyBlock);

    // Coalition first, then opposition (each by seats desc) as the initial lane order.
    list.sort((a, b) => {
      if (a.isCoalition !== b.isCoalition) return a.isCoalition ? -1 : 1;
      return b.seats - a.seats;
    });
    return list;
  });

  const layOutColumn = (list: PartyBlock[], colIndex: number) => {
    let y = HEADER_SPACE;
    list.forEach((b, idx) => {
      b.x = LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP);
      b.y = y;
      y += b.height + ROW_GAP;
      const next = list[idx + 1];
      if (b.isCoalition && next && !next.isCoalition) y += COALITION_GAP;
    });
  };
  colBlocks.forEach(layOutColumn);

  // Each column is already built in the desired order: coalition parties first, then
  // opposition, each sorted by seat count descending (most seats at the top).

  const svgWidth = selectedCount * (BLOCK_WIDTH + COLUMN_GAP) + LABEL_SPACE * 2 - COLUMN_GAP;
  const maxColHeight = Math.max(
    0,
    ...colBlocks.map((list) => {
      const last = list[list.length - 1];
      return last ? last.y + last.height : 0;
    })
  );
  const svgHeight = Math.ceil(maxColHeight + LEGEND_SPACE);

  // Continuity flows: a party continuing with the SAME literal key into the next column.
  // Every continuation is shown so the party's lineage stays visible across all elections;
  // plunging no longer filters on coalition membership or seat changes.
  const edges: {block: PartyBlock; next: PartyBlock}[] = [];
  colBlocks.forEach((list, colIndex) => {
    if (colIndex >= selectedCount - 1) return;
    const nextList = colBlocks[colIndex + 1];
    list.forEach((block) => {
      nextList.filter((n) => n.party === block.party).forEach((n) => {
        edges.push({block, next: n});
      });
    });
  });

  // Merge flows: when a merged party first appears (e.g. GroenLinks from PPR/PSP/CPN,
  // ChristenUnie from RPF/GPV), draw one flow from each predecessor into it. Only the
  // merged party's OWN block starts a merge - a predecessor continuation (like PPR's own
  // PPR->PPR line, whose block canonicalizes to GroenLinks) must not also draw a merge,
  // otherwise every predecessor flow gets doubled.
  const mergeEdges: {from: PartyBlock; to: PartyBlock}[] = [];
  colBlocks.forEach((list, colIndex) => {
    if (colIndex < 1) return;
    const prevList = colBlocks[colIndex - 1];
    list.forEach((block) => {
      // A predecessor block (e.g. PPR) canonicalizes to the merged party (GroenLinks),
      // but it is not itself the merged party, so no merge starts here.
      if (block.party !== block.canonical) return;
      const merged = parties.find((x) => x.party === block.canonical);
      const predecessors = merged?.previous_names ?? [];
      if (predecessors.length === 0) return;
      predecessors.forEach((pred) => {
        const from = prevList.find((b) => b.party === pred || b.canonical === pred);
        if (from && from.party !== block.party) mergeEdges.push({from, to: block});
      });
    });
  });

  // Split-off flows: a party splits off from another (e.g. DENK from PvdA, NSC from CDA).
  // Drawn only at the first column where the split-off party appears, from its parent.
  const firstSeen: Record<string, number> = {};
  colBlocks.forEach((list, colIndex) => {
    list.forEach((block) => {
      firstSeen[block.party] = Math.min(firstSeen[block.party] ?? colIndex, colIndex);
    });
  });

  const splitEdges: {from: PartyBlock; to: PartyBlock}[] = [];
  colBlocks.forEach((list, colIndex) => {
    list.forEach((block) => {
      if (firstSeen[block.party] !== colIndex) return;
      const parents = getSplitParents(block.party, parties);
      if (parents.length === 0) return;
      const parent = parents[0];
      // Resolve the parent from an EARLIER coalition first (preferring the immediate
      // predecessor), so the split flows across the boundary - e.g. VVD in Balkenende III
      // to PVV in Balkenende IV - layered on top of the parent's own continuity flow.
      // Only fall back to the same column (a short elbow) when the parent is new too.
      let from: PartyBlock | undefined;
      for (let c = colIndex - 1; c >= 0; c--) {
        from = colBlocks[c].find((b) => b.party === parent || b.canonical === parent);
        if (from) break;
      }
      from ??= list.find((b) => b.party === parent || b.canonical === parent);
      if (!from || from === block) return;
      splitEdges.push({from, to: block});
    });
  });

  // Build an alluvial-style ribbon between two blocks: a smooth cubic-bezier band that is
  // flush with the source block's whole height at its right edge and the target block's
  // whole height at its left edge. The top edge starts horizontal at the source and bends
  // into the target; the bottom edge mirrors it. This is the same ribbon geometry the
  // Alluvial diagram uses (no straight edges, no mid-flow bulge).
  const buildRibbonPath = (a: PartyBlock, b: PartyBlock) => {
    const sourceX = a.x + BLOCK_WIDTH;
    const targetX = b.x;
    const midX = (sourceX + targetX) / 2;
    const d =
      `M ${sourceX} ${a.y}` +
      ` C ${midX} ${a.y}, ${midX} ${b.y}, ${targetX} ${b.y}` +
      ` L ${targetX} ${b.y + b.height}` +
      ` C ${midX} ${b.y + b.height}, ${midX} ${a.y + a.height}, ${sourceX} ${a.y + a.height}` +
      ` Z`;
    return {d, x1: sourceX, y1: a.y + a.height / 2, x2: targetX, y2: b.y + b.height / 2};
  };

  return (
    <div className="relative w-full">
      {/* Dual-thumb range slider (single control, two thumbs) */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Range:</span>
        <div className="relative w-56 h-6 flex items-center">
          <div className="absolute inset-x-0 h-1.5 rounded-full bg-gray-700"/>
          <div
            className="absolute h-1.5 rounded-full bg-emerald-500"
            style={{
              left: `${(start / maxIndex) * 100}%`,
              right: `${100 - (end / maxIndex) * 100}%`,
            }}
          />
          <input
            type="range"
            aria-label="Range start"
            min={0}
            max={columns - 1}
            value={start}
            onChange={(e) => setRangeStart(Math.min(Number(e.target.value), end))}
            className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
            style={{zIndex: start === end ? 4 : 3}}
          />
          <input
            type="range"
            aria-label="Range end"
            min={0}
            max={columns - 1}
            value={end}
            onChange={(e) => setRangeEnd(Math.max(Number(e.target.value), start))}
            className="year-range-thumb absolute w-full appearance-none bg-transparent pointer-events-auto"
            style={{zIndex: 4}}
          />
        </div>
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {selected[0].name} ({selected[0].year}) — {selected[selectedCount - 1].name} ({selected[selectedCount - 1].year})
        </span>
      </div>

      <svg
        width="100%"
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="block"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          {/* Source->target gradients for merge ribbons (like the Alluvial diagram) */}
          {mergeEdges.map(({from, to}) => {
            const gid = `pgrad-m${from.columnIndex}-${from.party}-${to.columnIndex}-${to.party}`;
            return (
              <linearGradient
                id={gid}
                key={gid}
                gradientUnits="userSpaceOnUse"
                x1={from.x + BLOCK_WIDTH}
                y1={0}
                x2={to.x}
                y2={0}
              >
                <stop offset="0%" stopColor={from.color} stopOpacity={1}/>
                <stop offset="100%" stopColor={to.color} stopOpacity={0.95}/>
              </linearGradient>
            );
          })}

          {/* Source->target gradients for split flows: parent party color -> split party color */}
          {splitEdges.map(({from, to}) => {
            const gid = `pgrad-s${from.columnIndex}-${from.party}-${to.columnIndex}-${to.party}`;
            return (
              <linearGradient
                id={gid}
                key={gid}
                gradientUnits="userSpaceOnUse"
                x1={from.x + BLOCK_WIDTH}
                y1={0}
                x2={to.x}
                y2={0}
              >
                <stop offset="0%" stopColor={from.color} stopOpacity={1}/>
                <stop offset="100%" stopColor={to.color} stopOpacity={0.95}/>
              </linearGradient>
            );
          })}
        </defs>

        {/* Election-to-election flows (alluvial ribbons) */}
        {edges.map(({block, next}) => {
          const {d} = buildRibbonPath(block, next);
          const isHovered = block.canonical === hoveredParty || next.canonical === hoveredParty;
          return (
            <path
              key={`e${block.columnIndex}-${block.party}-${next.columnIndex}-${next.party}`}
              d={d}
              fill={block.color}
              fillOpacity={hoveredParty && !isHovered ? 0.08 : 0.4}
              stroke="none"
              style={{transition: 'fill-opacity 0.2s ease'}}
            />
          );
        })}

        {/* Merge flows (alluvial ribbons with a source->target gradient) */}
        {mergeEdges.map(({from, to}) => {
          const {d} = buildRibbonPath(from, to);
          const isHovered = from.canonical === hoveredParty || to.canonical === hoveredParty;
          const gid = `pgrad-m${from.columnIndex}-${from.party}-${to.columnIndex}-${to.party}`;
          return (
            <path
              key={`m${from.columnIndex}-${from.party}-${to.columnIndex}-${to.party}`}
              d={d}
              fill={`url(#${gid})`}
              fillOpacity={hoveredParty && !isHovered ? 0.08 : 0.5}
              stroke="none"
              style={{transition: 'fill-opacity 0.2s ease'}}
            />
          );
        })}

        {/* Split-off flows (gradient from the parent party color to the split party color);
            no arrow - and nothing is shown when the split is at the starting year */}
        {splitEdges.map(({from, to}) => {
          const gid = `pgrad-s${from.columnIndex}-${from.party}-${to.columnIndex}-${to.party}`;
          const isHovered = from.canonical === hoveredParty || to.canonical === hoveredParty;
          if (to.columnIndex === 0) {
            // Starting year: there is no earlier coalition for the split to come from,
            // so show nothing.
            return null;
          }
          const sameColumn = from.columnIndex === to.columnIndex;
          if (sameColumn) {
            const x1 = from.x + BLOCK_WIDTH;
            const y1 = from.y + from.height / 2;
            const y2 = to.y + to.height / 2;
            const o = SPLIT_OFFSET;
            const mid = (y1 + y2) / 2;
            const w = Math.max(2, Math.min(from.height, to.height));
            return (
              <path
                key={`s${to.columnIndex}-${to.party}`}
                d={`M ${x1} ${y1 - w / 2} C ${x1 + o} ${mid}, ${x1 + o} ${mid}, ${x1} ${y2 + w / 2}`}
                stroke={`url(#${gid})`}
                strokeWidth={w}
                fill="none"
                opacity={hoveredParty && !isHovered ? 0.15 : 1}
                style={{transition: 'all 0.2s ease', strokeLinecap: 'round'}}
              />
            );
          }
          const {d} = buildRibbonPath(from, to);
          return (
            <path
              key={`s${to.columnIndex}-${to.party}`}
              d={d}
              fill={`url(#${gid})`}
              fillOpacity={hoveredParty && !isHovered ? 0.12 : 0.55}
              stroke="none"
              style={{transition: 'fill-opacity 0.2s ease'}}
            />
          );
        })}

        {/* Party columns */}
        {selected.map((coalition, colIndex) => {
          const list = colBlocks[colIndex];
          const coalitionEndIndex = list.findIndex((b) => !b.isCoalition) - 1;

          return (
            <g key={colIndex}>
              {/* Coalition header */}
              <text
                x={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) + BLOCK_WIDTH / 2}
                y={26}
                textAnchor="middle"
                className="fill-gray-300 text-sm font-bold"
              >
                {coalition.name}
              </text>
              <text
                x={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) + BLOCK_WIDTH / 2}
                y={40}
                textAnchor="middle"
                className="fill-gray-500 text-[10px]"
              >
                {coalition.year}
              </text>

              {/* Coalition divider */}
              {coalitionEndIndex >= 0 && (
                <line
                  x1={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) - 10}
                  x2={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) + BLOCK_WIDTH + 10}
                  y1={list[coalitionEndIndex].y + list[coalitionEndIndex].height + ROW_GAP + COALITION_GAP / 2}
                  y2={list[coalitionEndIndex].y + list[coalitionEndIndex].height + ROW_GAP + COALITION_GAP / 2}
                  stroke="#4b5563"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              )}

              {/* Party blocks */}
              {list.map((block) => {
                const isHovered = block.canonical === hoveredParty;
                const textY = block.y + block.height / 2;
                const textSize = block.height >= 24 ? 'text-xs' : block.height >= 12 ? 'text-[9px]' : 'text-[7px]';

                return (
                  <g
                    key={`${colIndex}-${block.party}`}
                    onMouseEnter={() => setHoveredParty(block.canonical)}
                    onMouseLeave={() => setHoveredParty(null)}
                    style={{cursor: 'pointer'}}
                  >
                    <rect
                      x={block.x}
                      y={block.y}
                      width={BLOCK_WIDTH}
                      height={block.height}
                      fill={block.color}
                      rx={3}
                      opacity={hoveredParty && !isHovered ? 0.3 : 1}
                      style={{transition: 'opacity 0.2s ease'}}
                    />
                    {block.height >= 11 && (
                      <text
                        x={block.x + BLOCK_WIDTH / 2}
                        y={textY}
                        textAnchor="middle"
                        dy="0.35em"
                        className={`fill-white font-semibold pointer-events-none ${textSize}`}
                      >
                        {block.displayName} ({block.seats})
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}