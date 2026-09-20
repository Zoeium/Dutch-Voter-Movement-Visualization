import {useMemo, useState} from 'react';
import type {CoalitionData, PartyInfo} from '@/types';
import {getPartyColor, getPartyDisplayName, resolvePartyName} from '@/data/loader';
import {DualRangeSlider, RibbonGradient} from '@/components/shared';
import {buildGradientId, buildRibbonPath, toggleButtonClass} from '@/components/diagramUtils';

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
  role: PartyRole;         // coalition / tolerating party / opposition
  columnIndex: number;     // index within the SELECTED range
  height: number;          // proportional to seats
  x: number;
  y: number;
}

const PX_PER_SEAT = 3;
const MIN_BLOCK_HEIGHT = 8;
// Block height at which the in-block label steps up to the regular font size. Every block is
// labelled whatever its height; short blocks simply keep the smaller size.
const MEDIUM_LABEL_HEIGHT = 24;
const ROW_GAP = 6;
// Extra room inserted where a column changes role (coalition -> tolerating party ->
// opposition), so the three groups read as separate bands.
const ROLE_GAP = 26;
// Column pitch (BLOCK_WIDTH + COLUMN_GAP). Kept narrow so that a long selection still fits
// side by side, and so scrolling through all coalitions stays short.
const BLOCK_WIDTH = 72;
const COLUMN_GAP = 42;
const LABEL_SPACE = 40;
const HEADER_SPACE = 50;
const LEGEND_SPACE = 62;
// The legend sits in the space reserved below the columns; never let the drawing end up
// narrower than the legend needs, or it gets clipped on small selections.
const LEGEND_WIDTH = 500;
const SPLIT_OFFSET = 14;

/** How a party relates to the coalition of a column. */
type PartyRole = 'coalition' | 'support' | 'opposition';

// Draw order within a column: coalition band, tolerating party, then opposition.
const ROLE_ORDER: Record<PartyRole, number> = {coalition: 0, support: 1, opposition: 2};

/**
 * Readable text colour for a filled block, picked from the party colour's relative
 * luminance. Light parties (GL-PvdA's bright green, GroenLinks) get dark text instead of
 * the white-on-light outline that made the labels look smeared.
 */
function getLabelColor(background: string): string {
  const hex = background.replace('#', '');
  const expanded = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
  if (expanded.length !== 6) return '#ffffff';

  const channel = (offset: number) => {
    const value = Number.parseInt(expanded.slice(offset, offset + 2), 16);
    return Number.isNaN(value) ? null : value / 255;
  };
  const red = channel(0);
  const green = channel(2);
  const blue = channel(4);
  if (red === null || green === null || blue === null) return '#ffffff';

  const linearize = (value: number) =>
    value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  const luminance =
    0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);

  return luminance > 0.35 ? '#111827' : '#ffffff';
}

// How many recent coalitions are shown by default. All coalitions at once (~30 columns)
// is unreadable, so the initial view is a readable window; quick presets widen it.
const DEFAULT_VISIBLE_COLUMNS = 10;

// Quick range presets; `size` is how many coalitions to show counting back from the
// newest one (`0` means every coalition).
const RANGE_PRESETS = [
  {label: 'All', size: 0},
  {label: 'Last 10', size: 10},
  {label: 'Last 5', size: 5},
];

/** Return the parties from which a literal party entry split. */
function getSplitParents(party: string, parties: PartyInfo[]): string[] {
  // Prefer the party's own entry over the `previous_names` fallback: `ppr` is also
  // a previous name of groenlinks, and groenlinks sorts first, so a combined
  // lookup would return groenlinks (no split_off) and never read ppr.yaml.
  const exact = parties.find((x) => x.party === party);
  if (exact) return exact.split_off ?? [];

  const viaPreviousName = parties.find((x) => x.previous_names?.includes(party));
  return viaPreviousName?.split_off ?? [];
}

/**
 * Directed merge lineage of a party: the party itself plus every party it merged FROM
 * and every party it merged INTO (transitively). Sibling predecessors of the same merge
 * are deliberately excluded, so hovering PPR highlights PPR and GroenLinks - never PSP.
 */
