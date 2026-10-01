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

interface LineageRibbon {
  kind: 'continuity' | 'merge' | 'split';
  from: PartyBlock;
  to: PartyBlock;
  sourceSeats: number;
  targetSeats: number;
  sourceYTop: number;
  sourceYBottom: number;
  targetYTop: number;
  targetYBottom: number;
}

type RibbonSide = 'source' | 'target';

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

function setRibbonSpan(
  ribbon: LineageRibbon,
  side: RibbonSide,
  top: number,
  bottom: number
): void {
  if (side === 'source') {
    ribbon.sourceYTop = top;
    ribbon.sourceYBottom = bottom;
    return;
  }

  ribbon.targetYTop = top;
  ribbon.targetYBottom = bottom;
}

function setFullBlockSpans(block: PartyBlock, group: LineageRibbon[], side: RibbonSide): void {
  const bottom = block.y + block.height;
  for (const ribbon of group) {
    setRibbonSpan(ribbon, side, block.y, bottom);
  }
}

function compareRibbonCounterpart(a: LineageRibbon, b: LineageRibbon, side: RibbonSide): number {
  const aY = side === 'source' ? a.to.y : a.from.y;
  const bY = side === 'source' ? b.to.y : b.from.y;
  return aY - bY;
}

function getRibbonSeats(ribbon: LineageRibbon, side: RibbonSide): number {
  return side === 'source' ? ribbon.sourceSeats : ribbon.targetSeats;
}

function allocateRibbonGroup(
  block: PartyBlock,
  group: LineageRibbon[],
  side: RibbonSide
): void {
  const hasLineage = group.some((ribbon) => ribbon.kind !== 'continuity');
  if (!hasLineage) {
    setFullBlockSpans(block, group, side);
    return;
  }

  group.sort((a, b) => compareRibbonCounterpart(a, b, side));
  const totalSeats = group.reduce((total, ribbon) => total + getRibbonSeats(ribbon, side), 0);
  if (totalSeats === 0) {
    for (const ribbon of group) {
      setRibbonSpan(ribbon, side, block.y, block.y);
    }
    return;
  }

  const pixelsPerSeat = Math.min(PX_PER_SEAT, block.height / totalSeats);
  let y = block.y;
  for (const ribbon of group) {
    const bottom = y + getRibbonSeats(ribbon, side) * pixelsPerSeat;
    setRibbonSpan(ribbon, side, y, bottom);
    y = bottom;
  }
}

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

/**
 * Allocate seat-proportional slices for split and merge ribbons. Each endpoint
 * stacks its flows in counterpart order, scaling down only when their combined
 * seat counts exceed that party's block.
 */
