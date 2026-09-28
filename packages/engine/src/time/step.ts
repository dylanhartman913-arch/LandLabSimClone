import { NEED_KEYS, type Catalog, type NeedKey, type Resource } from '@homestead/catalog';
import { indexCatalog } from '../catalog-index.ts';
import { climateTable, type ClimateTable, type DayWeather } from './climate.ts';
import {
  COLD_STORAGE_SPOIL_CUT,
  EPS,
  HARDSHIP_DAYS,
  HARDSHIP_REPEAT_DAYS,
  HARDSHIP_THRESHOLD,
  HEALTH_FLOOR,
  HEALTH_WEIGHTS,
  LEDGER_DAYS_KEPT,
  PERSON_NEEDS,
  ROLLING_DAYS,
  type PersonNeed,
} from './constants.ts';
import { dailyAmount, getPlans, type FlowPlan, type Plans, type SystemPlan } from './plans.ts';
import { weatherFor } from './weather.ts';
import type {
  DayLedger,
  GameEvent,
  GameState,
  Instance,
  InstanceInputRecord,
  NeedDay,
  ResourceDay,
} from './types.ts';

export interface StepResult {
  state: GameState;
  events: GameEvent[];
  ledger: DayLedger;
}

/**
 * Active instances of one system at one priority. They make identical requests
 * and receive identical shares, so the day is computed once per group; only
 * maturity (plants) and health (people) differ per instance.
 */
interface Group {
  plan: SystemPlan;
  key: string;
  tier: number;
  members: number[]; // indices into instances
  n: number;
  sat: number;
  limitedBy: string | null;
  boostMult: number;
  inputs: Record<string, InstanceInputRecord>; // per instance
}

interface Request {
  group: Group;
  plan: FlowPlan;
  /** Total for the group (per-instance amount × n). */
  amount: number;
  grant: number;
}

interface SideInput {
  g: Group;
  plan: FlowPlan;
  amount: number;
}

/** Everything one day's phases share. Created and mutated only inside stepDay. */
interface Day {
  prev: GameState;
  meta: Map<string, Resource>;
  plans: Plans;
  table: ClimateTable;
  day: number;
  absDay: number;
  unlimited: boolean;
  weather: DayWeather;
  events: GameEvent[];
  stocks: Record<string, number>;
  direct: Record<string, number>;
  instances: Instance[];
  cash: number;
  ambient: Record<string, boolean>;
  groups: Group[];
  res: Record<string, ResourceDay>;
  needs: Record<NeedKey, NeedDay>;
  pool: number;
  constructionUsed: number;
  laborForUpkeep: number;
  completed: number[];
  byResource: Map<string, Request[]>;
  ordered: [string, Request[]][];
  capReq: Map<string, number>;
  boostReq: Map<string, number>;
  capInputs: SideInput[];
  boostInputs: SideInput[];
  capAvail: Map<string, number>;
  capSat: Map<string, number>;
  boostSat: Map<string, number>;
  laborUsed: number;
  upkeepRequested: number;
  capitalUsed: number;
  produced: Record<string, number>;
  services: Record<string, number>;
  lastDay: GameState['lastDay'];
  cashIn: number;
  healthSum: number;
  people: number;
  spoiledToday: Record<string, number>;
}

const newResourceDay = (start: number): ResourceDay => ({
  start,
  produced: 0,
  consumed: 0,
  spilled: 0,
  spoiled: 0,
  requested: 0,
  unmet: 0,
  imported: 0,
  supplied: 0,
});

/** Output share for a maturing plant: linear from planting to `yearsToFullOutput`. */
export function maturity(inst: Instance, p: SystemPlan, absDay: number): number {
  const years = p.system.yearsToFullOutput;
  if (years <= 0) return 1;
  const age = inst.activeSince === null ? 0 : absDay - inst.activeSince;
  return Math.max(0, Math.min(1, age / (years * 365)));
}

