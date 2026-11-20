import {useMemo, useState} from 'react';
import type {CoalitionData, ElectionYear, PartyInfo} from '@/types';
import {getCoalitionForElection, getPartyColor, getPartyDisplayName, resolvePartyName} from '@/data/loader';
import {EmptyState, RibbonGradient} from '@/components/shared';
import {
  buildGradientId,
  buildRibbonPath,
  defaultRange,
  formatElectionDate,
  formatElectionLabel,
  scaleToFill,
} from '@/components/diagramUtils';
import {useI18n} from '@/theme';
import {collectMergeEdges, collectSplitEdges} from '@/components/lineage';

interface ParliamentDiagramProps {
  coalitions: CoalitionData[];
  parties: PartyInfo[];
  /**
   * The country's elections: their dates label the election markers above the columns,
   * and their votes divide a merged party between its predecessors.
   */
  elections?: ElectionYear[];
  /** The cabinets shown (indices into `coalitions`); the last ten when left out. */
  range?: {start: number; end: number};
}

const NO_ELECTIONS: ElectionYear[] = [];

const ELECTION_MARKER_COLOR = '#10b981';

interface PartyBlock {
  party: string;           // literal seat key (each key is its own block)
  canonical: string;       // resolved identity used for cross-column connection matching
  displayName: string;
  color: string;
  seats: number;
  role: PartyRole;         // coalition / tolerating party / opposition
  columnIndex: number;     // index within the SELECTED range
  height: number;          // proportional to seats
  width: number;           // proportional to the cabinet's time in office
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

// Height of the seats of the largest chamber among the shown columns; smaller chambers
// are shorter in proportion to their number of seats.
const CHAMBER_HEIGHT = 450;
// Every block is at least one line of label text tall, so every party is named. Small
// parties are then taller than their share; the rest of the column stays proportional.
const MIN_BLOCK_HEIGHT = 12;
// Block height at which the in-block label steps up to the regular font size.
const MEDIUM_LABEL_HEIGHT = 24;
const SMALL_LABEL_PX = 9;
const MEDIUM_LABEL_PX = 12;
const LABEL_PADDING_X = 4;
const LABEL_LINE_HEIGHT = 1.2;
const ROW_GAP = 6;
// Extra room inserted where a column changes role (coalition -> tolerating party ->
// opposition), so the three groups read as separate bands.
const ROLE_GAP = 26;
// A column's width follows the time its cabinet was in office (until the next cabinet's
// inauguration, or until today for the sitting one). Kept narrow so that a long selection
// still fits side by side, and so scrolling through all coalitions stays short.
const PX_PER_YEAR = 32;
// A cabinet that fell within months still gets a column wide enough for short labels.
const MIN_BLOCK_WIDTH = 44;
// The election pill above a column is at least this wide, so its date stays readable.
const MIN_MARKER_WIDTH = 72;
const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;
const COLUMN_GAP = 42;
const LABEL_SPACE = 40;
// Cabinet name, year in office and, for a cabinet formed after an election, the election marker.
const HEADER_SPACE = 70;
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

  // The block's own seat scale (columns can differ), shrunk only when the ribbons carry
  // more seats than the block holds.
  const blockScale = block.seats > 0 ? block.height / block.seats : 0;
  const pixelsPerSeat = Math.min(blockScale, block.height / totalSeats);
  let y = block.y;
  for (const ribbon of group) {
    const bottom = y + getRibbonSeats(ribbon, side) * pixelsPerSeat;
    setRibbonSpan(ribbon, side, y, bottom);
    y = bottom;
  }
}

// Canvas used to measure label widths, created on first use.
let measureContext: CanvasRenderingContext2D | null | undefined;
const labelWidthCache = new Map<string, number>();

/** Rendered width of a block label in the page font (cached: blocks re-render on hover). */
function measureLabel(text: string, fontPx: number, fontWeight = 600): number {
  const key = `${fontWeight}|${fontPx}|${text}`;
  const cached = labelWidthCache.get(key);
  if (cached !== undefined) return cached;
  measureContext ??= document.createElement('canvas').getContext('2d');
  let width = text.length * fontPx * 0.6;
  if (measureContext) {
    measureContext.font = `${fontWeight} ${fontPx}px ${getComputedStyle(document.body).fontFamily || 'sans-serif'}`;
    width = measureContext.measureText(text).width;
  }
  labelWidthCache.set(key, width);
  return width;
}

