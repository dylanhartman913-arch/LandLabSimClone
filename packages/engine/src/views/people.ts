import type { Catalog } from '@homestead/catalog';
import { explained, type Explained } from '../provenance.ts';
import { getPlans } from '../time/plans.ts';
import { computeSpatial } from '../time/spatial.ts';
import type { GameState } from '../time/types.ts';
import { laborShare, type WellbeingTerm } from '../time/wellbeing.ts';

/** Days of supply below this show red (G15 stockpile HUD). */
export const STOCKPILE_RED_DAYS = 3;

export interface StockpileItem {
  key: 'food' | 'drinking-water' | 'firewood' | 'battery';
  label: string;
  /** The resource page this item opens. */
  resource: string;
  /** Days the stock lasts at today's use (Infinity when nothing uses it). */
  days: Explained;
  trend: 'up' | 'down' | 'flat';
  red: boolean;
}

/**
 * The stockpile bar (G15, Timberborn's top bar): days of food, drinking water, firewood, and
 * battery at the household's current daily use, each with a 7-day trend.
 */
export function stockpileView(state: GameState, catalog: Catalog): StockpileItem[] {
  const plans = getPlans(catalog, state.site);
  const meta = new Map(catalog.resources.map((r) => [r.name, r]));
  // Daily use: what the active, present systems ask for (people in town ask for nothing).
  const use = (resource: string): number => {
    let a = 0;
    for (const i of state.instances) {
      if (i.status !== 'active' || i.person?.away) continue;
      for (const f of plans.bySystem.get(i.systemId)!.inputs) {
        if (f.resource === resource && !f.isCapacity) a += (f.weekly / 7) * (i.scale ?? 1);
      }
    }
    return a;
  };
  const foodFamily = catalog.resources.filter((r) => r.needsRow === 'Food');
  const stockOf = (key: StockpileItem['key'], stocks: Record<string, number>): number => {
    switch (key) {
      case 'food':
        return foodFamily.reduce((a, r) => a + (stocks[r.name] ?? 0) * (r.factorToNeed ?? 1), 0);
      case 'drinking-water':
        return stocks['Drinking water'] ?? 0;
      case 'firewood':
        return stocks['Woody biomass'] ?? 0;
      case 'battery':
        return stocks['Electricity'] ?? 0;
    }
  };
  const weekAgo = state.ledgers.length >= 7 ? state.ledgers[state.ledgers.length - 7]! : null;
  const items: [StockpileItem['key'], string, string, string][] = [
    ['food', 'Food', 'Food', 'kcal'],
    ['drinking-water', 'Drinking water', 'Drinking water', 'gal'],
    ['firewood', 'Firewood', 'Woody biomass', 'lbs'],
    ['battery', 'Battery', 'Electricity', 'kWh'],
  ];
  return items.map(([key, label, resource, unit]) => {
    const stock = stockOf(key, state.stocks);
    const daily = use(resource === 'Food' ? 'Food' : resource);
    const days = daily > 1e-9 ? stock / daily : Infinity;
    let trend: StockpileItem['trend'] = 'flat';
    if (weekAgo) {
      const then: Record<string, number> = {};
      for (const [r, l] of Object.entries(weekAgo.resources)) then[r] = l.start;
      const before = stockOf(key, then);
      const tol = Math.max(0.02 * Math.max(stock, before), daily * 0.25, 1e-6);
      trend = stock - before > tol ? 'up' : before - stock > tol ? 'down' : 'flat';
    }
    const unitName = meta.get(resource)?.unit ?? unit;
    return {
      key,
      label,
      resource,
      days: explained(days, `${label.toLowerCase()} on hand ÷ daily use`, {
        refs: { onHand: stock, dailyUse: daily },
        notes: [
          `${Math.round(stock).toLocaleString('en-US')} ${unit} on hand; the household and its systems use ${daily.toFixed(1)} ${unitName} a day.`,
          ...(key === 'food' ? ['Every food in stock counts, converted to kcal.'] : []),
        ],
      }),
      trend,
      red: days < STOCKPILE_RED_DAYS,
    };
  });
}

export interface PersonView {
  id: string;
  label: string;
  wellbeing: Explained;
  /** Labor share (0.5 at wellbeing 0, 1 at 100). */
  labor: number;
  away: boolean;
  /** The biggest term moving wellbeing today. */
  topReason: WellbeingTerm | null;
  why: WellbeingTerm[];
}

/** Each person's wellbeing bar and why it is moving (G15). */
export function peopleView(state: GameState, catalog?: Catalog): PersonView[] {
  const heatNotes = catalog ? shelterHeatNeedNotes(state, catalog).map((n) => `Heat is judged against the shelter's heat need: ${n}`) : [];
  return state.instances
    .filter((i) => i.person)
    .map((i, k) => {
      const p = i.person!;
      const change = p.why.reduce((a, t) => a + t.points, 0);
      return {
        id: i.id,
        label: `Person ${k + 1}`,
        wellbeing: explained(p.wellbeing, 'yesterday’s wellbeing + recovery − penalties (each day costs at most 8 points)', {
          refs: { changeToday: change, laborShare: laborShare(p.wellbeing) },
          notes: [...p.why.map((t) => `${t.points >= 0 ? '+' : '−'}${Math.abs(t.points).toFixed(2)}  ${t.label}`), ...heatNotes],
        }),
        labor: p.health,
        away: !!p.away,
        topReason: p.why.find((t) => Math.abs(t.points) > 1e-9) ?? null,
        why: p.why,
      };
    });
}

/**
 * What lowers each shelter's heat need (G16): the host modifiers sitting on it (wool blankets,
 * a weatherization retrofit), each with its multiplier, and the shelter's combined multiplier.
 * The checklist's Heated shelter row and the people bar both judge heat against this need.
 */
export function shelterHeatNeedNotes(state: GameState, catalog: Catalog): string[] {
  const spatial = computeSpatial(catalog, state);
  const name = (id: string) => catalog.systems.find((x) => x.id === id)?.name ?? id;
  const rules = catalog.adjacencyRules.filter((r) => r.scope === 'host' && r.effect.resource === 'Heat' && r.effect.direction === 'in');
  const out: string[] = [];
  for (const sh of state.instances) {
    const total = spatial.get(sh.id)?.inMult['Heat'];
    if (sh.status !== 'active' || total === undefined || Math.abs(total - 1) < 1e-9) continue;
    const parts: string[] = [];
    const half = Math.sqrt(catalog.systems.find((x) => x.id === sh.systemId)?.footprintSqft ?? 0) / 2;
    for (const r of rules) {
      // A host modifier counts when it sits on the shelter: its centre inside the footprint (as in spatial.ts).
      const on = state.instances.some(
        (src) => src.systemId === r.from && src.status === 'active' && Math.abs(src.x - sh.x) <= half + 1e-6 && Math.abs(src.y - sh.y) <= half + 1e-6,
      );
      if (on) parts.push(`${name(r.from)} × ${r.effect.multiplier.toFixed(2)}`);
    }
    out.push(`${name(sh.systemId)}: heat need × ${total.toFixed(2)}${parts.length ? ` (${[...new Set(parts)].join(', ')})` : ''}`);
  }
  return out;
}
