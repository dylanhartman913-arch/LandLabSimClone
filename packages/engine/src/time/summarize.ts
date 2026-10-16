import { NEED_KEYS, type Catalog, type NeedKey } from '@homestead/catalog';
import { EPS } from './constants.ts';
import type { DayLedger, GameState } from './types.ts';

export interface RowSummary {
  need: NeedKey;
  /** Weekly averages (capacity rows such as Shelter are average levels). */
  provided: number;
  /** What feeding systems would provide with every input met (G11). */
  potential: number;
  needed: number;
  delivered: number;
  /** Of `provided`, what came from outside (backstops, the market, conventional services). */
  bought: number;
  /** Share of this row's coverage that the homestead made itself: (1 − bought ÷ provided). 0 when nothing is provided. */
  selfReliance: number;
  /** delivered ÷ needed, capped at 1 (0 when nothing is needed). */
  pct: number;
  /** Lowest 7-day coverage in the range (1 if the range is shorter than a week). */
  worstWeekPct: number;
}

export interface ResourceSummary {
  produced: number;
  consumed: number;
  spilled: number;
  spoiled: number;
  requested: number;
  unmet: number;
  imported: number;
}

export interface Summary {
  days: number;
  fromAbsDay: number;
  toAbsDay: number;
  checklist: RowSummary[];
  overallScore: number;
  /**
   * Self-reliance (G12): average over rows with any need of coverage × the share of it the
   * homestead made itself. 1 = everything covered from your own land; 0 = all bought or uncovered.
   */
  selfReliance: number;
  resources: Record<string, ResourceSummary>;
  cash: { in: number; out: number; purchases: number; refunds: number };
  labor: { pool: number; construction: number; upkeepRequested: number; upkeepDelivered: number };
  averageHealth: number;
  /** Resources with the largest unmet share of their requests, worst first. */
  topShortages: { resource: string; unmetShare: number; unmet: number }[];
}

const capacityRows = new WeakMap<Catalog, Set<NeedKey>>();

function capacityRowSet(catalog: Catalog): Set<NeedKey> {
  const hit = capacityRows.get(catalog);
  if (hit) return hit;
  const set = new Set<NeedKey>();
  for (const k of NEED_KEYS) {
    const feeding = catalog.resources.filter((r) => r.needsRow === k);
    if (feeding.length && feeding.every((r) => r.class === 'Capacity')) set.add(k);
  }
  capacityRows.set(catalog, set);
  return set;
}

/**
 * Self-reliance over rows with any need, leaving out the household's own labor (it measures
 * where supply comes from, not effort): average of coverage × share made at home.
 */
export function selfRelianceOf(rows: readonly { need: NeedKey; pct: number; selfReliance: number }[]): number {
  const supply = rows.filter((r) => r.need !== 'Est. Required Labor');
  return supply.length ? supply.reduce((a, r) => a + r.pct * r.selfReliance, 0) / supply.length : 0;
}

/** Summarize a run of daily ledgers (e.g. one year) into weekly averages and totals. */
export function summarizeLedgers(ledgers: readonly DayLedger[], catalog: Catalog): Summary {
  const n = ledgers.length;
  const cap = capacityRowSet(catalog);
  const checklist: RowSummary[] = NEED_KEYS.map((need) => {
    let p = 0;
    let pot = 0;
    let nd = 0;
    let dl = 0;
    let bt = 0;
    for (const l of ledgers) {
      const x = l.needs[need];
      bt += x.bought ?? 0;
      p += x.provided;
      pot += x.potential ?? x.provided;
      nd += x.needed;
      dl += x.delivered;
    }
    const scale = n === 0 ? 0 : cap.has(need) ? 1 / n : 7 / n;
    let worst = nd > EPS ? Math.min(1, dl / nd) : 1;
    if (n >= 7) {
      worst = 1;
      for (let i = 0; i + 7 <= n; i += 7) {
        let wn = 0;
        let wd = 0;
        for (let j = i; j < i + 7; j++) {
          wn += ledgers[j]!.needs[need].needed;
          wd += ledgers[j]!.needs[need].delivered;
        }
        if (wn > EPS) worst = Math.min(worst, Math.min(1, wd / wn));
      }
    }
    return {
      need,
      provided: p * scale,
      potential: pot * scale,
      needed: nd * scale,
      delivered: dl * scale,
      bought: bt * scale,
      selfReliance: p > EPS ? Math.max(0, 1 - bt / p) : 0,
      pct: nd > EPS ? Math.min(1, dl / nd) : 0,
      worstWeekPct: worst,
    };
  });
  const scored = checklist.filter((r) => r.needed > EPS);
  const resources: Record<string, ResourceSummary> = {};
  const cash = { in: 0, out: 0, purchases: 0, refunds: 0 };
  const labor = { pool: 0, construction: 0, upkeepRequested: 0, upkeepDelivered: 0 };
  let health = 0;
  for (const l of ledgers) {
    for (const [r, v] of Object.entries(l.resources)) {
      const s = (resources[r] ??= {
        produced: 0,
        consumed: 0,
        spilled: 0,
        spoiled: 0,
        requested: 0,
        unmet: 0,
        imported: 0,
      });
      s.produced += v.produced;
      s.consumed += v.consumed;
      s.spilled += v.spilled;
      s.spoiled += v.spoiled;
      s.requested += v.requested;
      s.unmet += v.unmet;
      s.imported += v.imported;
    }
    cash.in += l.cash.in;
    cash.out += l.cash.out;
    cash.purchases += l.cash.purchases;
    cash.refunds += l.cash.refunds;
    labor.pool += l.labor.pool;
    labor.construction += l.labor.construction;
    labor.upkeepRequested += l.labor.upkeepRequested;
    labor.upkeepDelivered += l.labor.upkeepDelivered;
    health += l.health;
  }
  const topShortages = Object.entries(resources)
    .filter(([, v]) => v.requested > EPS && v.unmet > EPS * Math.max(1, v.requested))
    .map(([resource, v]) => ({ resource, unmetShare: v.unmet / v.requested, unmet: v.unmet }))
    .sort((a, b) => b.unmetShare - a.unmetShare || b.unmet - a.unmet || a.resource.localeCompare(b.resource));
  return {
    days: n,
    fromAbsDay: ledgers[0]?.absDay ?? 0,
    toAbsDay: ledgers[n - 1]?.absDay ?? 0,
    checklist,
    overallScore: scored.length ? scored.reduce((a, r) => a + r.pct, 0) / scored.length : 0,
    selfReliance: selfRelianceOf(scored),
    resources,
    cash,
    labor,
    averageHealth: n ? health / n : 1,
    topShortages,
  };
}

/** Summarize the ledgers kept in state between two absolute days (inclusive). */
export function summarize(state: GameState, catalog: Catalog, range?: { from: number; to: number }): Summary {
  const ls = range
    ? state.ledgers.filter((l) => l.absDay >= range.from && l.absDay <= range.to)
    : state.ledgers;
  return summarizeLedgers(ls, catalog);
}
