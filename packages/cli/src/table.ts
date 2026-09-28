/** Render rows as a fixed-width text table. Numbers right-align. */
export function table(headers: string[], rows: (string | number)[][]): string {
  const cells = [headers, ...rows.map((r) => r.map((c) => (typeof c === 'number' ? fmt(c) : c)))];
  const widths = headers.map((_, i) => Math.max(...cells.map((r) => String(r[i] ?? '').length)));
  const numeric = headers.map((_, i) => rows.every((r) => typeof r[i] === 'number'));
  const line = (r: (string | number)[]) =>
    r.map((c, i) => (numeric[i] ? String(c).padStart(widths[i]!) : String(c).padEnd(widths[i]!))).join('  ');
  return [line(cells[0]!), widths.map((w) => '-'.repeat(w)).join('  '), ...cells.slice(1).map(line)].join(
    '\n',
  );
}

export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return String(n);
  const abs = Math.abs(n);
  if (abs >= 1000) return Math.round(n).toLocaleString('en-US');
  if (abs >= 10) return n.toFixed(digits);
  if (abs === 0) return '0';
  return n.toPrecision(3);
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