function collectMergeLineage(
  party: string | null,
  mergeEdges: { from: PartyBlock; to: PartyBlock }[]
): Set<string> | null {
  if (!party) return null;

  const predecessors = new Map<string, string[]>();
  const successors = new Map<string, string[]>();

  const add = (map: Map<string, string[]>, key: string, value: string) => {
    const values = map.get(key);
    if (!values) {
      map.set(key, [value]);
      return;
    }
    if (!values.includes(value)) values.push(value);
  };

  for (const {from, to} of mergeEdges) {
    add(successors, from.party, to.party);
    add(predecessors, to.party, from.party);
  }

  const related = new Set<string>([party]);
  const visit = (map: Map<string, string[]>) => {
    const stack = [party];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      for (const next of map.get(current) ?? []) {
        if (related.has(next)) continue;
        related.add(next);
        stack.push(next);
      }
    }
  };

  visit(predecessors);
  visit(successors);

  return related;
}

interface ParliamentLayout {
  selected: CoalitionData[];
  colBlocks: PartyBlock[][];
  // y position of the role divider line for each column (empty when a column has one role).
  colDividers: number[][];
  edges: { block: PartyBlock; next: PartyBlock }[];
  mergeEdges: { from: PartyBlock; to: PartyBlock }[];
  splitEdges: { from: PartyBlock; to: PartyBlock }[];
  svgWidth: number;
  svgHeight: number;
}

/**
 * Build every derived item for the currently selected range. Kept pure and
 * module-level so the component can memoize it and hover updates stay cheap.
 */
