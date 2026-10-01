/**
 * Utilities for sharing state via URL and exporting chart/data.
 */

/** Serialize a state object into URL search params. */
export function stateToSearchParams(state: Record<string, string | number | boolean | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(state)) {
    if (value === null || value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  return params.toString();
}

/** Parse URL search params into a string record. */
export function searchParamsToState(): Record<string, string> {
  const params = new URLSearchParams(window.location.search);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
}

/** Update the browser URL with new state without a full page reload. */
export function updateUrl(state: Record<string, string | number | boolean | null>): void {
  const qs = stateToSearchParams(state);
  const newUrl = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
  window.history.replaceState({}, '', newUrl);
}

/** Copy a URL to the clipboard. Returns true on success. */
export async function copyShareUrl(state: Record<string, string | number | boolean | null>): Promise<boolean> {
  const qs = stateToSearchParams(state);
  const url = qs ? `${window.location.origin}${window.location.pathname}?${qs}` : window.location.origin + window.location.pathname;
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}

/** Download an SVG element as a .svg file. */
export function exportSvg(svgElement: SVGSVGElement, filename: string): void {
  const serializer = new XMLSerializer();
  const svgString = serializer.serializeToString(svgElement);
  const blob = new Blob([svgString], {type: 'image/svg+xml;charset=utf-8'});
  downloadBlob(blob, filename);
}

/** Download data as a CSV file. */
export function exportCsv(headers: string[], rows: (string | number)[][], filename: string): void {
  const escapeCell = (value: string | number) => {
    const str = String(value);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8'});
  downloadBlob(blob, filename);
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