/** Copy an instance before changing it (instances are shared with the previous state). */
function touch(d: Day, i: number): Instance {
  const copy = { ...d.instances[i]! };
  d.instances[i] = copy;
  return copy;
}

/** Proportional within a tier, tiers in ascending order. */
function allocateByTier(reqs: Request[], available: number): void {
  if (reqs.length === 0) return;
  let avail = Math.max(0, available);
  let tiers: number[] | null = null;
  const t0 = reqs[0]!.group.tier;
  for (const r of reqs) {
    if (r.group.tier !== t0) {
      tiers = [...new Set(reqs.map((q) => q.group.tier))].sort((a, b) => a - b);
      break;
    }
  }
  for (const t of tiers ?? [t0]) {
    let total = 0;
    for (const r of reqs) if (r.group.tier === t) total += r.amount;
    if (total <= 0) continue;
    const share = total <= avail ? 1 : avail / total;
    for (const r of reqs) if (r.group.tier === t) r.grant = r.amount * share;
    avail = Math.max(0, avail - total * share);
  }
}

// --- Phases ------------------------------------------------------------------

/** Group active instances by system and priority; note ambient resources they supply. */
function groupInstances(d: Day): void {
  const byKey = new Map<string, Map<number, Group>>();
  for (let i = 0; i < d.instances.length; i++) {
    const inst = d.instances[i]!;
    if (inst.status !== 'active') continue;
    let byTier = byKey.get(inst.systemId);
    if (!byTier) byKey.set(inst.systemId, (byTier = new Map()));
    let g = byTier.get(inst.priority);
    if (!g) {
      g = {
        plan: d.plans.bySystem.get(inst.systemId)!,
        key: `${inst.systemId}|${inst.priority}`,
        tier: inst.priority,
        members: [],
        n: 0,
        sat: 1,
        limitedBy: null,
        boostMult: 1,
        inputs: {},
      };
      byTier.set(inst.priority, g);
      d.groups.push(g);
    }
    g.members.push(i);
    g.n++;
  }
  for (const g of d.groups)
    for (const o of g.plan.outputs) if (o.cls === 'Ambient') d.ambient[o.resource] = true;
}

/** Step 2: newly placed instances draw one-time materials; shortfalls are brought in. */
function startConstruction(d: Day): void {
  for (let i = 0; i < d.instances.length; i++) {
    if (d.instances[i]!.status !== 'building' || d.instances[i]!.materialsDrawn) continue;
    const inst = touch(d, i);
    for (const m of d.plans.bySystem.get(inst.systemId)!.materials) {
      const need = m.qty;
      const have = d.stocks[m.resource] ?? 0;
      const take = Math.min(have, need);
      const led = d.res[m.resource]!;
      if (take > 0) {
        d.stocks[m.resource] = have - take;
        led.consumed += take;
      }
      led.requested += need;
      if (need - take > EPS) {
        led.imported += need - take;
        d.events.push({
          kind: 'imported',
          absDay: d.absDay,
          instanceId: inst.id,
          resource: m.resource,
          amount: need - take,
        });
      }
    }
    inst.materialsDrawn = true;
  }
}

/** Step 4: the labor pool, with construction served first up to its share. */
function laborPool(d: Day): void {
  let pool = 0;
  for (const g of d.groups) {
    if (!g.plan.isHuman) continue;
    for (const i of g.members) pool += (g.plan.laborWeekly / 7) * (d.instances[i]!.person?.health ?? 1);
  }
  d.pool = pool;
  d.res['Labor']!.produced = pool;
  let cap = pool * d.prev.settings.constructionShare;
  let used = 0;
  for (let i = 0; i < d.instances.length; i++) {
    if (d.instances[i]!.status !== 'building') continue;
    const inst = touch(d, i);
    const give = Math.min(Math.max(0, inst.setupHoursNeeded - inst.setupHoursDone), cap);
    inst.setupHoursDone += give;
    cap -= give;
    used += give;
    if (inst.setupHoursNeeded - inst.setupHoursDone <= EPS) d.completed.push(i);
  }
  d.constructionUsed = used;
  d.res['Labor']!.consumed += used;
  d.laborForUpkeep = pool - used;
}