/** Shorten text with an ellipsis until it fits `maxWidth`. */
function truncateToWidth(text: string, fontPx: number, maxWidth: number, fontWeight = 600): string {
  if (measureLabel(text, fontPx, fontWeight) <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && measureLabel(`${text.slice(0, end).trimEnd()}…`, fontPx, fontWeight) > maxWidth) end--;
  return `${text.slice(0, end).trimEnd()}…`;
}

/**
 * Fit "Name (seats)" inside a block: one line when it fits, otherwise the name over
 * the seat count when the block is tall enough, otherwise a shortened name. A labelled
 * block always shows its seat count; the full name is in the block's tooltip.
 */
function fitBlockLabel(
  name: string,
  seats: number,
  height: number,
  width: number
): { lines: string[]; fontPx: number } {
  // Every block is at least MIN_BLOCK_HEIGHT tall, which fits one line of the small font.
  const maxWidth = width - 2 * LABEL_PADDING_X;
  const fontPx = height >= MEDIUM_LABEL_HEIGHT ? MEDIUM_LABEL_PX : SMALL_LABEL_PX;
  const seatText = `(${seats})`;
  const oneLine = `${name} ${seatText}`;
  if (measureLabel(oneLine, fontPx) <= maxWidth) return {lines: [oneLine], fontPx};
  if (height >= 2 * fontPx * LABEL_LINE_HEIGHT + 4) {
    return {lines: [truncateToWidth(name, fontPx, maxWidth), seatText], fontPx};
  }
  const room = maxWidth - measureLabel(` ${seatText}`, fontPx);
  return {lines: [`${truncateToWidth(name, fontPx, room)} ${seatText}`], fontPx};
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
  splitEdges: { from: PartyBlock; to: PartyBlock }[],
  votesOf: (block: PartyBlock) => number | undefined
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

  for (const [block, group] of targetGroups) shareMergedBlock(block, group, votesOf);
  for (const [block, group] of sourceGroups) allocateRibbonGroup(block, group, 'source');
  for (const [block, group] of targetGroups) allocateRibbonGroup(block, group, 'target');

  return ribbons;
}

/**
 * Where parties merge into one block, divide that block between the incoming lines by
 * the votes each party won at its previous election, rather than giving each the whole
 * merged party's seats. Falls back to their seats when any of them has no vote count.
 */
function shareMergedBlock(
  block: PartyBlock,
  group: LineageRibbon[],
  votesOf: (block: PartyBlock) => number | undefined
): void {
  if (group.length < 2 || !group.some((ribbon) => ribbon.kind === 'merge')) return;
  const votes = group.map((ribbon) => votesOf(ribbon.from));
  const weights = votes.every((count) => count !== undefined && count > 0)
    ? (votes as number[])
    : group.map((ribbon) => ribbon.from.seats);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) return;
  group.forEach((ribbon, index) => {
    ribbon.targetSeats = (block.seats * (weights[index] ?? 0)) / total;
  });
}

/** One cabinet's column in the diagram. */
interface LayoutColumn {
  coalition: CoalitionData;
  /** Left edge; the width follows the cabinet's time in office. */
  x: number;
  width: number;
  blocks: PartyBlock[];
  /** y position of each role divider line (none when the column has one role). */
  dividers: number[];
}

interface ParliamentLayout {
  /** The selected cabinets, left to right. */
  columns: LayoutColumn[];
  edges:{ block: PartyBlock; next: PartyBlock }[];
  mergeEdges: { from: PartyBlock; to: PartyBlock }[];
  splitEdges: { from: PartyBlock; to: PartyBlock }[];
  svgWidth: number;
  svgHeight: number;
}