function buildParliamentLayout(
  coalitions: CoalitionData[],
  parties: PartyInfo[],
  start: number,
  end: number
): ParliamentLayout {
  const selected = coalitions.slice(start, end + 1);
  const selectedCount = selected.length;

  // Build blocks per (selected) column, grouping by the LITERAL seat key so that
  // predecessor parties (e.g. PPR/PSP/CPN of GroenLinks) stay separate blocks until
  // they literally appear as a single party in the data.
  const colBlocks: PartyBlock[][] = selected.map((coalition, colIndex) => {
    const coalitionSet = new Set(coalition.coalition);
    const supportSet = new Set(coalition.support ?? []);

    const roleOf = (key: string): PartyRole =>
      coalitionSet.has(key) ? 'coalition' : supportSet.has(key) ? 'support' : 'opposition';

    const grouped = new Map<string, { seats: number; role: PartyRole }>();
    Object.entries(coalition.seats).forEach(([key, seats]) => {
      if (seats <= 0) return;
      const entry = grouped.get(key) ?? {seats: 0, role: 'opposition' as PartyRole};
      entry.seats += seats;
      // A party (wrongly) listed twice keeps the stronger role.
      const role = roleOf(key);
      if (ROLE_ORDER[role] < ROLE_ORDER[entry.role]) entry.role = role;
      grouped.set(key, entry);
    });

    const list = Array.from(grouped.entries()).map(([key, g]) => ({
      party: key,
      canonical: resolvePartyName(key, parties),
      displayName: getPartyDisplayName(key, parties),
      color: getPartyColor(key, parties),
      seats: g.seats,
      role: g.role,
      columnIndex: colIndex,
      height: Math.max(MIN_BLOCK_HEIGHT, g.seats * PX_PER_SEAT),
      x: LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP),
      y: 0,
    }) as PartyBlock);

    // Coalition band first, then the tolerating party (if any), then the opposition -
    // each group sorted by seat count descending.
    list.sort((a, b) => {
      if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      return b.seats - a.seats;
    });
    return list;
  });

  const layOutColumn = (list: PartyBlock[], colIndex: number) => {
    let y = HEADER_SPACE;
    const dividers: number[] = [];
    list.forEach((b, idx) => {
      b.x = LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP);
      b.y = y;
      y += b.height + ROW_GAP;
      const next = list[idx + 1];
      if (next && next.role !== b.role) {
        // Role change: leave extra room and remember where the divider line belongs.
        dividers.push(y + ROLE_GAP / 2);
        y += ROLE_GAP;
      }
    });
    return dividers;
  };
  const colDividers = colBlocks.map((colBlock, index) => layOutColumn(colBlock, index));

  // Each column is already built in the desired order: coalition parties first, then
  // opposition, each sorted by seat count descending (most seats at the top).

  const columnWidth = selectedCount * (BLOCK_WIDTH + COLUMN_GAP) + LABEL_SPACE * 2 - COLUMN_GAP;
  // Keep enough room for the legend even on a two- or three-column selection.
  const svgWidth = Math.max(columnWidth, LEGEND_WIDTH);
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
  const edges: { block: PartyBlock; next: PartyBlock }[] = [];
  colBlocks.forEach((list, colIndex) => {
    if (colIndex >= selectedCount - 1) return;
    const nextList = colBlocks[colIndex + 1];
    list.forEach((block) => {
      nextList.filter((n) => n.party === block.party).forEach((n) => {
        edges.push({block, next: n});
      });
    });
  });

  // First column in which each literal party key appears. Both the merge and the split
  // flows are drawn once, at the point the party shows up in the selection.
  const firstSeen: Record<string, number> = {};
  colBlocks.forEach((list, colIndex) => {
    list.forEach((block) => {
      firstSeen[block.party] = Math.min(firstSeen[block.party] ?? colIndex, colIndex);
    });
  });

  // Merge flows: when a merged party first appears (e.g. GroenLinks from PPR/PSP,
  // ChristenUnie from RPF/GPV, GL-PvdA from GroenLinks/PvdA), draw one flow from each of
  // its predecessors into it. The predecessor list comes from the block's OWN party entry,
  // looked up by its literal key: `groenlinks` resolves to `glpvda`, so a canonical-name
  // lookup returned glpvda's entry (no PPR/PSP) and silently dropped GroenLinks' merges.
  const mergeEdges: { from: PartyBlock; to: PartyBlock }[] = [];
  colBlocks.forEach((list, colIndex) => {
    if (colIndex < 1) return;
    const prevList = colBlocks[colIndex - 1];
    list.forEach((block) => {
      if (firstSeen[block.party] !== colIndex) return;
      const predecessors = parties.find((x) => x.party === block.party)?.previous_names ?? [];
      if (predecessors.length === 0) return;
      predecessors.forEach((pred) => {
        // Flows only ever come from the IMMEDIATELY preceding coalition. Reaching further
        // back would draw a ribbon across elections the party took no part in - CPN held no
        // seats after Van Agt III, so it contributes no ribbon into GroenLinks.
        const from = prevList.find((b) => b.party === pred);
        if (from && from.party !== block.party) mergeEdges.push({from, to: block});
      });
    });
  });

  // Split-off flows: a party splits off from another (e.g. DENK from PvdA, NSC from CDA).
  // Drawn only at the first column where the split-off party appears, from its parent.

  const splitEdges: { from: PartyBlock; to: PartyBlock }[] = [];
  colBlocks.forEach((list, colIndex) => {
    list.forEach((block) => {
      if (firstSeen[block.party] !== colIndex) return;
      const parents = getSplitParents(block.party, parties);
      if (parents.length === 0) return;
      const parent = parents[0];
      // The parent is looked up in the immediately preceding coalition only, so the flow
      // always spans exactly one election boundary (e.g. VVD in Balkenende III to PVV in
      // Balkenende IV). Only fall back to the same column (a short elbow) when the parent
      // is new in this very column.
      let from = colBlocks[colIndex - 1]?.find((b) => b.party === parent || b.canonical === parent);
      from ??= list.find((b) => b.party === parent || b.canonical === parent);
      if (!from || from === block) return;
      splitEdges.push({from, to: block});
    });
  });

  return {selected, colBlocks, colDividers, edges, mergeEdges, splitEdges, svgWidth, svgHeight};
}