/** Step 3: each group's requests for today, and the capacity it provides. */
function buildRequests(d: Day): void {
  for (const g of d.groups) {
    for (const plan of g.plan.inputs) {
      const amount = dailyAmount(plan, d.day, d.weather, d.table) * g.n;
      switch (plan.role) {
        case 'capacity':
          d.capReq.set(plan.resource, (d.capReq.get(plan.resource) ?? 0) + amount);
          d.capInputs.push({ g, plan, amount });
          break;
        case 'boost':
          d.boostReq.set(plan.resource, (d.boostReq.get(plan.resource) ?? 0) + amount);
          d.boostInputs.push({ g, plan, amount });
          break;
        case 'ambient':
          if (!d.unlimited && !d.ambient[plan.resource] && g.sat > 0) {
            g.sat = 0;
            g.limitedBy = plan.resource;
          }
          break;
        default: {
          if (amount <= 0) break;
          let list = d.byResource.get(plan.resource);
          if (!list) d.byResource.set(plan.resource, (list = []));
          list.push({ group: g, plan, amount, grant: 0 });
        }
      }
    }
    let mat = -1;
    for (const o of g.plan.outputs) {
      if (o.cls !== 'Capacity') continue;
      if (mat < 0) {
        mat = 0;
        for (const i of g.members) mat += maturity(d.instances[i]!, g.plan, d.absDay);
      }
      d.capAvail.set(o.resource, (d.capAvail.get(o.resource) ?? 0) + o.qty * mat);
    }
  }
}

/**
 * Step 5: allocate each resource by tier. Direct requests go first; requests that can be met
 * by substitutes (Food ← eggs, vegetables…) then draw on what direct requests left.
 */
function allocate(d: Day): void {
  const { meta, stocks, direct } = d;
  const reserved: Record<string, number> = {};
  d.ordered = [...d.byResource.entries()].sort(
    ([a], [b]) => Number(meta.get(a)!.satisfiedBy.length > 0) - Number(meta.get(b)!.satisfiedBy.length > 0),
  );
  for (const [resource, reqs] of d.ordered) {
    const m = meta.get(resource)!;
    let total = 0;
    for (const q of reqs) total += q.amount;
    let available: number;
    if (resource === 'Labor') available = d.laborForUpkeep;
    else if (resource === 'Capital') available = Math.max(0, d.cash);
    else if (m.satisfiedBy.length) {
      const f = m.factorToNeed ?? 1;
      available = 0;
      for (const sub of m.satisfiedBy) {
        const free = Math.max(0, (stocks[sub] ?? 0) - (reserved[sub] ?? 0));
        available += (free * (meta.get(sub)!.factorToNeed ?? 1)) / f;
      }
    } else {
      available = stocks[resource] ?? 0;
      if (m.directUseShare > 0 && direct[resource])
        available += Math.min(direct[resource]!, m.directUseShare * total);
    }
    if (d.unlimited) available = Math.max(available, total);
    allocateByTier(reqs, available);
    let granted = 0;
    for (const q of reqs) granted += q.grant;
    reserved[resource] = (reserved[resource] ?? 0) + granted;
  }
  for (const [r, req] of d.capReq) {
    d.capSat.set(r, d.unlimited || req <= 0 ? 1 : Math.min(1, (d.capAvail.get(r) ?? 0) / req));
  }
  for (const [r, req] of d.boostReq) {
    d.boostSat.set(r, d.unlimited || req <= 0 ? 1 : Math.min(1, (d.prev.services[r] ?? 0) / req));
  }
}

