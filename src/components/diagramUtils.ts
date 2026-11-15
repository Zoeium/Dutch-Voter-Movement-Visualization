/**
 * Pure helpers shared by more than one diagram (class names, id builders and the
 * ribbon geometry) so those definitions live in exactly one place.
 */

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

const MONTH_ABBREVIATIONS =['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Display label for an election id. Ids are years, or YYYY-MM when a country held
 * two elections in one year (UK 1974): '1974-02' becomes 'Feb 1974'.
 */
export function formatElectionLabel(id: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(id);
  const month = match ? MONTH_ABBREVIATIONS[Number(match[2]) - 1] : undefined;
  return match && month ? `${month} ${match[1]}` : id;
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
