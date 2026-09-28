import type { Catalog, NeedKey } from '@homestead/catalog';
import { getPlans } from '../time/plans.ts';
import { summarizeLedgers } from '../time/summarize.ts';
import type { DayLedger, GameState } from '../time/types.ts';
import { suggestFixes, type Fix } from './report.ts';

export interface QuestStatus {
  done: boolean;
  /** 0-1 toward done. */
  progress: number;
  /** One line on where things stand. */
  detail: string;
}

export interface Quest {
  id: string;
  title: string;
  /** The checklist row the quest moves. */
  row: NeedKey;
  hint: string;
  check(state: GameState, catalog: Catalog): QuestStatus;
}

const FOOD_FAMILY_EXCEPT_BOUGHT = (catalog: Catalog) =>
  catalog.resources.filter((r) => r.needsRow === 'Food' && r.name !== 'Food');

function rowPct(l: DayLedger, row: NeedKey): number {
  const n = l.needs[row];
  return n.needed > 1e-9 ? Math.min(1, n.delivered / n.needed) : 1;
}

function daysMet(ledgers: readonly DayLedger[], row: NeedKey, threshold = 0.999): number {
  let streak = 0;
  for (let i = ledgers.length - 1; i >= 0; i--) {
    const l = ledgers[i]!;
    if (l.needs[row].needed <= 1e-9 || rowPct(l, row) < threshold) break;
    streak++;
  }
  return streak;
}

function activeSystems(state: GameState): Set<string> {
  return new Set(state.instances.filter((i) => i.status === 'active').map((i) => i.systemId));
}

/** Tutorial quests, in order. Each names the checklist row it moves. */
export const QUESTS: Quest[] = [
  {
    id: 'shelter-two',
    title: 'Shelter two people',
    row: 'Shelter',
    hint: 'Each person needs 200 sq ft. A bell tent gives 210; add a yurt, a cabin, or a tiny house.',
    check(state) {
      const people = state.instances
        .filter((i) => i.status === 'active' && i.person)
        .reduce((a, i) => a + (i.scale ?? 1), 0);
      const l = state.ledgers.at(-1);
      const pct = l ? rowPct(l, 'Shelter') : 0;
      const done = people >= 2 && !!l && l.needs.Shelter.needed > 0 && pct >= 0.999;
      return {
        done,
        progress: people < 2 ? 0 : pct,
        detail: people < 2 ? 'You need at least two people.' : `${Math.round(pct * 100)}% of the shelter they need.`,
      };
    },
  },
  {
    id: 'water-week',
    title: 'Drinking water every day for a week',
    row: 'Drinking water',
    hint: 'A filter makes drinking water from water; a city hookup just buys it.',
    check(state) {
      const n = daysMet(state.ledgers, 'Drinking water');
      return { done: n >= 7, progress: Math.min(1, n / 7), detail: `${Math.min(n, 7)} of 7 days in a row.` };
    },
  },
  {
    id: 'cook-free',
    title: 'Cook without buying fuel',
    row: 'Cooking fuel',
    hint: 'Solar ovens and wood stoves cook without propane or a power bill.',
    check(state, catalog) {
      const plans = getPlans(catalog, state.site);
      const bought = [...activeSystems(state)].some((id) => {
        const p = plans.bySystem.get(id)!;
        return (
          p.outputs.some((o) => o.resource === 'Cooking fuel') &&
          p.inputs.some((i) => ['Propane', 'Gasoline', 'Capital'].includes(i.resource))
        );
      });
      const n = bought ? 0 : daysMet(state.ledgers, 'Cooking fuel');
      return {
        done: n >= 7,
        progress: Math.min(1, n / 7),
        detail: bought ? 'Something you cook with runs on bought fuel.' : `${Math.min(n, 7)} of 7 days fully cooked.`,
      };
    },
  },
  {
    id: 'january-warm',
    title: 'Make it through January warm',
    row: 'Heated shelter',
    hint: 'Shelters need heat by degree-days. Stoves need wood; a coppice or trees can grow it.',
    check(state) {
      const jan = state.ledgers.filter((l) => l.day <= 30);
      const years = [...new Set(jan.map((l) => l.year))];
      for (const y of years) {
        const days = jan.filter((l) => l.year === y);
        if (days.length < 31) continue;
        const avg = days.reduce((a, l) => a + rowPct(l, 'Heated shelter'), 0) / days.length;
        if (avg >= 0.9) return { done: true, progress: 1, detail: `January of year ${y + 1}: ${Math.round(avg * 100)}% warm.` };
      }
      const cur = jan.filter((l) => l.year === state.calendar.year);
      const avg = cur.length ? cur.reduce((a, l) => a + rowPct(l, 'Heated shelter'), 0) / cur.length : 0;
      return {
        done: false,
        progress: cur.length / 31,
        detail: cur.length ? `${cur.length} of 31 January days, ${Math.round(avg * 100)}% warm so far.` : 'Waiting for January.',
      };
    },
  },
  {
    id: 'grow-ten',
    title: 'Grow 10% of your calories',
    row: 'Food',
    hint: 'Gardens, hens, trees, and fish all add calories. Count four weeks.',
    check(state, catalog) {
      const window = state.ledgers.slice(-28);
      const needed = window.reduce((a, l) => a + l.needs.Food.needed, 0);
      let grown = 0;
      for (const r of FOOD_FAMILY_EXCEPT_BOUGHT(catalog)) {
        for (const l of window) grown += (l.resources[r.name]?.consumed ?? 0) * (r.factorToNeed ?? 1);
      }
      const share = needed > 0 ? grown / needed : 0;
      return {
        done: window.length >= 28 && share >= 0.1,
        progress: Math.min(1, share / 0.1),
        detail: `${(share * 100).toFixed(1)}% of calories eaten over the last ${window.length} days were grown here.`,
      };
    },
  },
  {
    id: 'close-loop',
    title: 'Close a loop: food waste into compost into vegetables',
    row: 'Food',
    hint: 'A worm bin or compost system turns kitchen scraps into compost; raised beds turn compost into vegetables.',
    check(state, catalog) {
      const plans = getPlans(catalog, state.site);
      const ran = (pred: (id: string) => boolean) =>
        state.instances.some((i) => {
          if (i.status !== 'active' || !pred(i.systemId)) return false;
          const g = Object.entries(state.lastDay).find(([k]) => k.startsWith(`${i.systemId}|`));
          return !!g && g[1].sat > 0;
        });
      const composts = ran((id) => {
        const p = plans.bySystem.get(id)!;
        return p.inputs.some((x) => x.resource === 'Food waste') && p.outputs.some((o) => o.resource === 'Compost');
      });
      const grows = ran((id) => {
        const p = plans.bySystem.get(id)!;
        return p.inputs.some((x) => x.resource === 'Compost') && p.outputs.some((o) => o.resource === 'Vegetables fruit fiber herbs');
      });
      return {
        done: composts && grows,
        progress: (Number(composts) + Number(grows)) / 2,
        detail: `${composts ? '✓' : '✗'} scraps become compost · ${grows ? '✓' : '✗'} compost grows vegetables`,
      };
    },
  },
];