function record(g: Group, r: string, requested: number, received: number): void {
  const cur = g.inputs[r];
  if (cur) {
    cur.requested += requested / g.n;
    cur.received += received / g.n;
  } else g.inputs[r] = { requested: requested / g.n, received: received / g.n };
}

/** Step 6a: Leontief satisfaction over required, capacity, and ambient inputs; boosts. */
function satisfy(d: Day): void {
  for (const reqs of d.byResource.values()) {
    for (const q of reqs) {
      if (q.plan.role !== 'required') continue;
      const r = q.grant / q.amount;
      if (r < q.group.sat) {
        q.group.sat = r;
        q.group.limitedBy = q.plan.resource;
      }
    }
  }
  for (const c of d.capInputs) {
    const s = d.capSat.get(c.plan.resource)!;
    record(c.g, c.plan.resource, c.amount, c.amount * s);
    if (s < c.g.sat) {
      c.g.sat = s;
      c.g.limitedBy = c.plan.resource;
    }
    if (c.plan.needsRow) {
      const n = d.needs[c.plan.needsRow];
      n.needed += c.amount * c.plan.needFactor;
      n.delivered += c.amount * s * c.plan.needFactor;
    }
  }
  for (const b of d.boostInputs) {
    const s = d.boostSat.get(b.plan.resource)!;
    record(b.g, b.plan.resource, b.amount, b.amount * s);
    b.g.boostMult *= 1 - b.plan.boostWeight * (1 - s);
  }
}

/** Step 6b: required inputs use satisfaction × request (the rest stays in stock); needs use their grant. */
function consume(d: Day): void {
  const { meta, stocks, direct, res } = d;
  for (const [resource, reqs] of d.ordered) {
    let totalUse = 0;
    let requested = 0;
    let granted = 0;
    for (const q of reqs) {
      const use = q.plan.role === 'required' ? Math.min(q.grant, q.group.sat * q.amount) : q.grant;
      totalUse += use;
      requested += q.amount;
      granted += q.grant;
      record(q.group, resource, q.amount, use);
      if (q.plan.needsRow) {
        const n = d.needs[q.plan.needsRow];
        n.needed += q.amount * q.plan.needFactor;
        n.delivered += q.grant * q.plan.needFactor;
      }
    }
    const led = res[resource];
    if (led) {
      led.requested += requested;
      led.unmet += Math.max(0, requested - granted);
    }
    if (resource === 'Labor') {
      d.laborUsed += totalUse;
      d.upkeepRequested += requested;
      led!.consumed += totalUse;
      continue;
    }
    if (resource === 'Capital') {
      d.capitalUsed += totalUse;
      d.cash -= totalUse;
      continue;
    }
    const m = meta.get(resource)!;
    if (d.unlimited) supplyShortfall(resource, m, totalUse, stocks, res, meta);
    if (m.satisfiedBy.length) {
      // Draw converted amounts from substitute stocks, most perishable first.
      let left = totalUse * (m.factorToNeed ?? 1); // in need units
      for (const sub of m.satisfiedBy) {
        if (left <= EPS) break;
        const sf = meta.get(sub)!.factorToNeed ?? 1;
        const have = stocks[sub] ?? 0;
        const take = Math.min(have, left / sf);
        if (take <= 0) continue;
        stocks[sub] = have - take;
        res[sub]!.consumed += take;
        left -= take * sf;
      }
    } else {
      let fromStock = totalUse;
      if (m.directUseShare > 0 && direct[resource]) {
        const fromDirect = Math.min(direct[resource]!, m.directUseShare * requested, totalUse);
        direct[resource] = direct[resource]! - fromDirect;
        fromStock -= fromDirect;
      }
      const after = (stocks[resource] ?? 0) - fromStock;
      stocks[resource] = after < 0 && after > -EPS ? 0 : after;
      led!.consumed += totalUse;
    }
  }
}

