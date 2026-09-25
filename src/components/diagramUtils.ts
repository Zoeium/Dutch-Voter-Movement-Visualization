/**
 * Pure helpers shared by more than one diagram (class names, id builders and the
 * ribbon geometry) so those definitions live in exactly one place.
 */

/** Tailwind class for an active/inactive toggle button. */
export const toggleButtonClass = (active: boolean): string =>
  active
    ? 'bg-emerald-500 text-white'
    : 'bg-gray-800 text-gray-300 hover:bg-gray-700';

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