/** Render coalition composition and party lineage across cabinets. */
export default function ParliamentDiagram({coalitions, parties}: Readonly<ParliamentDiagramProps>) {
  const columns = coalitions.length;
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const [rangeStart, setRangeStart] = useState(Math.max(0, columns - DEFAULT_VISIBLE_COLUMNS));
  const [rangeEnd, setRangeEnd] = useState(Math.max(0, columns - 1));

  const start = Math.max(0, Math.min(rangeStart, columns - 1));
  const end = Math.max(start, Math.min(rangeEnd, columns - 1));

  // Derived layout is memoized so hover updates (local state) do not re-run the
  // effectively O(columns x blocks^2) edge/split computation on every mouse move.
  const {selected, colBlocks, colDividers, edges, mergeEdges, splitEdges, svgWidth, svgHeight} = useMemo(
    () => buildParliamentLayout(coalitions, parties, start, end),
    [coalitions, parties, start, end]
  );

  // Hover highlight set: the hovered party plus its merge lineage. `null` (nothing
  // hovered) means every block is drawn at full opacity.
  const highlightedParties = useMemo(
    () => collectMergeLineage(hoveredParty, mergeEdges),
    [hoveredParty, mergeEdges]
  );

  if (columns === 0) {
    return <div className="text-gray-400 text-center py-8">No coalition data available</div>;
  }

  const selectedCount = selected.length;

  const isPartyHighlighted = (party: string) => !highlightedParties || highlightedParties.has(party);

  // Ribbon path + gradient ids shared by the definitions and the rendered paths.
  const ribbonPath = (a: PartyBlock, b: PartyBlock) =>
    buildRibbonPath(a.x + BLOCK_WIDTH, a.y, a.y + a.height, b.x, b.y, b.y + b.height);

  const mergeGradientId = (from: PartyBlock, to: PartyBlock) =>
    buildGradientId('m', from.columnIndex, from.party, to.columnIndex, to.party);

  const splitGradientId = (from: PartyBlock, to: PartyBlock) =>
    buildGradientId('s', from.columnIndex, from.party, to.columnIndex, to.party);

  return (
    <div className="relative w-full">
      {/* Dual-thumb range slider (single control, two thumbs) */}
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <span className="text-sm font-medium text-gray-400 whitespace-nowrap">Range:</span>
        <DualRangeSlider
          min={0}
          max={columns - 1}
          start={start}
          end={end}
          onStartChange={setRangeStart}
          onEndChange={setRangeEnd}
          startAriaLabel="Range start"
          endAriaLabel="Range end"
        />
        <span className="text-xs text-gray-400 whitespace-nowrap">
          {selected[0].name} ({selected[0].year}) — {selected[selectedCount - 1].name} ({selected[selectedCount - 1].year})
        </span>
        {/* Quick ranges: reading ~30 columns at once is not useful, so offer a window. */}
        <div className="flex items-center gap-1.5">
          {RANGE_PRESETS.filter((preset) => preset.size === 0 || preset.size < columns).map((preset) => {
            const size = preset.size === 0 ? columns : preset.size;
            const presetStart = Math.max(0, columns - size);
            const isActive = start === presetStart && end === columns - 1;
            return (
              <button
                type="button"
                key={preset.label}
                onClick={() => {
                  setRangeStart(presetStart);
                  setRangeEnd(columns - 1);
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${toggleButtonClass(isActive)}`}
              >
                {preset.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Horizontal scroll keeps every column at its natural, legible width instead of
          squashing a long selection down to illegible slivers. */}
      <div className="overflow-x-auto">
        <svg
          width="100%"
          height={svgHeight}
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          style={{minWidth: svgWidth}}
          className="block"
          preserveAspectRatio="xMidYMid meet"
        >
        <defs>
          {/* Source->target gradients for merge ribbons (like the Alluvial diagram) */}
          {mergeEdges.map(({from, to}) => {
            const gid = mergeGradientId(from, to);
            return (
              <RibbonGradient
                key={gid}
                id={gid}
                x1={from.x + BLOCK_WIDTH}
                x2={to.x}
                sourceColor={from.color}
                targetColor={to.color}
              />
            );
          })}

          {/* Source->target gradients for split flows: parent party color -> split party color */}
          {splitEdges.map(({from, to}) => {
            const gid = splitGradientId(from, to);
            return (
              <RibbonGradient
                key={gid}
                id={gid}
                x1={from.x + BLOCK_WIDTH}
                x2={to.x}
                sourceColor={from.color}
                targetColor={to.color}
              />
            );
          })}
        </defs>

        {/* Election-to-election flows (alluvial ribbons) */}
        {edges.map(({block, next}) => {
          const d = ribbonPath(block, next);
          const isHovered = isPartyHighlighted(block.party);
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
          const d = ribbonPath(from, to);
          const isHovered = isPartyHighlighted(from.party) && isPartyHighlighted(to.party);
          const gid = mergeGradientId(from, to);
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
          const gid = splitGradientId(from, to);
          const isHovered = isPartyHighlighted(from.party) || isPartyHighlighted(to.party);
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
          const d = ribbonPath(from, to);
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
          const dividers = colDividers[colIndex] ?? [];

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

              {/* Role dividers: coalition above the line, opposition below it; a tolerating
                  party sits in its own band in between. */}
              {dividers.map((dividerY) => (
                <line
                  key={`divider-${dividerY}`}
                  x1={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) - 10}
                  x2={LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP) + BLOCK_WIDTH + 10}
                  y1={dividerY}
                  y2={dividerY}
                  stroke="#4b5563"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              ))}

              {/* Party blocks */}
              {list.map((block) => {
                const isHovered = isPartyHighlighted(block.party);
                const textY = block.y + block.height / 2;
                const textSize = block.height >= MEDIUM_LABEL_HEIGHT ? 'text-xs' : 'text-[9px]';
                // Tolerating parties are drawn translucent, so their effective background is
                // the dark page - white text stays the readable choice there.
                const labelColor = block.role === 'support' ? '#ffffff' : getLabelColor(block.color);

                return (
                  <g
                    key={`${colIndex}-${block.party}`}
                    onMouseEnter={() => setHoveredParty(block.party)}
                    onMouseLeave={() => setHoveredParty(null)}
                    style={{cursor: 'pointer'}}
                  >
                    <rect
                      x={block.x}
                      y={block.y}
                      width={BLOCK_WIDTH}
                      height={block.height}
                      fill={block.color}
                      // A tolerating party (gedoogpartner) is drawn see-through with a dashed
                      // outline: it props up the coalition without being part of it.
                      fillOpacity={block.role === 'support' ? 0.35 : 1}
                      stroke={block.role === 'support' ? block.color : undefined}
                      strokeWidth={block.role === 'support' ? 2 : undefined}
                      strokeDasharray={block.role === 'support' ? '4 3' : undefined}
                      rx={3}
                      opacity={hoveredParty && !isHovered ? 0.3 : 1}
                      style={{transition: 'opacity 0.2s ease'}}
                    />
                    {/* Always labelled: short blocks keep a smaller font instead of dropping
                        the name. The text colour is picked from the block colour so light
                        parties stay readable without an outline. */}
                    <text
                      x={block.x + BLOCK_WIDTH / 2}
                      y={textY}
                      textAnchor="middle"
                      dy="0.35em"
                      fill={labelColor}
                      className={`font-semibold pointer-events-none ${textSize}`}
                    >
                      {block.displayName} ({block.seats})
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}

        {/* Legend for the role vocabulary, drawn in the space reserved below the columns */}
        <g transform={`translate(${LABEL_SPACE}, ${svgHeight - 30})`} className="pointer-events-none">
          <rect
            width={18}
            height={11}
            rx={2}
            fill="#6b7280"
            fillOpacity={0.35}
            stroke="#6b7280"
            strokeWidth={2}
            strokeDasharray="4 3"
          />
          <text x={26} y={10} className="fill-gray-400 text-[10px]">
            Tolerating party (gedoogpartner)
          </text>

          <line x1={232} x2={260} y1={5} y2={5} stroke="#4b5563" strokeWidth={2} strokeDasharray="4 4"/>
          <text x={268} y={10} className="fill-gray-400 text-[10px]">
            Coalition above · opposition below
          </text>
        </g>
        </svg>
      </div>
    </div>
  );
}