/** Step 6c: outputs = nominal × satisfaction × boosts × maturity (people: × health). */
function produce(d: Day): void {
  const harvest = new Map<string, { systemId: string; resource: string; ids: string[] }>();
  for (const g of d.groups) {
    const p = g.plan;
    const base: number[] = [];
    for (const o of p.outputs) {
      base.push(
        p.isHuman && o.resource === 'Labor' ? p.laborWeekly / 7 : dailyAmount(o, d.day, d.weather, d.table),
      );
    }
    let multSum = 0;
    for (const i of g.members) {
      const inst = d.instances[i]!;
      multSum += p.isHuman ? (inst.person?.health ?? 1) : g.sat * g.boostMult * maturity(inst, p, d.absDay);
    }
    const perUnit: Record<string, number> = {};
    const unitMult = p.isHuman ? 1 : g.sat * g.boostMult;
    for (let k = 0; k < p.outputs.length; k++) {
      const o = p.outputs[k]!;
      perUnit[o.resource] = (perUnit[o.resource] ?? 0) + base[k]! * unitMult;
      if (p.isHuman && o.resource === 'Labor') continue; // counted in the pool
      const amount = base[k]! * multSum;
      if (o.needsRow) d.needs[o.needsRow].provided += amount * o.needFactor;
      if (o.cls === 'Money') d.cashIn += amount;
      else if (o.cls === 'Flow') d.produced[o.resource] = (d.produced[o.resource] ?? 0) + amount;
      else if (o.cls === 'Service') d.services[o.resource] = (d.services[o.resource] ?? 0) + amount;
      if (o.shape === 'window' && d.day === o.window!.first && amount > 0) {
        const key = `${p.system.id}|${o.resource}`;
        const h = harvest.get(key) ?? { systemId: p.system.id, resource: o.resource, ids: [] };
        for (const i of g.members) h.ids.push(d.instances[i]!.id);
        harvest.set(key, h);
      }
    }
    d.lastDay[g.key] = {
      sat: p.isHuman ? 1 : g.sat,
      limitedBy: p.isHuman ? null : g.limitedBy,
      boostMult: g.boostMult,
      inputs: g.inputs,
      outputs: perUnit,
    };
  }
  d.needs['Est. Required Labor'].provided = d.pool;
  for (const h of harvest.values()) {
    d.events.push({
      kind: 'harvest',
      absDay: d.absDay,
      systemId: h.systemId,
      resource: h.resource,
      instanceIds: h.ids,
    });
  }
}

/** Step 7: people's 7-day needs, health, and hardship. */
function updatePeople(d: Day): void {
  const heatNeed = d.needs['Heated shelter'];
  const heatFrac = heatNeed.needed > EPS ? Math.min(1, heatNeed.delivered / heatNeed.needed) : 1;
  for (const g of d.groups) {
    if (!g.plan.isHuman) continue;
    const frac = (r: string) => {
      const x = g.inputs[r];
      return x && x.requested > EPS ? Math.min(1, x.received / x.requested) : 1;
    };
    const today: Record<PersonNeed, number> = {
      food: frac('Food'),
      drinkingWater: frac('Drinking water'),
      heat: heatFrac,
      shelter: frac('Shelter'),
    };
    for (const i of g.members) {
      const old = d.instances[i]!.person;
      if (!old) continue;
      const inst = touch(d, i);
      const person = { ...old, recent: { ...old.recent }, lowStreak: { ...old.lowStreak } };
      let penalty = 0;
      for (const k of PERSON_NEEDS) {
        const list =
          person.recent[k].length >= ROLLING_DAYS ? person.recent[k].slice(1) : person.recent[k].slice();
        list.push(today[k]);
        person.recent[k] = list;
        let sum = 0;
        for (let j = 0; j < list.length; j++) sum += list[j]!;
        penalty += HEALTH_WEIGHTS[k] * (1 - sum / list.length);
        const streak = today[k] < HARDSHIP_THRESHOLD ? person.lowStreak[k] + 1 : 0;
        person.lowStreak[k] = streak;
        if (streak >= HARDSHIP_DAYS && (streak - HARDSHIP_DAYS) % HARDSHIP_REPEAT_DAYS === 0) {
          d.events.push({
            kind: 'hardship',
            absDay: d.absDay,
            instanceId: inst.id,
            need: k,
            level: today[k],
          });
        }
      }
      const before = person.health;
      person.health = Math.max(HEALTH_FLOOR, 1 - penalty);
      if (person.health < before && Math.floor(before * 10) !== Math.floor(person.health * 10)) {
        d.events.push({ kind: 'health', absDay: d.absDay, instanceId: inst.id, health: person.health });
      }
      inst.person = person;
      d.healthSum += person.health;
      d.people++;
    }
  }
}

