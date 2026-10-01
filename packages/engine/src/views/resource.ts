import type { Catalog } from '@homestead/catalog';
import { getSystem, indexCatalog } from '../catalog-index.ts';
import { explained, type Explained } from '../provenance.ts';
import { costFor, setupHoursFor } from '../time/game.ts';
import { getPlans } from '../time/plans.ts';
import { computeSpatial, groupKeyOf } from '../time/spatial.ts';
import type { GameState } from '../time/types.ts';
import { designBalance } from './hud.ts';

/** A system in the design that makes the resource. */
export interface DesignProducer {
  systemId: string;
  name: string;
  count: number;
  /** Units per week it is making now (yesterday × 7, or the average year before the clock runs). */
  actualWeek: number;
  /** Units per week with every input met. */
  potentialWeek: number;
  /** potential − actual: what it could add if its own inputs were met. */
  headroomWeek: number;
  limitedBy: string | null;
}

/** A system in the design that uses the resource. */
export interface DesignConsumer {
  systemId: string;
  name: string;
  count: number;
  requestedWeek: number;
  receivedWeek: number;
}

/** A catalog system that could make the resource. */
export interface BuildOption {
  systemId: string;
  name: string;
  /** Cheapest way to get it (DIY where possible). */
  mode: 'buy' | 'diy';
  cost: number;
  setupHours: number;
  /** Units per week one makes. */
  weeklyOutput: number;
  /** Dollars per unit of weekly output. */
  costPerUnit: number;
  /** Its recurring inputs, each with whether the design already has it. */
  inputs: { resource: string; have: boolean; role: string }[];
  conventional: boolean;
}

/** A natural node on the land that yields the resource (G14). */
export interface NodeOption {
  id: string;
  type: string;
  /** Feet from the parcel's centre. */
  distanceFt: number;
  yieldPerHour: number;
  stock: number;
}

export interface ResourcePage {
  resource: string;
  unit: string;
  cls: string;
  note: string;
  needsRow: string | null;
  stock: Explained | null;
  /** Storage pool it lives in, with room now (capacity + buffer). */
  storage: { pool: string; room: number } | null;
  spoilPerWeek: number;
  /** Weekly totals for up to the last 12 weeks, oldest first. */
  weeks: { produced: number[]; purchased: number[]; consumed: number[] };
  inDesign: DesignProducer[];
  onLand: NodeOption[];
  couldBuild: BuildOption[];
  buy: { price: number; unit: string } | null;
  usedBy: DesignConsumer[];
  /** Catalog systems that use it (for "Where it goes"). */
  catalogUsers: { systemId: string; name: string }[];
  /** What happens to what nobody uses. */
  disposal: string;
}

/** Which resources the design already has a supply of (a producer, a stock, or the site). */
export function haveSupply(state: GameState, catalog: Catalog): Set<string> {
  const have = new Set<string>();
  const plans = getPlans(catalog, state.site);
  for (const inst of state.instances) for (const o of plans.bySystem.get(inst.systemId)!.outputs) have.add(o.resource);
  for (const [r, v] of Object.entries(state.stocks)) if (v > 1e-9) have.add(r);
  for (const [r, on] of Object.entries(state.site.ambient)) if (on) have.add(r);
  return have;
}

/** Catalog systems that make a resource, cheapest per unit of weekly output first. */
export function buildOptions(state: GameState, catalog: Catalog, resource: string, have = haveSupply(state, catalog)): BuildOption[] {
  const plans = getPlans(catalog, state.site);
  const out: BuildOption[] = [];
  for (const sys of catalog.systems) {
    if (sys.name === 'Human Being') continue;
    const p = plans.bySystem.get(sys.id)!;
    const o = p.outputs.find((x) => x.resource === resource);
    if (!o) continue;
    const weekly = o.isCapacity ? o.qty : o.weekly;
    if (weekly <= 0) continue;
    const mode: 'buy' | 'diy' = sys.costDiy !== undefined && sys.costDiy < sys.costBuy ? 'diy' : 'buy';
    const cost = costFor(catalog, sys.id, mode);
    out.push({
      systemId: sys.id,
      name: sys.name,
      mode,
      cost,
      setupHours: setupHoursFor(catalog, sys.id, mode),
      weeklyOutput: weekly,
      costPerUnit: cost / weekly,
      inputs: p.inputs
        .filter((i) => i.role !== 'boost')
        .map((i) => ({ resource: i.resource, have: have.has(i.resource) || i.resource === 'Labor', role: i.role ?? 'required' })),
      conventional: sys.categories.includes('Conventional') || sys.backstop,
    });
  }
  return out.sort(
    (a, b) => Number(a.conventional) - Number(b.conventional) || a.costPerUnit - b.costPerUnit || a.name.localeCompare(b.name),
  );
}