export interface Milestone {
  id: string;
  title: string;
  check(state: GameState, catalog: Catalog): boolean;
}

const HOUSEHOLD_ROWS: NeedKey[] = ['Water', 'Drinking water', 'Food', 'Shelter', 'Heated shelter'];

/** Quiet badges: achievements the design earns by running well. */
export const MILESTONES: Milestone[] = [
  {
    id: 'first-harvest',
    title: 'First harvest',
    check: (state, catalog) =>
      state.ledgers.some((l) => FOOD_FAMILY_EXCEPT_BOUGHT(catalog).some((r) => (l.resources[r.name]?.produced ?? 0) > 0)),
  },
  {
    id: 'thirty-days',
    title: '30 days without a shortage',
    check: (state) => {
      const w = state.ledgers.slice(-30);
      return w.length === 30 && w.every((l) => HOUSEHOLD_ROWS.every((r) => rowPct(l, r) >= 0.999));
    },
  },
  { id: 'first-loop', title: 'First closed loop', check: (s, c) => QUESTS[5]!.check(s, c).done },
  {
    id: 'cash-season',
    title: 'Net-positive cash for a season',
    check: (state) => {
      const w = state.ledgers.slice(-91);
      if (w.length < 91) return false;
      const net = w.reduce((a, l) => a + l.cash.in - l.cash.out - l.cash.purchases + l.cash.refunds, 0);
      return net > 0;
    },
  },
  ...[0.5, 0.75, 0.9].map((t) => ({
    id: `score-${Math.round(t * 100)}`,
    title: `${Math.round(t * 100)}% off-grid for a full year`,
    check: (state: GameState, catalog: Catalog) =>
      state.ledgers.length >= 365 && summarizeLedgers(state.ledgers.slice(-365), catalog).overallScore >= t,
  })),
];

export interface Hint {
  resource: string;
  /** Unmet per week. */
  shortfall: number;
  unit: string;
  fixes: (Fix & { covers: number; costPerUnitCovered: number })[];
}

/**
 * When a resource has been short every day for a week, suggest catalog systems
 * that make it, ranked by cost per unit of the shortfall they would cover.
 */
export function shortageHints(state: GameState, catalog: Catalog): Hint[] {
  const week = state.ledgers.slice(-7);
  if (week.length < 7) return [];
  const out: Hint[] = [];
  for (const r of catalog.resources) {
    if (r.class !== 'Flow' || r.name === 'Labor') continue;
    if (!week.every((l) => (l.resources[r.name]?.unmet ?? 0) > 1e-9)) continue;
    const shortfall = week.reduce((a, l) => a + (l.resources[r.name]?.unmet ?? 0), 0);
    const fixes = suggestFixes(state, catalog, r.name, 12)
      .map((f) => {
        const covers = Math.min(f.weeklyOutput, shortfall);
        return { ...f, covers, costPerUnitCovered: covers > 0 ? f.cost / covers : Infinity };
      })
      .sort((a, b) => a.costPerUnitCovered - b.costPerUnitCovered || a.name.localeCompare(b.name))
      .slice(0, 3);
    if (fixes.length) out.push({ resource: r.name, shortfall, unit: r.unit, fixes });
  }
  return out.sort((a, b) => b.shortfall - a.shortfall);
}