/** How a party relates to the cabinet of a column. */
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
  parties: PartyInfo[],
  x: number,
  width: number
): PartyBlock[] {
  const coalitionSet = new Set(coalition.coalition);
  const supportSet = new Set(coalition.support ?? []);

  // One block per party with seats (the keys of a seat map are unique).
  const list = Object.entries(coalition.seats)
    .filter(([, seats]) => seats > 0)
    .map(([key, seats]): PartyBlock => ({
      party: key,
      canonical: resolvePartyName(key, parties),
      displayName: getPartyDisplayName(key, parties),
      color: getPartyColor(key, parties),
      seats,
      role: getPartyRole(coalitionSet, supportSet, key),
      columnIndex: colIndex,
      height: 0,
      width,
      x,
      y: 0,
    }));

  // Coalition first, then a tolerating party, then the opposition; largest first in each.
  return list.sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || b.seats - a.seats);
}

/** Total block height at `pxPerSeat`, with every block at least MIN_BLOCK_HEIGHT. */
function blockHeightsAt(list: PartyBlock[], pxPerSeat: number): number {
  return list.reduce((sum, block) => sum + Math.max(MIN_BLOCK_HEIGHT, block.seats * pxPerSeat), 0);
}

function totalSeatsOf(list: PartyBlock[]): number {
  return list.reduce((sum, block) => sum + block.seats, 0);
}

/**
 * Size the blocks of a column so that together they are `target` tall. Blocks too small
 * for a label are raised to MIN_BLOCK_HEIGHT and the larger ones share what is left in
 * proportion to their seats, so they never shrink below `minPxPerSeat` per seat.
 */
function sizeColumnBlocks(list: PartyBlock[], target: number, minPxPerSeat: number): void {
  const fill = scaleToFill(list.map((block) => block.seats), target, MIN_BLOCK_HEIGHT);
  const pxPerSeat = Math.max(minPxPerSeat, fill);
  for (const block of list) block.height = Math.max(MIN_BLOCK_HEIGHT, block.seats * pxPerSeat);
}

/** Number of role changes (coalition -> support -> opposition) down a column. */
function countRoleChanges(list: PartyBlock[]): number {
  return list.filter((block, idx) => idx > 0 && list[idx - 1]?.role !== block.role).length;
}

/** Room a column needs between its blocks, with the minimum row gap. */
function minimumGapHeight(list: PartyBlock[]): number {
  return Math.max(0, list.length - 1) * ROW_GAP + countRoleChanges(list) * ROLE_GAP;
}

/** Height of a column's blocks and its fixed gaps, with the minimum row gap. */
function minimumColumnHeight(list: PartyBlock[]): number {
  return list.reduce((sum, block) => sum + block.height, 0) + minimumGapHeight(list);
}

/**
 * Stack a column's blocks so that it ends at `columnHeight`: the blocks keep their
 * heights and the row gaps take up the rest, so a column with few parties gets wider
 * gaps instead of ending higher up than a column with as many seats.
 */
function layoutColumnBlocks(list: PartyBlock[], columnHeight: number): number[] {
  const rowGaps = Math.max(0, list.length - 1);
  const extra = Math.max(0, columnHeight - minimumColumnHeight(list));
  const rowGap = rowGaps > 0 ? ROW_GAP + extra / rowGaps : ROW_GAP;
  let y = HEADER_SPACE;
  const dividers: number[] = [];

  list.forEach((block, idx) => {
    block.y = y;
    y += block.height + rowGap;

    const next = list[idx + 1];
    if (next && next.role !== block.role) {
      dividers.push(y + ROLE_GAP / 2);
      y += ROLE_GAP;
    }
  });

  return dividers;
}

/** A party's block in each column joined to its block in the next column. */
function collectContinuityEdges(colBlocks: PartyBlock[][]): { block: PartyBlock; next: PartyBlock }[] {
  return colBlocks.slice(1).flatMap((nextList, index) => {
    const nextByParty = new Map(nextList.map((next) => [next.party, next]));
    return (colBlocks[index] ?? []).flatMap((block) => {
      const next = nextByParty.get(block.party);
      return next ? [{block, next}] : [];
    });
  });
}

/** Start of a cabinet's term in ms. */
function cabinetStart(coalition: CoalitionData): number {
  return Date.parse(`${coalition.inauguration}T12:00:00Z`);
}

