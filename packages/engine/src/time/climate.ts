import type { Assumptions, Site } from '@homestead/catalog';
import { DAYS_IN_MONTH, monthOfDay } from './calendar.ts';

/** The day's ambient values (after any weather draw). */
export interface DayWeather {
  hdd: number;
  cdd: number;
  psh: number;
  precipIn: number;
  windCf: number;
  /** Whether today is inside the site's growing season. */
  growing: boolean;
  /** Labels for the UI and almanac (e.g. "frost", "heat wave"). */
  tags: string[];
}

/** Precomputed daily climate for one site: 365 average-year days. */
export interface ClimateTable {
  siteId: string;
  assumptions: Assumptions;
  days: DayWeather[];
  seasonDays: number;
}

function dayWeightedMean(shape: readonly number[]): number {
  let s = 0;
  for (let m = 0; m < 12; m++) s += shape[m]! * DAYS_IN_MONTH[m]!;
  return s / 365;
}

function total(shape: readonly number[]): number {
  return shape.reduce((a, b) => a + b, 0);
}

export function inGrowingSeason(site: Site, day: number): boolean {
  const d1 = day + 1; // 1-based
  const { startDay, endDay } = site.growingSeason;
  return startDay <= endDay ? d1 >= startDay && d1 <= endDay : d1 >= startDay || d1 <= endDay;
}

export function growingSeasonDays(site: Site): number {
  const { startDay, endDay } = site.growingSeason;
  return startDay <= endDay ? endDay - startDay + 1 : 365 - startDay + 1 + endDay;
}

const tables = new WeakMap<Site, ClimateTable>();

/** Average-year daily climate: monthly shapes rescaled to the site's annual scalars. */
export function climateTable(site: Site): ClimateTable {
  const hit = tables.get(site);
  if (hit) return hit;
  const a = site.assumptions;
  const mo = site.monthly;
  const hddT = total(mo.hdd);
  const cddT = total(mo.cdd);
  const pT = total(mo.precipIn);
  const pshM = dayWeightedMean(mo.psh);
  const windM = dayWeightedMean(mo.windCfMult);
  const days: DayWeather[] = [];
  for (let d = 0; d < 365; d++) {
    const m = monthOfDay(d);
    const dim = DAYS_IN_MONTH[m]!;
    days.push({
      hdd: hddT === 0 ? a.hdd / 365 : (a.hdd * mo.hdd[m]!) / hddT / dim,
      cdd: cddT === 0 ? a.cdd / 365 : (a.cdd * mo.cdd[m]!) / cddT / dim,
      psh: pshM === 0 ? a.psh : (a.psh * mo.psh[m]!) / pshM,
      precipIn: pT === 0 ? a.precipIn / 365 : (a.precipIn * mo.precipIn[m]!) / pT / dim,
      windCf: windM === 0 ? a.windCf : (a.windCf * mo.windCfMult[m]!) / windM,
      growing: inGrowingSeason(site, d),
      tags: [],
    });
  }
  const t: ClimateTable = { siteId: site.id, assumptions: a, days, seasonDays: growingSeasonDays(site) };
  tables.set(site, t);
  return t;
}