/**
 * Everything about one resource (G13): what it is, how much is on hand, where it comes from
 * (in your design, on your land, things you could build, the market), and where it goes.
 */
export function resourcePage(
  state: GameState,
  catalog: Catalog,
  resource: string,
  nodes: readonly NodeOption[] = [],
): ResourcePage {
  const idx = indexCatalog(catalog);
  const r = idx.resourceByName.get(resource);
  if (!r) throw new Error(`Unknown resource ${resource}`);
  const plans = getPlans(catalog, state.site);
  const spatial = computeSpatial(catalog, state);

  // Weekly history.
  const recent = state.ledgers.slice(-84);
  const weeks = { produced: [] as number[], purchased: [] as number[], consumed: [] as number[] };
  for (let end = recent.length; end > 0; end -= 7) {
    const block = recent.slice(Math.max(0, end - 7), end);
    let p = 0;
    let b = 0;
    let c = 0;
    for (const l of block) {
      const x = l.resources[resource];
      if (!x) continue;
      p += x.produced;
      b += x.purchased ?? 0;
      c += x.consumed;
    }
    weeks.produced.unshift(p);
    weeks.purchased.unshift(b);
    weeks.consumed.unshift(c);
  }

  // In your design: per system, from yesterday's group results (or the average year).
  const stepped = state.ledgers.length > 0;
  const bal = stepped ? null : designBalance(state, catalog);
  const prodMap = new Map<string, DesignProducer>();
  const useMap = new Map<string, DesignConsumer>();
  for (const inst of state.instances) {
    if (inst.status !== 'active') continue;
    const p = plans.bySystem.get(inst.systemId)!;
    const outs = p.outputs.filter((o) => o.resource === resource);
    const ins = p.inputs.filter((i) => i.resource === resource);
    if (!outs.length && !ins.length) continue;
    const sys = getSystem(catalog, inst.systemId);
    const sp = spatial.get(inst.id);
    const day = sp ? state.lastDay[groupKeyOf(inst, sp)] : undefined;
    const scale = inst.scale ?? 1;
    if (outs.length) {
      const nominal = outs.reduce((a, o) => a + (o.isCapacity ? o.qty : o.weekly), 0) * scale;
      const isCap = outs.some((o) => o.isCapacity);
      const actual = day
        ? (day.outputs[resource] ?? 0) * (isCap ? 1 : 7) * scale
        : nominal * (bal!.systems[inst.systemId]?.satisfaction ?? 1);
      const potential = day ? (day.potential[resource] ?? nominal / scale) * (isCap ? 1 : 7) * scale : nominal;
      const e = prodMap.get(sys.id) ?? {
        systemId: sys.id,
        name: sys.name,
        count: 0,
        actualWeek: 0,
        potentialWeek: 0,
        headroomWeek: 0,
        limitedBy: null,
      };
      e.count += scale;
      e.actualWeek += actual;
      e.potentialWeek += potential;
      e.headroomWeek = Math.max(0, e.potentialWeek - e.actualWeek);
      e.limitedBy = day ? day.limitedBy : (bal!.systems[inst.systemId]?.limitedBy ?? null);
      prodMap.set(sys.id, e);
    }
    if (ins.length) {
      const nominal = ins.reduce((a, i) => a + (i.isCapacity ? i.qty : i.weekly), 0) * scale;
      const rec = day?.inputs[resource];
      const e = useMap.get(sys.id) ?? { systemId: sys.id, name: sys.name, count: 0, requestedWeek: 0, receivedWeek: 0 };
      e.count += scale;
      e.requestedWeek += rec ? rec.requested * 7 * scale : nominal;
      e.receivedWeek += rec ? rec.received * 7 * scale : nominal * (bal?.systems[inst.systemId]?.satisfaction ?? 1);
      useMap.set(sys.id, e);
    }
  }

  const catalogUsers = [
    ...new Set(catalog.flows.filter((f) => f.direction === 'in' && f.resource === resource).map((f) => f.systemId)),
  ].map((id) => ({ systemId: id, name: getSystem(catalog, id).name }));

  let storage: ResourcePage['storage'] = null;
  if (r.storedIn) {
    let cap = 0;
    for (const inst of state.instances) {
      if (inst.status !== 'active') continue;
      for (const o of plans.bySystem.get(inst.systemId)!.outputs)
        if (o.resource === r.storedIn.capacityResource && o.isCapacity) cap += o.qty * (inst.scale ?? 1);
    }
    storage = { pool: r.storedIn.capacityResource, room: (cap + r.storedIn.buffer) * r.storedIn.unitsPerCapacityUnit };
  }

  const disposal =
    r.class !== 'Flow'
      ? r.class === 'Capacity'
        ? 'A capacity: it is room, not a stock, so nothing is used up.'
        : r.class === 'Ambient'
          ? 'Supplied by the site; whatever nobody uses is simply not used.'
          : 'Money.'
      : !r.storable
        ? 'It cannot be kept: whatever is not used the day after it is made is lost.'
        : r.storedIn
          ? `Kept in ${r.storedIn.capacityResource}; anything beyond the room there spills.`
          : 'It piles up in stock until something uses it.';

  return {
    resource,
    unit: r.unit,
    cls: r.class,
    note: r.note,
    needsRow: r.needsRow ?? null,
    stock: r.class === 'Flow' ? explained(state.stocks[resource] ?? 0, `${resource} in stock now`) : null,
    storage,
    spoilPerWeek: r.spoilPerWeek,
    weeks,
    inDesign: [...prodMap.values()].sort((a, b) => b.actualWeek - a.actualWeek),
    onLand: [...nodes].sort((a, b) => a.distanceFt - b.distanceFt),
    couldBuild: buildOptions(state, catalog, resource).slice(0, 8),
    buy: r.marketAvailable && r.marketPrice !== null ? { price: r.marketPrice, unit: r.unit } : null,
    usedBy: [...useMap.values()].sort((a, b) => b.requestedWeek - a.requestedWeek),
    catalogUsers,
    disposal,
  };
}

