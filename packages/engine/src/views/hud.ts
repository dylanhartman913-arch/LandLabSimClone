import type { Catalog } from '@homestead/catalog';
import { balance, type BalanceResult } from '../balance/balance.ts';
import { explained, type Explained } from '../provenance.ts';
import { dateLabel, monthOfDay } from '../time/calendar.ts';
import { siteAssumptions } from './site.ts';
import type { GameState } from '../time/types.ts';
import type { Design } from '../design.ts';
import { computeSpatial } from '../time/spatial.ts';

/** Counts of every placed system (built or building; a child counts 0.6), for balance mode and "My". */
export function designCounts(state: GameState, opts: { activeOnly?: boolean } = {}): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const i of state.instances) {
    if (opts.activeOnly && i.status !== 'active') continue;
    counts[i.systemId] = (counts[i.systemId] ?? 0) + (i.scale ?? 1);
  }
  return counts;
}

/** Per-system average spatial multipliers for balance mode, with the reasons. */
export function designAdjust(state: GameState, catalog: Catalog): NonNullable<Design['adjust']> {
  const spatial = computeSpatial(catalog, state);
  const sums: Record<
    string,
    { n: number; in: Record<string, number>; out: Record<string, number>; notes: Set<string> }
  > = {};
  for (const i of state.instances) {
    const sp = spatial.get(i.id);
    const bag = (sums[i.systemId] ??= { n: 0, in: {}, out: {}, notes: new Set() });
    bag.n += 1;
    if (!sp) continue;
    for (const [r, m] of Object.entries(sp.inMult)) bag.in[r] = (bag.in[r] ?? 0) + (m - 1);
    for (const [r, m] of Object.entries(sp.outMult)) bag.out[r] = (bag.out[r] ?? 0) + (m - 1);
    for (const n of sp.notes) bag.notes.add(n);
  }
  const adjust: NonNullable<Design['adjust']> = {};
  for (const [id, b] of Object.entries(sums)) {
    const conv = (x: Record<string, number>) =>
      Object.fromEntries(
        Object.entries(x).map(([r, d]) => [r, { factor: 1 + d / b.n, notes: [...b.notes] }]),
      );
    if (Object.keys(b.in).length || Object.keys(b.out).length)
      adjust[id] = { in: conv(b.in), out: conv(b.out) };
  }
  return adjust;
}

/** Balance mode for the current layout on the game's site ("Average year"), with spatial effects. */
export function designBalance(state: GameState, catalog: Catalog): BalanceResult {
  return balance(catalog, siteAssumptions(state.site), {
    counts: designCounts(state),
    adjust: designAdjust(state, catalog),
  });
}

export type Season = 'spring' | 'summer' | 'fall' | 'winter';

/** Display season for a day of year (meteorological: Mar-May spring, …). */
export function seasonOf(day: number): Season {
  const m = monthOfDay(day);
  if (m >= 2 && m <= 4) return 'spring';
  if (m >= 5 && m <= 7) return 'summer';
  if (m >= 8 && m <= 10) return 'fall';
  return 'winter';
}

export interface HudMetrics {
  date: string;
  season: Season;
  day: number;
  year: number;
  cash: Explained;
  laborUsedWeek: Explained;
  laborAvailableWeek: Explained;
  score: Explained;
  weather: { hdd: number; psh: number; precipIn: number; growing: boolean; tags: string[] };
}

/** Everything the top bar shows, each number with its provenance. */
export function hudMetrics(state: GameState, catalog: Catalog, bal?: BalanceResult): HudMetrics {
  const week = state.ledgers.slice(-7);
  let used = 0;
  let avail = 0;
  for (const l of week) {
    used += l.labor.construction + l.labor.upkeepDelivered;
    avail += l.labor.pool;
  }
  const b = bal ?? designBalance(state, catalog);
  const w = state.weather;
  return {
    date: dateLabel(state.calendar.day, state.calendar.year),
    season: seasonOf(state.calendar.day),
    day: state.calendar.day,
    year: state.calendar.year,
    cash: explained(state.cash, 'starting cash − purchases + refunds + income − running costs', {
      refs: { startingCash: state.settings.startingCash },
    }),
    laborUsedWeek: explained(used, 'construction + upkeep hours worked over the last 7 days', {
      refs: { days: week.length },
    }),
    laborAvailableWeek: explained(avail, 'Σ Human Being labor × health over the last 7 days', {
      refs: { days: week.length },
    }),
    score: b.overallScore,
    weather: { hdd: w.hdd, psh: w.psh, precipIn: w.precipIn, growing: w.growing, tags: w.tags },
  };
}
