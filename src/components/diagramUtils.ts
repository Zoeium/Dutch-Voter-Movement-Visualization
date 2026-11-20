/**
 * Pure helpers shared by more than one diagram (class names, id builders and the
 * ribbon geometry) so those definitions live in exactly one place.
 */

import type {Language} from '@/theme';

/** Tailwind class for an active/inactive toggle button. */
export const toggleButtonClass = (active: boolean): string =>
  active
    ? 'bg-emerald-500 text-white'
    : 'bg-app-btn text-app-btn-text hover:bg-app-btn-hover';

/**
 * Tailwind class for a party chip button. `ringOffsetClass` must be a literal
 * class (e.g. 'ring-offset-app-bg') matching the surface behind the chip.
 */
export const partyButtonClass = (selected: boolean, ringOffsetClass: string): string => {
  const stateClass = selected ? 'ring-2 ring-offset-2 ' + ringOffsetClass : 'bg-app-btn text-app-btn-text hover:bg-app-btn-hover';
  return `${stateClass} px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2`;
};

// Every diagram formats numbers the same way: English thousands separators.
const NUMBER_LOCALE = 'en-US';

/** A count with thousands separators: 1,234,567. */
export function formatNumber(n: number): string {
  return n.toLocaleString(NUMBER_LOCALE);
}

/** A count with an explicit sign for gains: +1,234 / -1,234 / 0. */
export function formatSignedNumber(n: number): string {
  return `${n > 0 ? '+' : ''}${formatNumber(n)}`;
}

/** A percentage with one decimal: 12.3%. */
export function formatPct(n: number): string {
  return `${n.toFixed(1)}%`;
}

/** A change in percentage points with an explicit sign for gains: +1.2pp. */
export function formatSignedPP(n: number): string {
  return `${n > 0 ? '+' : ''}${n.toFixed(1)}pp`;
}

/** Pair up the items of two lists by position, as far as the shorter one goes. */
export function zip<A, B>(first: readonly A[], second: readonly B[]): [A, B][] {
  const pairs: [A, B][] = [];
  const length = Math.min(first.length, second.length);
  for (let index = 0; index < length; index += 1) {
    pairs.push([first[index] as A, second[index] as B]);
  }
  return pairs;
}

/** Sum the flow values leaving and entering every source and target id. */
export function sumFlowValues(
  flows: readonly {source: string; target: string; value: number}[]
): {outgoing: Record<string, number>; incoming: Record<string, number>} {
  const outgoing: Record<string, number> = {};
  const incoming: Record<string, number> = {};
  for (const flow of flows) {
    outgoing[flow.source] = (outgoing[flow.source] ?? 0) + flow.value;
    incoming[flow.target] = (incoming[flow.target] ?? 0) + flow.value;
  }
  return {outgoing, incoming};
}

/**
 * The scale (pixels per seat) at which a column of blocks is exactly `target` tall, when
 * every block is drawn `seats * scale` tall but never less than `minHeight`.
 *
 * Sorted by seats, the blocks raised to `minHeight` are always the smallest ones. So try
 * raising none, then the smallest, then the two smallest, and so on: the scale that fills
 * the rest of the column is the answer as soon as the next block is tall enough by itself.
 * Returns 0 when there is nothing to scale.
 */
export function scaleToFill(seats: readonly number[], target: number, minHeight: number): number {
  const sorted = seats.filter((count) => count > 0).sort((a, b) => a - b);
  let remainingSeats = sorted.reduce((sum, count) => sum + count, 0);
  for (const [raised, smallest] of sorted.entries()) {
    const scale = (target - raised * minHeight) / remainingSeats;
    if (smallest * scale >= minHeight) return scale;
    remainingSeats -= smallest;
  }
  return 0;
}

const DATE_LOCALES: Record<Language, string> = {en: 'en-GB', nl: 'nl-NL'};

/** "Feb 1974" in English, "feb 1974" in Dutch: a month and year in the interface language. */
function formatMonthYear(year: number, month: number, lang: Language): string {
  const date = new Date(Date.UTC(year, month - 1, 15));
  return new Intl.DateTimeFormat(DATE_LOCALES[lang], {month: 'short', year: 'numeric', timeZone: 'UTC'}).format(date);
}

/**
 * Display label for an election id. Ids are years, or YYYY-MM when a country held
 * two elections in one year (UK 1974): '1974-02' becomes 'Feb 1974' ('feb 1974' in Dutch).
 */
export function formatElectionLabel(id: string, lang: Language = 'en'): string {
  const match = /^(\d{4})-(\d{2})$/.exec(id);
  const month = Number(match?.[2]);
  return match && month >= 1 && month <= 12 ? formatMonthYear(Number(match[1]), month, lang) : id;
}

/** The month and year of an election date (YYYY-MM-DD), in the interface language. */
export function formatElectionDate(date: string, lang: Language = 'en'): string {
  const [year, month] = date.split('-').map(Number);
  return formatMonthYear(year ?? 0, month ?? 1, lang);
}

/** How many of the most recent items a view with a time axis shows at first. */
export const DEFAULT_RANGE_SIZE = 10;

/** The range such a view starts with: the last DEFAULT_RANGE_SIZE items, or all when fewer. */
export function defaultRange(count: number): {start: number; end: number} {
  return {start: Math.max(0, count - DEFAULT_RANGE_SIZE), end: Math.max(0, count - 1)};
}

/** Filter an array by an inclusive index range. */
export function sliceByIndexRange<T>(items: T[], start: number, end: number): T[] {
  return items.filter((_, index) => index >= start && index <= end);
}

/** Build a DOM-id-safe identifier for a gradient (sanitises every part). */
export function buildGradientId(...parts: Array<string | number>): string {
  return ['grad', ...parts].join('-').replace(/[^a-zA-Z0-9_-]/g, '-');
}

/** Build a DOM-id-safe identifier for a stripe pattern (definition + reference). */
export function buildStripeId(...parts: Array<string | number>): string {
  return ['stripes', ...parts].join('-').replace(/[^a-zA-Z0-9_-]/g, '-');
}

/**
 * Smooth cubic-bezier ribbon between two horizontal bands (alluvial style):
 * the band is flush with the source band at `sourceX` and with the target band
 * at `targetX`. Shared by the Alluvial and Parliament diagrams.
 */
export function buildRibbonPath(
  sourceX: number,
  sourceYTop: number,
  sourceYBot: number,
  targetX: number,
  targetYTop: number,
  targetYBot: number
): string {
  const midX = (sourceX + targetX) / 2;
  return (
    `M ${sourceX} ${sourceYTop}` +
    ` C ${midX} ${sourceYTop}, ${midX} ${targetYTop}, ${targetX} ${targetYTop}` +
    ` L ${targetX} ${targetYBot}` +
    ` C ${midX} ${targetYBot}, ${midX} ${sourceYBot}, ${sourceX} ${sourceYBot}` +
    ` Z`
  );
}