/** Year the cabinet took office, for the labels. */
function cabinetYear(coalition: CoalitionData): string {
  return coalition.inauguration.slice(0, 4);
}

/**
 * Column width of the cabinet at `index`: its time in office, which runs until the next
 * cabinet's inauguration (also when that one lies outside the selection), or until `now`
 * for the sitting cabinet.
 */
function cabinetColumnWidth(coalitions: CoalitionData[], index: number, now: number): number {
  const cabinet = coalitions[index];
  if (!cabinet) return MIN_BLOCK_WIDTH;
  const next = coalitions[index + 1];
  const years = ((next ? cabinetStart(next) : now) - cabinetStart(cabinet)) / MS_PER_YEAR;
  return Number.isFinite(years) ? Math.max(MIN_BLOCK_WIDTH, years * PX_PER_YEAR) : MIN_BLOCK_WIDTH;
}

/**
 * Build every derived item for the currently selected range. Kept pure and
 * module-level so the component can memoize it and hover updates stay cheap.
 */
function buildParliamentLayout(
  coalitions: CoalitionData[],
  parties: PartyInfo[],
  start: number,
  end: number,
  now: number
): ParliamentLayout {
  // Place the columns side by side, each as wide as its cabinet's time in office.
  let nextX = LABEL_SPACE;
  const placed = coalitions.slice(start, end + 1).map((coalition, colIndex) => {
    const x = nextX;
    const width = cabinetColumnWidth(coalitions, start + colIndex, now);
    nextX += width + COLUMN_GAP;
    return {coalition, x, width, blocks: buildColumnBlocks(coalition, colIndex, parties, x, width)};
  });
  const colBlocks = placed.map((column) => column.blocks);

  // One scale for every column, so a column's height follows its number of seats: the
  // Dutch chamber grows from 100 to 150 seats in 1956, Italy's shrinks to 400 in 2022.
  // On top of that, every column gets the same room for raising small parties to label
  // height and for the gaps, so columns with as many seats end at the same height.
  const maxSeats = Math.max(0, ...colBlocks.map(totalSeatsOf));
  const pxPerSeat = maxSeats > 0 ? CHAMBER_HEIGHT / maxSeats : 0;
  const raise = Math.max(0, ...colBlocks.map((list) => blockHeightsAt(list, pxPerSeat) - totalSeatsOf(list) * pxPerSeat));
  const gapHeight = Math.max(0, ...colBlocks.map(minimumGapHeight));
  const columns = placed.map((column): LayoutColumn => {
    const blocksHeight = totalSeatsOf(column.blocks) * pxPerSeat + raise;
    sizeColumnBlocks(column.blocks, blocksHeight, pxPerSeat);
    return {...column, dividers: layoutColumnBlocks(column.blocks, blocksHeight + gapHeight)};
  });

  const columnsWidth = nextX - COLUMN_GAP + LABEL_SPACE;
  const svgWidth = Math.max(columnsWidth, LEGEND_WIDTH);
  const maxColHeight = Math.max(
    0,
    ...colBlocks.map((list) => {
      const last = list.at(-1);
      return last ? last.y + last.height : 0;
    })
  );
  const svgHeight = Math.ceil(maxColHeight + LEGEND_SPACE);

  const edges = collectContinuityEdges(colBlocks);
  const mergeEdges = collectMergeEdges(colBlocks, parties);
  const splitEdges = collectSplitEdges(colBlocks, parties);

  return {columns, edges, mergeEdges, splitEdges, svgWidth, svgHeight};
}

