import type { Site } from '@homestead/catalog';
import { inGrowingSeason, type ClimateTable, type DayWeather } from './climate.ts';
import { nextRandom } from './rng.ts';
import type { WeatherMode } from './types.ts';

/**
 * Real-weather mode (the "90%" model): one set of seeded draws per year on top of
 * the site's average-year table. Distributions are documented in docs/ENGINE.md
 * (Real weather); every constant is here.
 */
export const REAL_WEATHER = {
  /** Annual precipitation is lognormal with mean 1 and this coefficient of variation. */
  precipCvArid: 0.25,
  precipCvHumid: 0.15,
  /** Sites with less annual precipitation than this (inches) count as arid. */
  aridBelowIn: 20,
  /** Degree-day multiplier swing: a warm year has HDD × (1 − s·u) and CDD × (1 + s·u), u ∈ [−1, 1]. */
  degreeDaySwing: 0.08,
  /** Chance per year of a late frost, and how many days it takes off the start of the season. */
  lateFrostChance: 0.3,
  lateFrostDays: [21, 30] as const,
  /** Chances of 0, 1, or 2 heat waves in a summer (June through August). */
  heatWaveCounts: [0.5, 0.35, 0.15] as const,
  heatWaveDays: [5, 10] as const,
  /** During a heat wave, each day's CDD becomes base × mult + add. */
  heatWaveCddMult: 2,
  heatWaveCddAdd: 6,
  /** Chance per year of a hailstorm in the growing season; it wipes out garden output for a week. */
  hailChance: 0.15,
  hailDays: 7,
  /** Draws taken per year, whatever happens (keeps the RNG stream aligned across outcomes). */
  drawsPerYear: 12,
} as const;

const SUMMER = { first: 151, last: 242 }; // Jun 1 .. Aug 31 (0-based)

/** One year's weather draws. Recorded in the game state (`weatherLog`) and in saves. */
export interface YearWeather {
  year: number;
  /** Multiplier on the year's precipitation. */
  precipMult: number;
  hddMult: number;
  cddMult: number;
  /** Days the season's start is pushed back by a late frost (0 = none). */
  lateFrostDays: number;
  heatWaves: { start: number; days: number }[];
  /** First day (0-based) of a week of hail-damaged gardens, or null. */
  hailDay: number | null;
}

function lerpInt(u: number, [lo, hi]: readonly [number, number]): number {
  return lo + Math.min(hi - lo, Math.floor(u * (hi - lo + 1)));
}

/** Draw one year's weather. Always consumes `REAL_WEATHER.drawsPerYear` values. */
export function drawYearWeather(site: Site, year: number, rng: number): [YearWeather, number] {
  const u: number[] = [];
  let s = rng;
  for (let i = 0; i < REAL_WEATHER.drawsPerYear; i++) {
    const [v, n] = nextRandom(s);
    u.push(v);
    s = n;
  }
  const at = (i: number) => u[i]!;
  const W = REAL_WEATHER;

  // Precipitation: lognormal with mean 1 (Box-Muller from draws 0 and 1).
  const cv = site.assumptions.precipIn < W.aridBelowIn ? W.precipCvArid : W.precipCvHumid;
  const sigma = Math.sqrt(Math.log(1 + cv * cv));
  const z = Math.sqrt(-2 * Math.log(1 - at(0))) * Math.cos(2 * Math.PI * at(1));
  const precipMult = Math.exp(sigma * z - (sigma * sigma) / 2);

  // Degree days: one warm/cold swing.
  const swing = (2 * at(2) - 1) * W.degreeDaySwing;

  // Late frost.
  const lateFrostDays = at(3) < W.lateFrostChance ? lerpInt(at(4), W.lateFrostDays) : 0;

  // Heat waves in summer, not overlapping.
  const count = at(5) < W.heatWaveCounts[0] ? 0 : at(5) < W.heatWaveCounts[0] + W.heatWaveCounts[1] ? 1 : 2;
  const heatWaves: YearWeather['heatWaves'] = [];
  for (let k = 0; k < count; k++) {
    const days = lerpInt(at(6 + 2 * k), W.heatWaveDays);
    const span = SUMMER.last - SUMMER.first - days + 1;
    let start = SUMMER.first + Math.floor(at(7 + 2 * k) * span);
    const prev = heatWaves[0];
    if (prev && start < prev.start + prev.days && start + days > prev.start) {
      start = Math.min(SUMMER.last - days + 1, prev.start + prev.days + 7);
      if (start < prev.start + prev.days) continue; // no room for a second one
    }
    heatWaves.push({ start, days });
  }

  // Hail: a day inside the (possibly shortened) growing season.
  let hailDay: number | null = null;
  if (at(10) < W.hailChance) {
    const seasonDays: number[] = [];
    for (let d = 0; d < 365; d++) if (growingOn(site, d, lateFrostDays)) seasonDays.push(d);
    if (seasonDays.length) hailDay = seasonDays[Math.floor(at(11) * seasonDays.length)]!;
  }

  return [
    {
      year,
      precipMult,
      hddMult: 1 - swing,
      cddMult: 1 + swing,
      lateFrostDays,
      heatWaves,
      hailDay,
    },
    s,
  ];
}

/** Whether a day is in the growing season after a late frost pushes its start back. */
function growingOn(site: Site, day: number, lateFrostDays: number): boolean {
  if (!inGrowingSeason(site, day)) return false;
  if (lateFrostDays <= 0) return true;
  const start = site.growingSeason.startDay - 1; // 0-based
  const since = (day - start + 365) % 365;
  return since >= lateFrostDays;
}

function inHeatWave(yw: YearWeather, day: number): boolean {
  return yw.heatWaves.some((h) => day >= h.start && day < h.start + h.days);
}

/**
 * The day's weather. Average mode (the "80%" model) is the site's average-year
 * table. Real mode applies the year's draws (`yw`, from `drawYearWeather`).
 */
export function weatherFor(
  site: Site,
  table: ClimateTable,
  day: number,
  mode: WeatherMode,
  yw: YearWeather | undefined,
): DayWeather {
  const base = table.days[day]!;
  const tags: string[] = [];
  if (mode !== 'real' || !yw) {
    if (day + 1 === site.growingSeason.startDay) tags.push('last frost');
    if (day === site.growingSeason.endDay) tags.push('first frost');
    return tags.length ? { ...base, tags } : base;
  }
  const late = yw.lateFrostDays;
  const startDay0 = (site.growingSeason.startDay - 1 + late) % 365;
  if (day === startDay0) tags.push(late ? `last frost (${late} days late)` : 'last frost');
  if (day === site.growingSeason.endDay) tags.push('first frost');
  if (day === 0) {
    if (yw.precipMult < 0.8) tags.push('dry year');
    else if (yw.precipMult > 1.2) tags.push('wet year');
  }
  const heat = inHeatWave(yw, day);
  if (heat) tags.push('heat wave');
  const hail = yw.hailDay !== null && day >= yw.hailDay && day < yw.hailDay + REAL_WEATHER.hailDays;
  if (hail && day === yw.hailDay) tags.push('hail');
  const cdd = base.cdd * yw.cddMult;
  return {
    ...base,
    hdd: base.hdd * yw.hddMult,
    cdd: heat ? cdd * REAL_WEATHER.heatWaveCddMult + REAL_WEATHER.heatWaveCddAdd : cdd,
    precipIn: base.precipIn * yw.precipMult,
    growing: growingOn(site, day, late),
    growMult: hail ? 0 : 1,
    tags,
  };
}