/** One step of a supply chain: a resource, whether the design has enough, and ways to get it. */
export interface ChainNode {
  resource: string;
  /** The design already supplies it fully (in an average year). */
  satisfied: boolean;
  /** Share of requests met (average year). */
  met: number;
  buy: number | null;
  /** Up to three cheapest producers, each with its own inputs expanded (to `depth`). */
  options: { systemId: string; name: string; cost: number; mode: 'buy' | 'diy'; inDesign: boolean; inputs: ChainNode[] }[];
}

/**
 * A system's supply chain (G13): its inputs, the producers of each, and their inputs, `depth`
 * levels deep. Branches the design already satisfies are marked so the UI can collapse them.
 */
export function supplyChain(state: GameState, catalog: Catalog, systemId: string, depth = 3): ChainNode[] {
  const plans = getPlans(catalog, state.site);
  const bal = designBalance(state, catalog);
  const placed = new Set(state.instances.map((i) => i.systemId));
  const have = haveSupply(state, catalog);
  const metShare = (resource: string): number => {
    const meta = indexCatalog(catalog).resourceByName.get(resource)!;
    if (meta.class === 'Ambient') return have.has(resource) ? 1 : 0;
    const consumed = bal.resources[resource]?.consumed.value ?? 0;
    const produced = bal.resources[resource]?.produced.value ?? 0;
    if (consumed <= 0) return have.has(resource) ? 1 : 0;
    return Math.min(1, produced / consumed);
  };
  const expand = (sysId: string, level: number, seen: Set<string>): ChainNode[] => {
    const p = plans.bySystem.get(sysId)!;
    return p.inputs
      .filter((i) => (i.role === 'required' || i.role === 'ambient' || i.role === 'capacity') && i.resource !== 'Labor' && i.resource !== 'Capital')
      .map((i) => {
        const met = metShare(i.resource);
        const meta = indexCatalog(catalog).resourceByName.get(i.resource)!;
        const opts =
          level >= depth || seen.has(i.resource)
            ? []
            : buildOptions(state, catalog, i.resource, have)
                .filter((o) => !o.conventional)
                .slice(0, 3)
                .map((o) => ({
                  systemId: o.systemId,
                  name: o.name,
                  cost: o.cost,
                  mode: o.mode,
                  inDesign: placed.has(o.systemId),
                  inputs: expand(o.systemId, level + 1, new Set([...seen, i.resource])),
                }));
        return {
          resource: i.resource,
          satisfied: met >= 0.999,
          met,
          buy: meta.marketAvailable && meta.marketPrice !== null ? meta.marketPrice : null,
          options: opts,
        };
      });
  };
  return expand(systemId, 1, new Set());
}

/** Natural nodes on the land that yield a resource (G14 fills this in from the site). */
export function nodeOptions(_state: GameState, _resource: string): NodeOption[] {
  return [];
}

/** Cost and setup labor of a build plan (G13), each with its terms. */
export function planTotals(
  catalog: Catalog,
  items: readonly { systemId: string; mode: 'buy' | 'diy' | 'prebuilt' }[],
): { cost: Explained; hours: Explained } {
  const refs: Record<string, number> = {};
  let cost = 0;
  let hours = 0;
  for (const it of items) {
    const c = costFor(catalog, it.systemId, it.mode);
    cost += c;
    hours += setupHoursFor(catalog, it.systemId, it.mode);
    const name = getSystem(catalog, it.systemId).name;
    refs[name] = (refs[name] ?? 0) + c;
  }
  return {
    cost: explained(cost, 'Σ cost of each planned system (DIY where cheaper)', { refs }),
    hours: explained(hours, 'Σ setup hours of each planned system', { refs: { systems: items.length } }),
  };
}