/** Render coalition composition and party lineage across cabinets. */
export default function ParliamentDiagram({
  coalitions,
  parties,
  elections = NO_ELECTIONS,
  range,
}: Readonly<ParliamentDiagramProps>) {
  const {lang, t} = useI18n();

  const electionsById = useMemo(
    () => new Map(elections.map((election) => [election.year, election])),
    [elections]
  );

  // The first cabinet after an election starts a new parliament: the seats changed there
  // because of the vote, not because of a cabinet change mid-term.
  const electionStarts = useMemo(() => {
    const electionYears = new Set(coalitions.map((coalition) => coalition.electionYear));
    return new Set(
      [...electionYears].map((electionYear) => electionYear && getCoalitionForElection(electionYear, coalitions))
    );
  }, [coalitions]);

  const electionLabel = (electionYear: string): string => {
    const date = electionsById.get(electionYear)?.voteTotals.date;
    if (!date) return `${t('election')} ${formatElectionLabel(electionYear, lang)}`;
    return `${t('electionMarker')} · ${formatElectionDate(date, lang)}`;
  };
  const cabinetCount = coalitions.length;
  const [hoveredParty, setHoveredParty] = useState<string | null>(null);
  const selectedRange = range ?? defaultRange(cabinetCount);

  const start = Math.max(0, Math.min(selectedRange.start, cabinetCount - 1));
  const end = Math.max(start, Math.min(selectedRange.end, cabinetCount - 1));

  // Derived layout is memoized so hover updates (local state) do not re-run the
  // effectively O(columns x blocks^2) edge/split computation on every mouse move.
  const {columns, edges, mergeEdges, splitEdges, svgWidth, svgHeight} = useMemo(
    () => buildParliamentLayout(coalitions, parties, start, end, Date.now()),
    [coalitions, parties, start, end]
  );

  // Hover highlight set: the hovered party plus its merge lineage. `null` (nothing
  // hovered) means every block is drawn at full opacity.
  const highlightedParties = useMemo(
    () => collectMergeLineage(hoveredParty, mergeEdges),
    [hoveredParty, mergeEdges]
  );
  const lineageRibbons = useMemo(() => {
    // A block's votes at the election its column's seats come from.
    const votesOf = (block: PartyBlock) => {
      const electionYear = columns[block.columnIndex]?.coalition.electionYear;
      return electionYear ? electionsById.get(electionYear)?.voteTotals.parties_votes[block.party] : undefined;
    };
    return buildLineageRibbons(edges, mergeEdges, splitEdges, votesOf);
  }, [edges, mergeEdges, splitEdges, columns, electionsById]);
  const continuityRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'continuity');
  const mergeRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'merge');
  const splitRibbons = lineageRibbons.filter((ribbon) => ribbon.kind === 'split');

  if (columns.length === 0) return <EmptyState message={t('noCoalitionData')}/>;

  const isPartyHighlighted = (party: string) => !highlightedParties || highlightedParties.has(party);

  // Ribbon paths + gradient ids shared by the definitions and the rendered paths.
  const lineageRibbonPath = (ribbon: LineageRibbon) =>
    buildRibbonPath(
      ribbon.from.x + ribbon.from.width,
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

      {/* Horizontal scroll keeps every column at its natural, legible width instead of
          squashing a long selection down to illegible slivers. */}
      <div className="parliament-scroll overflow-x-auto">
        <svg
          data-export-chart
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
                x1={from.x + from.width}
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
                x1={from.x + from.width}
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
            const x1 = from.x + from.width;
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
        {columns.map(({coalition, x: columnX, width: columnWidth, blocks: list, dividers}, colIndex) => {
          const columnKey = `${coalition.name}-${coalition.inauguration}`;
          const columnCenter = columnX + columnWidth / 2;
          const markerWidth = Math.max(columnWidth, MIN_MARKER_WIDTH) + 16;
          // A short cabinet has a narrow column: shorten its name to the room up to its neighbours.
          const headerName = truncateToWidth(coalition.name, 14, columnWidth + COLUMN_GAP - 6, 700);
          const startsAfterElection = electionStarts.has(coalition) && coalition.electionYear !== undefined;

          return (
            <g key={columnKey}>
              {startsAfterElection && (
                <g className="pointer-events-none">
                  <title>{electionLabel(coalition.electionYear ?? '')}</title>
                  {/* A new parliament starts here: a line between the columns, except before the first. */}
                  {colIndex > 0 && (
                    <line
                      x1={columnX - COLUMN_GAP / 2}
                      x2={columnX - COLUMN_GAP / 2}
                      y1={HEADER_SPACE - 14}
                      y2={svgHeight - LEGEND_SPACE + 8}
                      stroke={ELECTION_MARKER_COLOR}
                      strokeOpacity={0.45}
                      strokeWidth={1.5}
                      strokeDasharray="2 4"
                    />
                  )}
                  <rect
                    x={columnCenter - markerWidth / 2}
                    y={HEADER_SPACE - 23}
                    width={markerWidth}
                    height={16}
                    rx={8}
                    fill={ELECTION_MARKER_COLOR}
                    fillOpacity={0.15}
                    stroke={ELECTION_MARKER_COLOR}
                    strokeOpacity={0.6}
                  />
                  <text
                    x={columnCenter}
                    y={HEADER_SPACE - 15}
                    dy="0.35em"
                    textAnchor="middle"
                    fill={ELECTION_MARKER_COLOR}
                    className="text-[9px] font-semibold"
                  >
                    {electionLabel(coalition.electionYear ?? '')}
                  </text>
                </g>
              )}

              {/* Coalition header */}
              <text
                x={columnCenter}
                y={26}
                textAnchor="middle"
                className="fill-app-muted text-sm font-bold"
              >
                {headerName !== coalition.name && <title>{coalition.name}</title>}
                {headerName}
              </text>
              <text
                x={columnCenter}
                y={40}
                textAnchor="middle"
                className="fill-app-subtle text-[10px]"
              >
                {cabinetYear(coalition)}
              </text>

              {/* Role dividers: coalition above the line, opposition below it; a tolerating
                  party sits in its own band in between. */}
              {dividers.map((dividerY) => (
                <line
                  key={`divider-${dividerY}`}
                  x1={columnX - 10}
                  x2={columnX + columnWidth + 10}
                  y1={dividerY}
                  y2={dividerY}
                  stroke="var(--c-divider-line)"
                  strokeWidth={2}
                  strokeDasharray="4 4"
                />
              ))}

              {/* Party blocks */}
              {list.map((block) => {
                const isHovered = isPartyHighlighted(block.party);
                const label = fitBlockLabel(block.displayName, block.seats, block.height, block.width);
                const lineHeight = label.fontPx * LABEL_LINE_HEIGHT;
                const firstLineY = block.y + block.height / 2 - ((label.lines.length - 1) * lineHeight) / 2;
                // Tolerating parties are drawn translucent, so the page shows through: use the
                // theme's text colour, which is readable on the page in both themes.
                const labelColor = block.role === 'support' ? 'var(--c-text-heading)' : getLabelColor(block.color);

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
                      width={block.width}
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
                    <title>{`${block.displayName}: ${block.seats} ${t('coalitionSeatsLabel')}`}</title>
                    {/* Always labelled and always inside the block (see fitBlockLabel), so the
                        colour picked from the block colour is the colour behind the text. */}
                    <text
                      x={block.x + block.width / 2}
                      y={firstLineY}
                      textAnchor="middle"
                      fill={labelColor}
                      fontSize={label.fontPx}
                      className="font-semibold pointer-events-none"
                    >
                      {label.lines.map((line, index) => (
                        <tspan key={line} x={block.x + block.width / 2} dy={index === 0 ? '0.35em' : lineHeight}>
                          {line}
                        </tspan>
                      ))}
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
          <text x={26} y={10} className="fill-app-muted text-[10px]">
            {t('toleratingParty')}
          </text>

          <line x1={232} x2={260} y1={5} y2={5} stroke="var(--c-divider-line)" strokeWidth={2} strokeDasharray="4 4"/>
          <text x={268} y={10} className="fill-app-muted text-[10px]">
            {t('coalitionOpposition')}
          </text>
        </g>
        <g transform={`translate(${LABEL_SPACE}, ${svgHeight - 12})`} className="pointer-events-none">
          <rect width={18} height={11} rx={5.5} fill={ELECTION_MARKER_COLOR} fillOpacity={0.15} stroke={ELECTION_MARKER_COLOR} strokeOpacity={0.6}/>
          <text x={26} y={10} className="fill-app-muted text-[10px]">
            {t('electionMarkerLegend')}
          </text>
        </g>
        </svg>
      </div>
    </div>
  );
}
