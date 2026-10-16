import type { Catalog, NeedKey } from '@homestead/catalog';
import { getSystem } from '../catalog-index.ts';
import { MONTH_NAMES, monthOfDay } from '../time/calendar.ts';
import { climateTable } from '../time/climate.ts';
import { costFor } from '../time/game.ts';
import { getPlans, shapeValue } from '../time/plans.ts';
import { summarizeLedgers } from '../time/summarize.ts';
import type { DayLedger, GameState } from '../time/types.ts';
import { seasonOf, type Season } from './hud.ts';

export interface CauseStep {
  /** System that is short (or "People" for household needs). */
  who: string;
  systemId: string | null;
  resource: string;
}

export interface Fix {
  systemId: string;
  name: string;
  cost: number;
  mode: 'buy' | 'diy';
  /** Weekly output of the short resource for one system. */
  weeklyOutput: number;
  /** Dollars per unit of weekly output. */
  costPerUnit: number;
  /** What else it needs (its required inputs). */
  needs: string[];
}

export interface ShortageReport {
  resource: string;
  unmetShare: number;
  unmet: number;
  /** "Raised Beds short on Water because Well short on Electricity because …" */
  chain: string;
  steps: CauseStep[];
  rootCause: string;
  fixes: Fix[];
}

export interface Report {
  kind: 'season' | 'year';
  title: string;
  fromAbsDay: number;
  toAbsDay: number;
  overallScore: number;
  monthly: { label: string; overall: number; rows: Record<NeedKey, number | null> }[];
  shortages: ShortageReport[];
  cash: { in: number; out: number; purchases: number; refunds: number; net: number };
  laborBySystem: { systemId: string; name: string; hours: number }[];
  constructionHours: number;
  spoiled: Record<string, number>;
  spilledPower: number;
  averageHealth: number;
}

const SEASON_WORD: Record<Season, string> = {
  spring: 'spring',
  summer: 'summer',
  fall: 'fall',
  winter: 'winter',
};

/** Which system (by id) was most often curtailed by `resource` in these ledgers. */
function mostCurtailedBy(
  ledgers: readonly DayLedger[],
  resource: string,
  exclude: Set<string>,
): string | null {
  const counts = new Map<string, number>();
  for (const l of ledgers) {
    for (const c of l.curtailed) {
      if (c.limitedBy === resource && !exclude.has(c.systemId))
        counts.set(c.systemId, (counts.get(c.systemId) ?? 0) + 1);
    }
  }
  let best: string | null = null;
  let n = 0;
  for (const [id, k] of counts) {
    if (k > n) {
      best = id;
      n = k;
    }
  }
  return best;
}

/** How a system was most often limited in these ledgers (its dominant limiting input). */
function dominantLimit(ledgers: readonly DayLedger[], systemId: string): string | null {
  const counts = new Map<string, number>();
  let days = 0;
  for (const l of ledgers) {
    for (const c of l.curtailed) {
      if (c.systemId !== systemId || !c.limitedBy) continue;
      counts.set(c.limitedBy, (counts.get(c.limitedBy) ?? 0) + 1);
    }
    days++;
  }
  let best: string | null = null;
  let n = 0;
  for (const [r, k] of counts) {
    if (k > n) {
      best = r;
      n = k;
    }
  }
  return best && n >= Math.max(1, days * 0.25) ? best : null;
}

/**
 * Explain why a resource was short, following curtailment upstream:
 * consumer ← short resource ← a producer that was itself short of something ← …
 * ending in a terminal cause (nothing makes it, storage, season, priority, or scale).
 */
export function rootCauseChain(
  state: GameState,
  catalog: Catalog,
  ledgers: readonly DayLedger[],
  resource: string,
): { steps: CauseStep[]; rootCause: string; chain: string } {
  const plans = getPlans(catalog, state.site);
  const table = climateTable(state.site);
  const active = state.instances.filter((i) => i.status === 'active');
  const steps: CauseStep[] = [];
  const seen = new Set<string>();
  const first = mostCurtailedBy(ledgers, resource, seen);
  if (first) {
    steps.push({ who: getSystem(catalog, first).name, systemId: first, resource });
    seen.add(first);
  } else {
    // Needs never curtail, so name the system that asked for it (a shelter for heat), else the household.
    const asker = [...new Set(active.map((i) => i.systemId))].find((id) => {
      const p = plans.bySystem.get(id)!;
      return !p.isHuman && p.inputs.some((x) => x.resource === resource);
    });
    if (asker) steps.push({ who: getSystem(catalog, asker).name, systemId: asker, resource });
    else steps.push({ who: 'The household', systemId: null, resource });
  }
  let current = resource;
  let rootCause = '';
  for (let depth = 0; depth < 5; depth++) {
    const producers = [...new Set(active.map((i) => i.systemId))].filter((id) =>
      plans.bySystem.get(id)!.outputs.some((o) => o.resource === current && o.cls === 'Flow'),
    );
    if (!producers.length) {
      rootCause = `nothing in the design makes ${current}`;
      break;
    }
    const limited = producers
      .map((id) => ({ id, by: dominantLimit(ledgers, id) }))
      .find((p) => p.by !== null && !seen.has(p.id));
    if (limited && limited.by) {
      steps.push({ who: getSystem(catalog, limited.id).name, systemId: limited.id, resource: limited.by });
      seen.add(limited.id);
      current = limited.by;
      continue;
    }
    // Terminal: why are the producers' outputs not enough?
    const summary = summarizeLedgers(ledgers, catalog).resources[current];
    const spilled = summary?.spilled ?? 0;
    const produced = summary?.produced ?? 0;
    // Seasonal output: average shape of the producers' output of `current` in this range.
    let shapeSum = 0;
    let shapeN = 0;
    for (const id of producers) {
      for (const o of plans.bySystem.get(id)!.outputs) {
        if (o.resource !== current || o.shape === 'steady') continue;
        for (const l of ledgers) {
          shapeSum += shapeValue(o, l.day, l.weather, table);
          shapeN++;
        }
      }
    }
    const shape = shapeN ? shapeSum / shapeN : 1;
    const season = SEASON_WORD[seasonOf(ledgers[Math.floor(ledgers.length / 2)]?.day ?? 0)];
    const names = producers.map((id) => getSystem(catalog, id).name).join(', ');
    if (shape < 0.85) {
      rootCause = `${names} ${producers.length > 1 ? 'produce' : 'produces'} ${Math.round((1 - shape) * 100)}% less ${current} in ${season}`;
    } else if (produced > 0 && spilled > 0.2 * produced) {
      rootCause = `${Math.round((spilled / produced) * 100)}% of the ${current} made is lost for lack of storage`;
    } else {
      rootCause = `${names} ${producers.length > 1 ? 'make' : 'makes'} too little ${current} for everything that needs it`;
    }
    break;
  }
  const parts = steps.map((s) => `${s.who} short on ${s.resource}`);
  const chain = `${parts.join(' because ')}${rootCause ? ` because ${rootCause}` : ''}.`;
  return { steps, rootCause, chain: chain.charAt(0).toUpperCase() + chain.slice(1) };
}

