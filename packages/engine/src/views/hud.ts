import type { Catalog } from '@homestead/catalog';
import { balanceFeasible, type FeasibleResult } from '../balance/feasible.ts';
import { explained, type Explained } from '../provenance.ts';
import { dateLabel, monthOfDay } from '../time/calendar.ts';
import { siteAssumptions } from './site.ts';
import type { GameState } from '../time/types.ts';
import type { Design } from '../design.ts';
import { laborWeek } from './labor.ts';
import { summarizeLedgers } from '../time/summarize.ts';
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

/** Per system, the share of its placed instances whose heat or cooling reaches a shelter (G11). */
export function designDelivered(state: GameState, catalog: Catalog): NonNullable<Design['delivered']> {
  const spatial = computeSpatial(catalog, state);
  const resByName = new Map(catalog.resources.map((r) => [r.name, r]));
  const sums: Record<string, { n: number; lost: Record<string, number>; resources: Set<string> }> = {};
  for (const i of state.instances) {
    const bag = (sums[i.systemId] ??= { n: 0, lost: {}, resources: new Set() });
    bag.n += i.scale ?? 1;
    for (const r of Object.keys(spatial.get(i.id)?.undelivered ?? {})) bag.lost[r] = (bag.lost[r] ?? 0) + (i.scale ?? 1);
  }
  const out: NonNullable<Design['delivered']> = {};
  for (const [id, b] of Object.entries(sums)) {
    for (const [r, lost] of Object.entries(b.lost)) {
      if (resByName.get(r)?.deliversTo !== 'shelter') continue;
      (out[id] ??= {})[r] = 1 - lost / b.n;
    }
  }
  // Heat and cooling from systems that do reach a shelter count fully.
  for (const id of Object.keys(sums)) out[id] ??= {};
  for (const [id, m] of Object.entries(out)) {
    for (const r of ['Heat', 'Cooling']) if (m[r] === undefined) m[r] = 1;
    out[id] = m;
  }
  return out;
}

/** The balance-mode design for a game: counts, spatial effects, the site's ambient supply, delivery. */
export function designForGame(state: GameState, catalog: Catalog, scope: 'planned' | 'completed' = 'planned'): Design {
  // Forecasts assume completion and maturity. Live simulation state is never mutated.
  state = {
    ...state,
    instances: scope === 'completed'
      ? state.instances.filter((i) => i.status === 'active')
      : state.instances.map((i) => i.status === 'building' ? { ...i, status: 'active' as const } : i),
  };
  return {
    counts: designCounts(state),
    adjust: designAdjust(state, catalog),
    ambient: state.site.ambient,
    delivered: designDelivered(state, catalog),
  };
}

/**
 * The "Average year" for the current layout on the game's site: feasible balance (actual flows,
 * with supply chains and placement), with the potential ceiling beside it (G11).
 */
export function designBalance(state: GameState, catalog: Catalog, scope: 'planned' | 'completed' = 'planned'): FeasibleResult {
  return balanceFeasible(catalog, siteAssumptions(state.site), designForGame(state, catalog, scope));
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
  measurementLabel: string;
  season: Season;
  day: number;
  year: number;
  cash: Explained;
  laborUsedWeek: Explained;
  laborAvailableWeek: Explained;
  /** Measured need coverage over the last 7 days. */
  score: Explained;
  /** The same score if every input were met (the ceiling). */
  potentialScore: Explained;
  /** Share of supply made at home, not bought (G12). */
  selfReliance: Explained;
  /** What the HUD leads with: self-reliance and weekly bills (adapt start) or the off-grid score. */
  headline: 'self-reliance' | 'off-grid';
  weather: { hdd: number; psh: number; precipIn: number; growing: boolean; tags: string[] };
}

/** Everything the top bar shows, each number with its provenance. */
export function hudMetrics(state: GameState, catalog: Catalog): HudMetrics {
  const labor = laborWeek(state, catalog);
  const summary = summarizeLedgers(state.ledgers.slice(-7), catalog, state.settings.transportAccess);
  // No history is zero measured supply, never a silent forecast fallback.
  const scored = summary.checklist.filter((r) => r.needed > 0 && !((state.settings.transportAccess || state.ledgers.slice(-7).some((l) => l.access !== undefined)) && r.need === 'Transportation'));
  const w = state.weather;
  return {
    measurementLabel: state.ledgers.length ? `Last ${Math.min(7, state.ledgers.length)} measured days` : 'No measured days yet',
    date: dateLabel(state.calendar.day, state.calendar.year),
    season: seasonOf(state.calendar.day),
    day: state.calendar.day,
    year: state.calendar.year,
    cash: explained(state.cash, 'starting cash − purchases + refunds + income − running costs', {
      refs: { startingCash: state.settings.startingCash },
    }),
    laborUsedWeek: labor.worked,
    laborAvailableWeek: labor.available,
    score: explained(summary.overallScore, 'measured need coverage over the last 7 days; no construction forecasts', {
      refs: { days: state.ledgers.slice(-7).length },
    }),
    potentialScore: explained(scored.length ? scored.reduce((a, r) => a + Math.min(1, Math.max(r.potential, r.delivered) / r.needed), 0) / scored.length : 0,
      'last 7 days: operating-system potential or measured delivery from stocks, whichever is greater, capped at need'),
    selfReliance: explained(summary.selfReliance, 'measured self-reliance over the last 7 days'),
    headline: state.start?.headline ?? 'off-grid',
    weather: { hdd: w.hdd, psh: w.psh, precipIn: w.precipIn, growing: w.growing, tags: w.tags },
  };
}
