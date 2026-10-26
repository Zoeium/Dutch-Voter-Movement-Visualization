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

const MONTH_ABBREVIATIONS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

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
