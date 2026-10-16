import { NEED_KEYS, type Catalog, type NeedKey } from '@homestead/catalog';
import type { DesignFile } from './design.ts';
import { digest } from './digest.ts';
import { gameFromDesign } from './scenario.ts';
import { monthOfDay } from './time/calendar.ts';
import { stepDays } from './time/step.ts';
import { summarizeLedgers } from './time/summarize.ts';
import type { WeatherMode } from './time/types.ts';

export const MONTE_CARLO_SCHEMA = 'homestead.montecarlo.v1';

export interface MonteCarloSpec {
  design: DesignFile;
  siteId: string;
  years: number;
  seeds: number;
  /** Run k uses seed baseSeed + k. */
  baseSeed: number;
  /** Real weather by default (the point of Monte Carlo); average for a check. */
  weatherMode?: WeatherMode;
}

export interface MonteCarloRun {
  seed: number;
  /** Lowest weekly coverage of each row over the whole run (null: nothing needed it). */
  worstWeek: Record<NeedKey, number | null>;
  /** Months (of years × 12) with at least one hardship event. */
  hardshipMonths: number;
  /** Overall score of each year. */
  yearScores: number[];
  /** Precipitation multiplier of each year (1 in average weather). */
  precipMults: number[];
}

export interface RowDistribution {
  need: NeedKey;
  /** Runs where the row was needed. */
  n: number;
  min: number;
  p10: number;
  p50: number;
  p90: number;
  mean: number;
  /** Runs per tenth of coverage: [0-10%), [10-20%) … [90-100%], 100% counted in the last bin. */
  histogram: number[];
}

export interface MonteCarloResult {
  schema: typeof MONTE_CARLO_SCHEMA;
  design: string;
  siteId: string;
  years: number;
  seeds: number;
  baseSeed: number;
  weatherMode: WeatherMode;
  rows: RowDistribution[];
  /** Share of runs with any hardship month. */
  pAnyHardshipMonth: number;
  /** Average hardship months per year across runs. */
  hardshipMonthsPerYear: number;
  /** Mean of yearly overall scores across runs, and its 10th percentile. */
  meanScore: number;
  p10Score: number;
  runs: MonteCarloRun[];
  /** Fingerprint of every run's numbers (in-app and CLI results agree when these match). */
  digest: string;
}

/** One seed: build the design, step it for `years`, and record what matters. Pure. */
export function monteCarloRun(catalog: Catalog, spec: MonteCarloSpec, k: number): MonteCarloRun {
  const seed = spec.baseSeed + k;
  let s = gameFromDesign(catalog, spec.design, {
    siteId: spec.siteId,
    seed,
    weatherMode: spec.weatherMode ?? 'real',
  });
  const worst = {} as Record<NeedKey, number | null>;
  for (const need of NEED_KEYS) worst[need] = null;
  const yearScores: number[] = [];
  const precipMults: number[] = [];
  let hardshipMonths = 0;
  for (let y = 0; y < spec.years; y++) {
    const r = stepDays(s, catalog, 365);
    s = r.state;
    const sum = summarizeLedgers(r.ledgers, catalog);
    yearScores.push(sum.overallScore);
    precipMults.push(s.yearWeather?.year === y ? s.yearWeather.precipMult : 1);
    for (const row of sum.checklist) {
      if (row.needed <= 1e-9) continue;
      const w = row.worstWeekPct;
      const prev = worst[row.need];
      worst[row.need] = prev === null ? w : Math.min(prev, w);
    }
    const dayOf = new Map(r.ledgers.map((l) => [l.absDay, l.day]));
    const months = new Set<number>();
    for (const e of r.events) {
      if (e.kind !== 'hardship') continue;
      const d = dayOf.get(e.absDay);
      if (d !== undefined) months.add(monthOfDay(d));
    }
    hardshipMonths += months.size;
  }
  return { seed, worstWeek: worst, hardshipMonths, yearScores, precipMults };
}

/** Linear-interpolated quantile of sorted values. */
export function quantile(sorted: readonly number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

/** Summarize runs (in seed order) into per-row distributions and hardship odds. */
export function aggregateMonteCarlo(spec: MonteCarloSpec, runs: readonly MonteCarloRun[]): MonteCarloResult {
  const rows: RowDistribution[] = [];
  for (const need of NEED_KEYS) {
    const vals = runs
      .map((r) => r.worstWeek[need])
      .filter((v): v is number => v !== null)
      .sort((a, b) => a - b);
    if (!vals.length) continue;
    const histogram = new Array<number>(10).fill(0);
    for (const v of vals) histogram[Math.min(9, Math.floor(v * 10))]! += 1;
    rows.push({
      need,
      n: vals.length,
      min: vals[0]!,
      p10: quantile(vals, 0.1),
      p50: quantile(vals, 0.5),
      p90: quantile(vals, 0.9),
      mean: vals.reduce((a, b) => a + b, 0) / vals.length,
      histogram,
    });
  }
  const scores = runs.flatMap((r) => r.yearScores).sort((a, b) => a - b);
  const totalYears = runs.length * spec.years;
  const core = {
    rows,
    pAnyHardshipMonth: runs.length ? runs.filter((r) => r.hardshipMonths > 0).length / runs.length : 0,
    hardshipMonthsPerYear: totalYears ? runs.reduce((a, r) => a + r.hardshipMonths, 0) / totalYears : 0,
    meanScore: scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0,
    p10Score: quantile(scores, 0.1),
  };
  return {
    schema: MONTE_CARLO_SCHEMA,
    design: spec.design.name,
    siteId: spec.siteId,
    years: spec.years,
    seeds: spec.seeds,
    baseSeed: spec.baseSeed,
    weatherMode: spec.weatherMode ?? 'real',
    ...core,
    runs: [...runs],
    digest: digest({ runs, ...core }),
  };
}

/** Run every seed in order (the CLI; the app runs the same loop in a Web Worker). */
export function monteCarlo(
  catalog: Catalog,
  spec: MonteCarloSpec,
  onProgress?: (done: number, total: number) => void,
): MonteCarloResult {
  const runs: MonteCarloRun[] = [];
  for (let k = 0; k < spec.seeds; k++) {
    runs.push(monteCarloRun(catalog, spec, k));
    onProgress?.(k + 1, spec.seeds);
  }
  return aggregateMonteCarlo(spec, runs);
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * The Monte Carlo table as display strings (one decimal place). The app and the
 * CLI both print these, so the same seeds show the same digits in both.
 */
export function monteCarloTable(r: MonteCarloResult): {
  headers: string[];
  rows: string[][];
  lines: string[];
} {
  return {
    headers: ['Need', 'Worst run', 'P10', 'Median', 'P90', 'Mean'],
    rows: r.rows.map((x) => [x.need, pct1(x.min), pct1(x.p10), pct1(x.p50), pct1(x.p90), pct1(x.mean)]),
    lines: [
      `Chance of at least one hardship month: ${pct1(r.pAnyHardshipMonth)}`,
      `Hardship months per year: ${r.hardshipMonthsPerYear.toFixed(2)}`,
      `Overall score: mean ${pct1(r.meanScore)}, 10th percentile ${pct1(r.p10Score)}`,
      `Digest: ${r.digest}`,
    ],
  };
}