/** Step 8: unstorable leftovers are lost, production lands, pools overflow, food spoils. */
function storeAndSpoil(d: Day): void {
  const { meta, stocks, direct, res, plans } = d;
  for (const r of plans.flowResources) {
    const m = meta.get(r)!;
    const led = res[r]!;
    const p = d.produced[r] ?? 0;
    if (r === 'Labor') {
      led.spilled = Math.max(0, d.laborForUpkeep - d.laborUsed); // unused hours; labor never stocks
      stocks[r] = 0;
      continue;
    }
    const left = stocks[r] ?? 0;
    led.produced += p;
    if (!m.storable) {
      led.spilled += Math.max(0, left);
      stocks[r] = p;
    } else if (m.directUseShare > 0) {
      // Unused direct supply from yesterday is lost; a share of today's output is direct tomorrow.
      led.spilled += direct[r] ?? 0;
      direct[r] = m.directUseShare * p;
      stocks[r] = left + (1 - m.directUseShare) * p;
    } else stocks[r] = left + p;
  }
  if (!d.unlimited) {
    for (const [capRes, members] of plans.pools) {
      const cap = (d.capAvail.get(capRes) ?? 0) + (plans.poolBuffer.get(capRes) ?? 0);
      let volume = 0;
      for (const m of members) volume += (stocks[m.resource] ?? 0) / m.unitsPer;
      if (volume > cap + EPS) {
        const f = (volume - cap) / volume;
        for (const m of members) {
          const spill = (stocks[m.resource] ?? 0) * f;
          stocks[m.resource] = (stocks[m.resource] ?? 0) - spill;
          res[m.resource]!.spilled += spill;
        }
      }
    }
  }
  // Food in real cold/dry storage spoils 80% slower.
  const foodMembers = plans.pools.get('Food storage') ?? [];
  let foodVolume = 0;
  for (const m of foodMembers) foodVolume += (stocks[m.resource] ?? 0) / m.unitsPer;
  const coldShare = foodVolume > EPS ? Math.min(1, (d.capAvail.get('Food storage') ?? 0) / foodVolume) : 0;
  for (const r of plans.perishable) {
    const stock = stocks[r] ?? 0;
    if (stock <= 0) continue;
    const m = meta.get(r)!;
    const cut = m.storedIn?.capacityResource === 'Food storage' ? COLD_STORAGE_SPOIL_CUT * coldShare : 0;
    const loss = stock * (m.spoilPerWeek / 7) * (1 - cut);
    stocks[r] = stock - loss;
    res[r]!.spoiled += loss;
    d.spoiledToday[r] = loss;
  }
}

/** Construction that finished today is active from tomorrow. */
function finishConstruction(d: Day): void {
  for (const i of d.completed) {
    const inst = d.instances[i]!; // already copied by laborPool
    inst.status = 'active';
    inst.activeSince = d.absDay + 1;
    d.events.push({ kind: 'built', absDay: d.absDay, instanceId: inst.id, systemId: inst.systemId });
  }
}

/**
 * Step 10: shortage, spill, and spoilage events. A shortage event fires on the first short
 * day, and again whenever it starts curtailing another system (a new garden going thirsty is
 * news even if water was already short).
 */
