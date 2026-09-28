/** SVG polyline points for a 0-1 series in a w×h box (display only). */
export function sparkPoints(values: readonly number[], w: number, h: number): string {
  if (values.length === 0) return '';
  const n = Math.max(1, values.length - 1);
  return values
    .map((v, i) => `${((i / n) * w).toFixed(1)},${(h - Math.max(0, Math.min(1, v)) * h).toFixed(1)}`)
    .join(' ');
}
