/** Chart geometry only (pixels from engine numbers); no model arithmetic. */

/** Bar heights for a histogram, tallest = h. */
export function histogramBars(counts: readonly number[], w: number, h: number) {
  const max = Math.max(1, ...counts);
  const bw = w / Math.max(1, counts.length);
  return counts.map((c, i) => ({ x: i * bw, y: h - (c / max) * h, w: bw - 1, h: (c / max) * h }));
}

export interface Axis {
  from: number;
  to: number;
}

/** A score axis wide enough for every bar, padded, at least 4 points wide, inside 0-1. */
export function tornadoAxis(bars: readonly { low: number; high: number; base: number }[]): Axis {
  if (!bars.length) return { from: 0, to: 1 };
  let lo = Math.min(...bars.map((b) => Math.min(b.low, b.high, b.base)));
  let hi = Math.max(...bars.map((b) => Math.max(b.low, b.high, b.base)));
  const pad = Math.max(0.02, (hi - lo) * 0.1);
  lo = Math.max(0, lo - pad);
  hi = Math.min(1, hi + pad);
  return { from: lo, to: hi };
}

/** Tornado bar from `low` to `high` on the axis, with the base line. */
export function tornadoBar(low: number, high: number, base: number, w: number, axis: Axis = { from: 0, to: 1 }) {
  const x = (v: number) => ((v - axis.from) / (axis.to - axis.from)) * w;
  const x0 = x(Math.min(low, high));
  const x1 = x(Math.max(low, high));
  return { x: x0, w: Math.max(1, x1 - x0), base: x(base), lowX: x(low), highX: x(high) };
}

/** Width of a progress bar. */
export function progressWidth(done: number, total: number, w: number): number {
  return total > 0 ? (done / total) * w : 0;
}