function emitEvents(d: Day): GameState['flags'] {
  const short: Record<string, string[]> = {};
  for (const [r, reqs] of d.byResource) {
    let requested = 0;
    let granted = 0;
    for (const q of reqs) {
      requested += q.amount;
      granted += q.grant;
    }
    if (!(requested > EPS && granted < requested * (1 - 1e-6))) continue;
    const systems: string[] = [];
    for (const g of d.groups)
      if (g.limitedBy === r && !systems.includes(g.plan.system.id)) systems.push(g.plan.system.id);
    short[r] = systems;
    const before = d.prev.flags.short[r];
    if (!before || systems.some((id) => !before.includes(id))) {
      const curtailed: string[] = [];
      for (const g of d.groups)
        if (g.limitedBy === r) for (const i of g.members) curtailed.push(d.instances[i]!.id);
      d.events.push({
        kind: 'shortage',
        absDay: d.absDay,
        resource: r,
        unmet: requested - granted,
        requested,
        curtailed,
      });
    }
  }
  for (const r of Object.keys(d.prev.flags.short)) {
    if (!short[r]) d.events.push({ kind: 'shortage-ended', absDay: d.absDay, resource: r });
  }
  const elecSpill = d.res['Electricity']?.spilled ?? 0;
  const spilling = elecSpill > EPS;
  if (spilling && !d.prev.flags.spilling) {
    d.events.push({ kind: 'spill', absDay: d.absDay, resource: 'Electricity', amount: elecSpill });
  }
  if (d.day % 7 === 6) {
    const week: Record<string, number> = { ...d.spoiledToday };
    for (const l of d.prev.ledgers.slice(-6)) {
      for (const r of d.plans.perishable) {
        const v = l.resources[r]?.spoiled ?? 0;
        if (v > 0) week[r] = (week[r] ?? 0) + v;
      }
    }
    if (Object.values(week).some((v) => v > EPS))
      d.events.push({ kind: 'spoilage', absDay: d.absDay, byResource: week });
  }
  return { short, spilling };
}

function buildLedger(d: Day): DayLedger {
  // Only groups running below full satisfaction are listed (keeps ledgers small).
  const curtailed: DayLedger['curtailed'] = [];
  for (const g of d.groups) {
    if (g.plan.isHuman || g.sat >= 1 - 1e-9) continue;
    curtailed.push({ systemId: g.plan.system.id, count: g.n, sat: g.sat, limitedBy: g.limitedBy });
  }
  const { prev } = d;
  return {
    absDay: d.absDay,
    day: d.day,
    year: prev.calendar.year,
    resources: d.res,
    needs: d.needs,
    cash: {
      start: prev.cash + prev.pendingCash.purchases - prev.pendingCash.refunds,
      in: d.cashIn,
      out: d.capitalUsed,
      purchases: prev.pendingCash.purchases,
      refunds: prev.pendingCash.refunds,
      end: d.cash,
    },
    labor: {
      pool: d.pool,
      construction: d.constructionUsed,
      upkeepRequested: d.upkeepRequested,
      upkeepDelivered: d.laborUsed,
      unused: Math.max(0, d.laborForUpkeep - d.laborUsed),
    },
    curtailed,
    weather: d.weather,
    health: d.people ? d.healthSum / d.people : 1,
  };
}

/**
 * Advance one day. Pure: returns a new state, the day's events, and its ledger.
 * The step order is documented in docs/ENGINE.md (Daily step).
 */
