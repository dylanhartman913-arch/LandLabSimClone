import type { Catalog } from '@homestead/catalog';
import { getPlans } from '../time/plans.ts';
import { instanceGroupKey } from '../time/spatial.ts';
import type { GameState } from '../time/types.ts';

export type FlowGroup = 'water' | 'power' | 'food' | 'heat' | 'waste' | 'labor';

export const FLOW_GROUPS: Record<FlowGroup, { label: string; resources: string[] }> = {
  water: { label: 'Water', resources: ['Water', 'Drinking water', 'Hot water', 'Greywater'] },
  power: { label: 'Power', resources: ['Electricity'] },
  food: {
    label: 'Food',
    resources: [
      'Food',
      'Vegetables fruit fiber herbs',
      'Root crops',
      'Grain',
      'Eggs',
      'Honey',
      'Meat',
      'Milk',
      'Fish',
      'Nuts',
      'Mushrooms',
    ],
  },
  heat: { label: 'Heat', resources: ['Heat', 'Cooling', 'Cooking fuel'] },
  waste: { label: 'Waste', resources: ['Organic waste', 'Food waste', 'Manure', 'Compost', 'Sanitation'] },
  labor: { label: 'Labor', resources: ['Labor'] },
};

export interface FlowLink {
  from: string; // producer instance id
  to: string; // consumer instance id
  resource: string;
  /** Estimated per-day amount on this link. */
  amount: number;
  /** The consumer was offered less than it asked for yesterday. */
  short: boolean;
}

/**
 * Producer → consumer links for the flow overlay. Stocks are pooled in the
 * engine, so each consumer's receipt is split across producers in proportion
 * to what they produced yesterday: an honest picture of a shared pool, not of
 * pipes. Consumers with no producer get a dangling "short" link to themselves.
 */
export function flowLinks(
  state: GameState,
  catalog: Catalog,
  opts: { resources?: string[]; instanceId?: string; maxLinks?: number } = {},
): FlowLink[] {
  const plans = getPlans(catalog, state.site);
  const wanted = opts.resources ? new Set(opts.resources) : null;
  const producers = new Map<string, { id: string; amount: number }[]>();
  const consumers = new Map<string, { id: string; received: number; granted: number; requested: number }[]>();
  for (const inst of state.instances) {
    if (inst.status !== 'active') continue;
    const g = state.lastDay[instanceGroupKey(catalog, state, inst)];
    if (!g) continue;
    const plan = plans.bySystem.get(inst.systemId)!;
    for (const [r, amt] of Object.entries(g.outputs)) {
      if (wanted && !wanted.has(r)) continue;
      if (amt <= 0) continue;
      const out = plan.outputs.find((o) => o.resource === r);
      if (!out || out.cls !== 'Flow') continue;
      const list = producers.get(r) ?? [];
      list.push({ id: inst.id, amount: amt });
      producers.set(r, list);
    }
    for (const [r, rec] of Object.entries(g.inputs)) {
      if (wanted && !wanted.has(r)) continue;
      const inp = plan.inputs.find((i) => i.resource === r);
      if (!inp || inp.cls !== 'Flow') continue;
      const list = consumers.get(r) ?? [];
      list.push({ id: inst.id, received: rec.received, granted: rec.granted, requested: rec.requested });
      consumers.set(r, list);
    }
  }
  const links: FlowLink[] = [];
  for (const [r, cons] of consumers) {
    const prods = producers.get(r) ?? [];
    const total = prods.reduce((a, p) => a + p.amount, 0);
    for (const c of cons) {
      const short = c.granted < c.requested * (1 - 1e-6);
      if (!prods.length || total <= 0) {
        links.push({ from: c.id, to: c.id, resource: r, amount: 0, short: true });
        continue;
      }
      for (const p of prods) {
        if (p.id === c.id) continue;
        links.push({ from: p.id, to: c.id, resource: r, amount: (c.received * p.amount) / total, short });
      }
    }
  }
  const filtered = opts.instanceId
    ? links.filter((l) => l.from === opts.instanceId || l.to === opts.instanceId)
    : links;
  filtered.sort((a, b) => b.amount - a.amount);
  return filtered.slice(0, opts.maxLinks ?? 400);
}