/** Catalog systems that make a resource, cheapest per unit of weekly output that the player can afford. */
export function suggestFixes(state: GameState, catalog: Catalog, resource: string, limit = 3): Fix[] {
  const plans = getPlans(catalog, state.site);
  const fixes: Fix[] = [];
  for (const sys of catalog.systems) {
    if (sys.name === 'Human Being') continue;
    const p = plans.bySystem.get(sys.id)!;
    const out = p.outputs.find((o) => o.resource === resource && !o.isCapacity);
    if (!out || out.weekly <= 0) continue;
    const mode: 'buy' | 'diy' = sys.costDiy !== undefined && sys.costDiy < sys.costBuy ? 'diy' : 'buy';
    const cost = costFor(catalog, sys.id, mode);
    if (cost > Math.max(0, state.cash)) continue;
    fixes.push({
      systemId: sys.id,
      name: sys.name,
      cost,
      mode,
      weeklyOutput: out.weekly,
      costPerUnit: cost / out.weekly,
      needs: p.inputs.filter((i) => i.role === 'required' && i.resource !== 'Labor').map((i) => i.resource),
    });
  }
  return fixes.sort((a, b) => a.costPerUnit - b.costPerUnit || a.name.localeCompare(b.name)).slice(0, limit);
}

/** A season or year report over the ledgers in a range. */
export function buildReport(
  state: GameState,
  catalog: Catalog,
  kind: 'season' | 'year',
  ledgers: readonly DayLedger[],
  title: string,
): Report {
  const sum = summarizeLedgers(ledgers, catalog);
  const monthly: Report['monthly'] = [];
  let bucket: DayLedger[] = [];
  const flush = () => {
    if (!bucket.length) return;
    const s = summarizeLedgers(bucket, catalog);
    const rows = {} as Record<NeedKey, number | null>;
    for (const r of s.checklist) rows[r.need] = r.needed > 0 ? r.pct : null;
    const first = bucket[0]!;
    monthly.push({
      label: `${MONTH_NAMES[monthOfDay(first.day)]} Y${first.year + 1}`,
      overall: s.overallScore,
      rows,
    });
    bucket = [];
  };
  for (const l of ledgers) {
    if (bucket.length && monthOfDay(l.day) !== monthOfDay(bucket[0]!.day)) flush();
    bucket.push(l);
  }
  flush();
  const shortages: ShortageReport[] = sum.topShortages
    .filter((s) => s.resource !== 'Labor' || s.unmetShare > 0.05)
    .slice(0, 3)
    .map((s) => {
      const c = rootCauseChain(state, catalog, ledgers, s.resource);
      return { ...s, ...c, fixes: suggestFixes(state, catalog, s.resource) };
    });
  const laborMap = new Map<string, number>();
  const spoiled: Record<string, number> = {};
  for (const l of ledgers) {
    for (const [id, h] of Object.entries(l.laborBySystem)) laborMap.set(id, (laborMap.get(id) ?? 0) + h);
  }
  for (const [r, v] of Object.entries(sum.resources)) if (v.spoiled > 1e-9) spoiled[r] = v.spoiled;
  return {
    kind,
    title,
    fromAbsDay: sum.fromAbsDay,
    toAbsDay: sum.toAbsDay,
    overallScore: sum.overallScore,
    monthly,
    shortages,
    cash: { ...sum.cash, net: sum.cash.in - sum.cash.out - sum.cash.purchases + sum.cash.refunds },
    laborBySystem: [...laborMap.entries()]
      .map(([systemId, hours]) => ({ systemId, name: getSystem(catalog, systemId).name, hours }))
      .sort((a, b) => b.hours - a.hours),
    constructionHours: sum.labor.construction,
    spoiled,
    spilledPower: sum.resources['Electricity']?.spilled ?? 0,
    averageHealth: sum.averageHealth,
  };
}