export function stepDay(prev: GameState, catalog: Catalog): StepResult {
  const plans = getPlans(catalog, prev.site);
  const table = climateTable(prev.site);
  const { day, year, absDay } = prev.calendar;
  // Step 1: weather and ambient resources.
  const [weather, rng] = weatherFor(prev.site, table, day, prev.settings.weatherMode, prev.rng);
  const res: Record<string, ResourceDay> = {};
  for (const r of plans.flowResources) res[r] = newResourceDay((prev.stocks[r] ?? 0) + (prev.direct[r] ?? 0));
  const needs = {} as Record<NeedKey, NeedDay>;
  for (const k of NEED_KEYS) needs[k] = { provided: 0, needed: 0, delivered: 0 };

  const d: Day = {
    prev,
    meta: indexCatalog(catalog).resourceByName,
    plans,
    table,
    day,
    absDay,
    unlimited: prev.settings.unlimitedSupply === true,
    weather,
    events: [],
    stocks: { ...prev.stocks },
    direct: { ...prev.direct },
    instances: prev.instances.slice(), // copied per instance only when one changes
    cash: prev.cash,
    ambient: { ...prev.site.ambient },
    groups: [],
    res,
    needs,
    pool: 0,
    constructionUsed: 0,
    laborForUpkeep: 0,
    completed: [],
    byResource: new Map(),
    ordered: [],
    capReq: new Map(),
    boostReq: new Map(),
    capInputs: [],
    boostInputs: [],
    capAvail: new Map(),
    capSat: new Map(),
    boostSat: new Map(),
    laborUsed: 0,
    upkeepRequested: 0,
    capitalUsed: 0,
    produced: {},
    services: {},
    lastDay: {},
    cashIn: 0,
    healthSum: 0,
    people: 0,
    spoiledToday: {},
  };

  groupInstances(d);
  startConstruction(d); // 2
  laborPool(d); // 4 (people work before anything else runs)
  buildRequests(d); // 3
  allocate(d); // 5
  satisfy(d); // 6
  consume(d);
  produce(d);
  updatePeople(d); // 7
  storeAndSpoil(d); // 8
  d.cash += d.cashIn; // 9
  finishConstruction(d);
  const flags = emitEvents(d); // 10
  const ledger = buildLedger(d);

  const ledgers = prev.ledgers.length >= LEDGER_DAYS_KEPT ? prev.ledgers.slice(1) : prev.ledgers.slice();
  ledgers.push(ledger);
  const nextDay = day + 1;
  const state: GameState = {
    ...prev,
    rng,
    calendar:
      nextDay >= 365
        ? { day: 0, year: year + 1, absDay: absDay + 1 }
        : { day: nextDay, year, absDay: absDay + 1 },
    cash: d.cash,
    stocks: d.stocks,
    direct: d.direct,
    services: d.services,
    lastDay: d.lastDay,
    instances: d.instances,
    weather,
    ledgers,
    pendingCash: { purchases: 0, refunds: 0 },
    flags,
  };
  return { state, events: d.events, ledger };
}

/** Validation mode: top up a stock so a request can be met in full, recorded as `supplied`. */
function supplyShortfall(
  resource: string,
  m: Resource,
  totalUse: number,
  stocks: Record<string, number>,
  res: Record<string, ResourceDay>,
  meta: Map<string, Resource>,
) {
  const subs = m.satisfiedBy.length ? m.satisfiedBy : [resource];
  const target = subs[subs.length - 1]!;
  let have = 0; // in need units
  for (const sub of subs) have += (stocks[sub] ?? 0) * (meta.get(sub)!.factorToNeed ?? 1);
  const short = totalUse * (m.factorToNeed ?? 1) - have;
  if (short <= 0) return;
  const add = short / (meta.get(target)!.factorToNeed ?? 1);
  stocks[target] = (stocks[target] ?? 0) + add;
  res[target]!.supplied += add;
}

export function stepDays(
  state: GameState,
  catalog: Catalog,
  n: number,
): { state: GameState; events: GameEvent[]; ledgers: DayLedger[] } {
  let s = state;
  const events: GameEvent[] = [];
  const ledgers: DayLedger[] = [];
  for (let i = 0; i < n; i++) {
    const r = stepDay(s, catalog);
    s = r.state;
    for (const e of r.events) events.push(e);
    ledgers.push(r.ledger);
  }
  return { state: s, events, ledgers };
}

export type { DayWeather };