function buildLineageRibbons(
  edges: { block: PartyBlock; next: PartyBlock }[],
  mergeEdges: { from: PartyBlock; to: PartyBlock }[],
  splitEdges: { from: PartyBlock; to: PartyBlock }[]
): LineageRibbon[] {
  const ribbons: LineageRibbon[] = [
    ...edges.map(({block, next}) => ({
      kind: 'continuity' as const,
      from: block,
      to: next,
      sourceSeats: block.seats,
      targetSeats: next.seats,
      sourceYTop: 0,
      sourceYBottom: 0,
      targetYTop: 0,
      targetYBottom: 0,
    })),
    ...mergeEdges.map(({from, to}) => ({
      kind: 'merge' as const,
      from,
      to,
      sourceSeats: from.seats,
      targetSeats: to.seats,
      sourceYTop: 0,
      sourceYBottom: 0,
      targetYTop: 0,
      targetYBottom: 0,
    })),
    ...splitEdges.map(({from, to}) => ({
      kind: 'split' as const,
      from,
      to,
      sourceSeats: to.seats,
      targetSeats: to.seats,
      sourceYTop: 0,
      sourceYBottom: 0,
      targetYTop: 0,
      targetYBottom: 0,
    })),
  ];

  const sourceGroups = new Map<PartyBlock, LineageRibbon[]>();
  const targetGroups = new Map<PartyBlock, LineageRibbon[]>();
  for (const ribbon of ribbons) {
    const outgoing = sourceGroups.get(ribbon.from) ?? [];
    outgoing.push(ribbon);
    sourceGroups.set(ribbon.from, outgoing);

    const incoming = targetGroups.get(ribbon.to) ?? [];
    incoming.push(ribbon);
    targetGroups.set(ribbon.to, incoming);
  }

  for (const [block, group] of sourceGroups) allocateRibbonGroup(block, group, 'source');
  for (const [block, group] of targetGroups) allocateRibbonGroup(block, group, 'target');

  return ribbons;
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
function getPartyRole(
  coalitionSet: Set<string>,
  supportSet: Set<string>,
  key: string
): PartyRole {
  if (coalitionSet.has(key)) {
    return 'coalition';
  }

  if (supportSet.has(key)) {
    return 'support';
  }

  return 'opposition';
}

function buildColumnBlocks(
  coalition: CoalitionData,
  colIndex: number,
  parties: PartyInfo[]
): PartyBlock[] {
  const coalitionSet = new Set(coalition.coalition);
  const supportSet = new Set(coalition.support ?? []);

  const grouped = new Map<string, { seats: number; role: PartyRole }>();
  Object.entries(coalition.seats).forEach(([key, seats]) => {
    if (seats <= 0) return;

    const entry = grouped.get(key) ?? {seats: 0, role: 'opposition' as PartyRole};
    entry.seats += seats;

    const role = getPartyRole(coalitionSet, supportSet, key);
    if (ROLE_ORDER[role] < ROLE_ORDER[entry.role]) {
      entry.role = role;
    }

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

  list.sort((a, b) => {
    if (a.role !== b.role) return ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
    return b.seats - a.seats;
  });

  return list;
}

function layoutColumnBlocks(list: PartyBlock[], colIndex: number): number[] {
  let y = HEADER_SPACE;
  const dividers: number[] = [];

  list.forEach((block, idx) => {
    block.x = LABEL_SPACE + colIndex * (BLOCK_WIDTH + COLUMN_GAP);
    block.y = y;
    y += block.height + ROW_GAP;

    const next = list[idx + 1];
    if (next && next.role !== block.role) {
      dividers.push(y + ROLE_GAP / 2);
      y += ROLE_GAP;
    }
  });

  return dividers;
}

function collectContinuityEdges(colBlocks: PartyBlock[][], selectedCount: number): { block: PartyBlock; next: PartyBlock }[] {
  const edges: { block: PartyBlock; next: PartyBlock }[] = [];

  for (let colIndex = 0; colIndex < selectedCount - 1; colIndex += 1) {
    const list = colBlocks[colIndex];
    const nextList = colBlocks[colIndex + 1];

    for (const block of list) {
      for (const next of nextList) {
        if (next.party === block.party) {
          edges.push({block, next});
        }
      }
    }
  }

  return edges;
}

function collectFirstSeen(colBlocks: PartyBlock[][]): Record<string, number> {
  const firstSeen: Record<string, number> = {};

  for (const [colIndex, list] of colBlocks.entries()) {
    for (const block of list) {
      const previous = firstSeen[block.party];
      firstSeen[block.party] = previous === undefined ? colIndex : Math.min(previous, colIndex);
    }
  }

  return firstSeen;
}

function collectMergeEdges(
  colBlocks: PartyBlock[][],
  parties: PartyInfo[],
  firstSeen: Record<string, number>
): { from: PartyBlock; to: PartyBlock }[] {
  const mergeEdges: { from: PartyBlock; to: PartyBlock }[] = [];
  const previousNamesByParty = new Map<string, string[]>();
  for (const party of parties) {
    if (!previousNamesByParty.has(party.party)) {
      previousNamesByParty.set(party.party, party.previous_names ?? []);
    }
  }

  for (let colIndex = 1; colIndex < colBlocks.length; colIndex += 1) {
    const previousBlocks = new Map(colBlocks[colIndex - 1].map((block) => [block.party, block]));
    appendColumnMergeEdges(
      mergeEdges,
      colBlocks[colIndex],
      previousBlocks,
      previousNamesByParty,
      firstSeen,
      colIndex
    );
  }

  return mergeEdges;
}

function appendColumnMergeEdges(
  edges: { from: PartyBlock; to: PartyBlock }[],
  blocks: PartyBlock[],
  previousBlocks: Map<string, PartyBlock>,
  previousNamesByParty: Map<string, string[]>,
  firstSeen: Record<string, number>,
  colIndex: number
): void {
  for (const block of blocks) {
    if (firstSeen[block.party] !== colIndex) continue;

    const predecessors = previousNamesByParty.get(block.party) ?? [];
    for (const predecessor of predecessors) {
      const from = previousBlocks.get(predecessor);
      if (from && from.party !== block.party) {
        edges.push({from, to: block});
      }
    }
  }
}

function collectSplitEdges(
  colBlocks: PartyBlock[][],
  parties: PartyInfo[],
  firstSeen: Record<string, number>
): { from: PartyBlock; to: PartyBlock }[] {
  const splitEdges: { from: PartyBlock; to: PartyBlock }[] = [];

  for (let colIndex = 0; colIndex < colBlocks.length; colIndex += 1) {
    const list = colBlocks[colIndex];

    for (const block of list) {
      if (firstSeen[block.party] !== colIndex) continue;

      const parents = getSplitParents(block.party, parties);
      if (parents.length === 0) continue;

      const parent = parents[0];
      const previousList = colBlocks[colIndex - 1];
      const from = previousList?.find((candidate) => candidate.party === parent || candidate.canonical === parent)
        ?? list.find((candidate) => candidate.party === parent || candidate.canonical === parent);

      if (!from || from === block) continue;
      splitEdges.push({from, to: block});
    }
  }

  return splitEdges;
}

function buildParliamentLayout(
  coalitions: CoalitionData[],
  parties: PartyInfo[],
  start: number,
  end: number
): ParliamentLayout {
  const selected = coalitions.slice(start, end + 1);
  const selectedCount = selected.length;

  const colBlocks = selected.map((coalition, colIndex) =>
    buildColumnBlocks(coalition, colIndex, parties)
  );
  const colDividers = colBlocks.map((colBlock, index) => layoutColumnBlocks(colBlock, index));

  const columnWidth = selectedCount * (BLOCK_WIDTH + COLUMN_GAP) + LABEL_SPACE * 2 - COLUMN_GAP;
  const svgWidth = Math.max(columnWidth, LEGEND_WIDTH);
  const maxColHeight = Math.max(
    0,
    ...colBlocks.map((list) => {
      const last = list[list.length - 1];
      return last ? last.y + last.height : 0;
    })
  );
  const svgHeight = Math.ceil(maxColHeight + LEGEND_SPACE);

  const edges = collectContinuityEdges(colBlocks, selectedCount);
  const firstSeen = collectFirstSeen(colBlocks);
  const mergeEdges = collectMergeEdges(colBlocks, parties, firstSeen);
  const splitEdges = collectSplitEdges(colBlocks, parties, firstSeen);

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
  const lineageRibbons = useMemo(
    () => buildLineageRibbons(edges, mergeEdges, splitEdges),
    [edges, mergeEdges, splitEdges]
  );
  const continuityRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'continuity');
  const mergeRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'merge');
  const splitRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'split');

  if (columns === 0) {
    return <div className="text-gray-400 text-center py-8">No coalition data available</div>;
  }

  const selectedCount = selected.length;

  const isPartyHighlighted = (party: string) => !highlightedParties || highlightedParties.has(party);

  // Ribbon paths + gradient ids shared by the definitions and the rendered paths.
  const lineageRibbonPath = (ribbon: LineageRibbon) =>
    buildRibbonPath(
      ribbon.from.x + BLOCK_WIDTH,
      ribbon.sourceYTop,
      ribbon.sourceYBottom,
      ribbon.to.x,
      ribbon.targetYTop,
      ribbon.targetYBottom
    );

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
      <div className="parliament-scroll overflow-x-auto">
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
          {mergeRibbons.map(({from, to}) => {
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
          {splitRibbons.map(({from, to}) => {
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
        {continuityRibbons.map((ribbon) => {
          const {from: block, to: next} = ribbon;
          const d = lineageRibbonPath(ribbon);
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
        {mergeRibbons.map((ribbon) => {
          const {from, to} = ribbon;
          const d = lineageRibbonPath(ribbon);
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
        {splitRibbons.map((ribbon) => {
          const {from, to} = ribbon;
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
            const y1 = (ribbon.sourceYTop + ribbon.sourceYBottom) / 2;
            const y2 = (ribbon.targetYTop + ribbon.targetYBottom) / 2;
            const o = SPLIT_OFFSET;
            const mid = (y1 + y2) / 2;
            const w = Math.max(
              2,
              Math.min(
                ribbon.sourceYBottom - ribbon.sourceYTop,
                ribbon.targetYBottom - ribbon.targetYTop
              )
            );
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
          const d = lineageRibbonPath(ribbon);
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
          const columnKey = `${coalition.name}-${coalition.year}`;

          return (
            <g key={columnKey}>
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
