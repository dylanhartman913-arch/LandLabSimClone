import { NEED_KEYS, type Catalog, type NeedKey, type Resource } from '@homestead/catalog';
import { indexCatalog } from '../catalog-index.ts';
import { climateTable, type ClimateTable, type DayWeather } from './climate.ts';
import {
  COLD_STORAGE_SPOIL_CUT,
  EPS,
  LEDGER_DAYS_KEPT,
} from './constants.ts';
import { BACKSTOP_CAP_MULT, dailyAmount, getPlans, type FlowPlan, type Plans, type SystemPlan } from './plans.ts';
import { drawYearWeather, weatherFor, type YearWeather } from './weather.ts';
import {
  BOIL_GAL_PER_FUEL_HOUR,
  BOIL_LABOR_PER_GAL,
  homeOf,
  inSeason,
  jobCap,
  jobHours,
  jobPriority,
  JOBS,
  NODE_JOB,
  nodePosition,
  nodeStockOf,
  nodeYield,
  regrowNodes,
  walkPerTrip,
  type JobId,
} from './gather.ts';
import { computeSpatial, groupKeyOf, type InstanceSpatial } from './spatial.ts';
import { advanceTutorial } from '../tutorial.ts';
import {
  COOL_CDD_MIN,
  HEAT_HDD_MIN,
  WB_AWAY_MIN_DAYS,
  WB_RETURN_AT,
  laborShare,
  updateWellbeing,
  type PersonDay,
  type PersonUpdate,
} from './wellbeing.ts';
import type {
  DayLedger,
  GameEvent,
  GameState,
  Instance,
  InstanceInputRecord,
  DaySpend,
  GatherRecord,
  NeedDay,
  PersonState,
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
  /** Σ scale of the members (a child counts 0.6). Amounts scale with this, not with n. */
  w: number;
  spatial: InstanceSpatial;
  sat: number;
  limitedBy: string | null;
  boostMult: number;
  inputs: Record<string, InstanceInputRecord>; // per instance
  /** Backstops only: what it delivered today, by resource (group total). */
  dispatched?: Record<string, number>;
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
  assignedInputs: (SideInput & { share: number })[];
  capAvail: Map<string, number>;
  capSat: Map<string, number>;
  boostSat: Map<string, number>;
  laborUsed: number;
  laborBySystem: Record<string, number>;
  upkeepRequested: number;
  capitalUsed: number;
  produced: Record<string, number>;
  bought: Record<string, number>;
  services: Record<string, number>;
  lastDay: GameState['lastDay'];
  cashIn: number;
  healthSum: number;
  wellbeingSum: number;
  people: number;
  spoiledToday: Record<string, number>;
  spend: DaySpend;
  market: GameState['market'];
  broke: boolean;
  /** Hours by job (G14) and what was gathered. */
  byJob: Partial<Record<JobId, number>>;
  gatherUsed: number;
  gathered: GatherRecord[];
  boiled: { gal: number; fuelHours: number; laborHours: number } | null;
  nodeStock: Record<string, number> | undefined;
  /** Systems that provide Shelter (where the household lives). */
  shelterIds: ReadonlySet<string>;
  /** Seed held back from meals today (G16). */
  seed: Record<string, number>;
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
  potential: 0,
  undelivered: 0,
  purchased: 0,
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
function groupInstances(d: Day, spatial: Map<string, InstanceSpatial>): void {
  const byKey = new Map<string, Group>();
  for (let i = 0; i < d.instances.length; i++) {
    const inst = d.instances[i]!;
    if (inst.status !== 'active' || inst.person?.away) continue;
    const sp = spatial.get(inst.id)!;
    const key = groupKeyOf(inst, sp);
    let g = byKey.get(key);
    if (!g) {
      g = {
        plan: d.plans.bySystem.get(inst.systemId)!,
        key,
        tier: inst.priority,
        members: [],
        n: 0,
        w: 0,
        spatial: sp,
        sat: 1,
        limitedBy: null,
        boostMult: 1,
        inputs: {},
      };
      byKey.set(key, g);
      d.groups.push(g);
    }
    g.members.push(i);
    g.n++;
    g.w += inst.scale ?? 1;
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

/** Planned gathering for one job today (G14 auto-gather rules). */
interface GatherPlan {
  /** Units wanted, by resource. */
  want: Record<string, number>;
  /** Gallons to boil into drinking water (water job, no filter). */
  boil: number;
  /** Hours the plan needs, walking and boiling included. */
  hours: number;
}

/** Nodes of a job that can give `resource` today, nearest to home first. */
function nodesFor(d: Day, job: JobId, resource: string) {
  const home = homeOf(d.prev, d.shelterIds);
  return d.prev.site.nodes
    .filter((n) => NODE_JOB[n.type] === job && inSeason(n, d.day) && (n.resource === resource || n.extra.some((e) => e.resource === resource)))
    .map((n) => {
      const p = nodePosition(d.prev, n);
      const dist = Math.hypot(p.x - home.x, p.y - home.y);
      const rate = n.resource === resource ? nodeYield(n, d.prev.yearWeather, d.prev.settings.weatherMode) : n.extra.find((e) => e.resource === resource)!.perHour;
      const walk = walkPerTrip(dist);
      return { n, dist, rate, walk, eff: rate / (1 + walk) };
    })
    .sort((a, b) => a.dist - b.dist || a.n.id.localeCompare(b.n.id));
}

function stockAt(d: Day, id: string): number {
  const n = d.prev.site.nodes.find((x) => x.id === id)!;
  const tracked = d.nodeStock?.[id];
  return tracked !== undefined ? tracked : nodeStockOf(d.prev, n);
}

/** Hours to gather `amount` of a resource for a job, nearest nodes first (Infinity hours: not enough there). */
function hoursFor(d: Day, job: JobId, resource: string, amount: number): number {
  let left = amount;
  let hours = 0;
  for (const x of nodesFor(d, job, resource)) {
    if (left <= EPS) break;
    const primary = x.n.resource === resource;
    const avail = primary ? stockAt(d, x.n.id) : (stockAt(d, x.n.id) / x.n.yieldPerHour) * x.rate;
    const take = Math.min(left, avail);
    if (take <= EPS) continue;
    hours += take / x.eff;
    left -= take;
  }
  return hours;
}

/** An auto-gather rule tops up at most this many days of use per day, so it never monopolizes labor. */
const RESTOCK_DAYS = 2;
/** …and each auto-gather job takes at most this share of the day's labor. */
export const MAX_GATHER_SHARE = 0.4;

/** Auto-gather rules (G14): what each gathering job should fetch today, and the hours it takes. */
function planGathering(d: Day): Map<JobId, GatherPlan> {
  const out = new Map<JobId, GatherPlan>();
  const ag = d.prev.settings.autoGather;
  if (!ag || !d.prev.site.nodes.length) return out;
  const req = (r: string) => (d.byResource.get(r) ?? []).reduce((a, q) => a + q.amount, 0);
  const stock = (r: string) => d.stocks[r] ?? 0;
  if ((ag.waterDays ?? 0) > 0) {
    const days = ag.waterDays!;
    const daily = req('Water') + req('Drinking water');
    const gap = Math.min(RESTOCK_DAYS * daily, Math.max(0, days * daily - stock('Water') - stock('Drinking water')));
    const drinkGap = Math.min(
      RESTOCK_DAYS * req('Drinking water'),
      Math.max(0, days * req('Drinking water') - stock('Drinking water')),
    );
    const filter = d.groups.some(
      (g) => g.plan.inputs.some((i) => i.resource === 'Water') && g.plan.outputs.some((o) => o.resource === 'Drinking water'),
    );
    const boil = filter ? 0 : Math.min(drinkGap, stock('Cooking fuel') * BOIL_GAL_PER_FUEL_HOUR);
    const want = gap + boil;
    const h = want > EPS ? hoursFor(d, 'gather-water', 'Water', want) : 0;
    if (h > EPS || boil > EPS) out.set('gather-water', { want: { Water: want }, boil, hours: h + boil * BOIL_LABOR_PER_GAL });
  }
  if ((ag.woodWeeks ?? 0) > 0) {
    const gap = Math.min(
      RESTOCK_DAYS * req('Woody biomass'),
      Math.max(0, ag.woodWeeks! * 7 * req('Woody biomass') - stock('Woody biomass')),
    );
    const h = gap > EPS ? hoursFor(d, 'gather-wood', 'Woody biomass', gap) : 0;
    if (h > EPS) out.set('gather-wood', { want: { 'Woody biomass': gap }, boil: 0, hours: h });
  }
  if ((ag.foodWeeks ?? 0) > 0) {
    const veg = d.meta.get('Vegetables fruit fiber herbs')!;
    let have = 0;
    for (const r of d.plans.foodFamily) have += stock(r) * (d.meta.get(r)!.factorToNeed ?? 1);
    const gapKcal = Math.min(RESTOCK_DAYS * req('Food'), Math.max(0, ag.foodWeeks! * 7 * req('Food') - have));
    const lbs = gapKcal / (veg.factorToNeed ?? 1);
    const h = lbs > EPS ? hoursFor(d, 'gather-food', veg.name, lbs) : 0;
    if (h > EPS) out.set('gather-food', { want: { [veg.name]: lbs }, boil: 0, hours: h });
  }
  return out;
}

/** Spend `hours` on a gathering job: nearest nodes first, depleting them; extras come along. */
function gather(d: Day, job: JobId, hours: number, plan: GatherPlan | undefined): void {
  if (hours <= EPS) return;
  let left = hours;
  const scale = plan && plan.hours > EPS ? Math.min(1, hours / plan.hours) : 1;
  const boilHours = plan ? plan.boil * BOIL_LABOR_PER_GAL * scale : 0;
  left -= boilHours;
  const wants = plan ? Object.entries(plan.want) : [];
  const resources = wants.length ? wants.map(([r]) => r) : [...new Set(d.prev.site.nodes.filter((n) => NODE_JOB[n.type] === job).map((n) => n.resource))];
  for (const resource of resources) {
    let want = plan ? (plan.want[resource] ?? 0) : Infinity;
    for (const x of nodesFor(d, job, resource)) {
      if (left <= EPS || want <= EPS) break;
      // Working the node yields its main resource; by-products (food from wild greens) come along.
      const primaryEff = x.n.resource === resource ? x.eff : nodeYield(x.n, d.prev.yearWeather, d.prev.settings.weatherMode) / (1 + x.walk);
      const stock = stockAt(d, x.n.id);
      if (stock <= EPS) continue;
      const h = Math.min(left, want / x.eff, stock / primaryEff);
      const amount = h * primaryEff;
      if (amount <= EPS) continue;
      left -= h;
      want -= h * x.eff;
      if (Number.isFinite(stock)) (d.nodeStock ??= {})[x.n.id] = stock - amount;
      const walkHours = (h * x.walk) / (1 + x.walk);
      const land = (r: string, units: number) => {
        d.stocks[r] = (d.stocks[r] ?? 0) + units;
        const led = d.res[r];
        if (led) led.produced += units;
        const m = d.meta.get(r)!;
        if (m.needsRow) {
          d.needs[m.needsRow].provided += units * (m.factorToNeed ?? 1);
          d.needs[m.needsRow].potential += units * (m.factorToNeed ?? 1);
        }
        d.gathered.push({ job, nodeId: x.n.id, nodeType: x.n.type, resource: r, amount: units, hours: h, walkHours });
      };
      land(x.n.resource, amount);
      for (const e of x.n.extra) land(e.resource, (h / (1 + x.walk)) * e.perHour);
      d.gatherUsed += h;
      d.byJob[job] = (d.byJob[job] ?? 0) + h;
    }
  }
  // Boil untreated water into drinking water over the day's cooking fire.
  if (plan && plan.boil > EPS) {
    const fuel = d.stocks['Cooking fuel'] ?? 0;
    const gal = Math.min(plan.boil * scale, d.stocks['Water'] ?? 0, fuel * BOIL_GAL_PER_FUEL_HOUR);
    if (gal > EPS) {
      const fuelHours = gal / BOIL_GAL_PER_FUEL_HOUR;
      d.stocks['Water'] = (d.stocks['Water'] ?? 0) - gal;
      d.res['Water']!.consumed += gal;
      d.stocks['Cooking fuel'] = fuel - fuelHours;
      d.res['Cooking fuel']!.consumed += fuelHours;
      d.stocks['Drinking water'] = (d.stocks['Drinking water'] ?? 0) + gal;
      d.res['Drinking water']!.produced += gal;
      d.needs['Water'].needed += gal;
      d.needs['Water'].delivered += gal;
      d.needs['Cooking fuel'].needed += fuelHours;
      d.needs['Cooking fuel'].delivered += fuelHours;
      d.needs['Drinking water'].provided += gal;
      d.needs['Drinking water'].potential += gal;
      const labor = gal * BOIL_LABOR_PER_GAL;
      d.gatherUsed += labor;
      d.byJob[job] = (d.byJob[job] ?? 0) + labor;
      d.boiled = { gal, fuelHours, laborHours: labor };
    }
  }
}

/**
 * Step 4: the labor pool and the jobs it goes to (G14). Each job's demand: construction (up to
 * its share of the pool), system upkeep (their Labor requests), and gathering (auto-gather rules,
 * or a job's weekly cap as standing hours). Labor goes to priority 1 first, proportionally within
 * a priority; weekly caps limit a job. With no gathering, construction comes before upkeep as before.
 */
function laborPool(d: Day): void {
  let pool = 0;
  for (const g of d.groups) {
    if (!g.plan.isHuman) continue;
    for (const i of g.members) {
      const inst = d.instances[i]!;
      pool += (g.plan.laborWeekly / 7) * (inst.person?.health ?? 1) * (inst.scale ?? 1);
    }
  }
  d.pool = pool;
  d.res['Labor']!.produced = pool;
  const settings = d.prev.settings;
  const demand = new Map<JobId, number>();
  let remaining = 0;
  for (const inst of d.instances) if (inst.status === 'building') remaining += Math.max(0, inst.setupHoursNeeded - inst.setupHoursDone);
  demand.set('construction', Math.min(remaining, pool * settings.constructionShare));
  let upkeep = 0;
  for (const q of d.byResource.get('Labor') ?? []) upkeep += q.amount;
  demand.set('upkeep', upkeep);
  const plans = planGathering(d);
  // An auto-gather job may claim at most this share of the day, so survival foraging can't starve upkeep.
  for (const [job, p] of plans) demand.set(job, Math.min(p.hours, pool * MAX_GATHER_SHARE));
  for (const j of JOBS) {
    if (!j.id.startsWith('gather') || plans.has(j.id)) continue;
    const cap = jobCap(settings, j.id);
    if (cap !== null && cap > 0 && d.prev.site.nodes.some((n) => NODE_JOB[n.type] === j.id)) demand.set(j.id, cap / 7);
  }
  for (const [job, dm] of demand) {
    const cap = jobCap(settings, job);
    if (cap !== null) demand.set(job, Math.min(dm, Math.max(0, cap - jobHours(d.prev.ledgers, job, 6))));
  }
  // Priority 1 first, proportionally within a priority.
  const granted = new Map<JobId, number>();
  let avail = pool;
  const levels = [...new Set([...demand.keys()].map((j) => jobPriority(settings, j)))].sort((a, b) => a - b);
  for (const lv of levels) {
    const jobs = [...demand.entries()].filter(([j]) => jobPriority(settings, j) === lv);
    const total = jobs.reduce((a, [, v]) => a + v, 0);
    if (total <= 0) continue;
    const share = total <= avail ? 1 : avail / total;
    // A lone job short of labor gets exactly what is left (no rounding from total × avail ÷ total).
    for (const [j, v] of jobs) granted.set(j, share < 1 && jobs.length === 1 ? avail : v * share);
    avail = share < 1 ? 0 : Math.max(0, avail - total);
  }
  // Construction, in placement order.
  let cap = granted.get('construction') ?? 0;
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
  if (used > 0) d.byJob.construction = used;
  d.laborForUpkeep = granted.get('upkeep') ?? 0;
  for (const j of JOBS) if (j.id.startsWith('gather')) gather(d, j.id, granted.get(j.id) ?? 0, plans.get(j.id));
  d.res['Labor']!.consumed += used + d.gatherUsed;
}

/** Step 3: each group's requests for today, and the capacity it provides. */
function buildRequests(d: Day): void {
  for (const g of d.groups) {
    for (const plan of g.plan.inputs) {
      // A backstop's bill is charged per unit delivered (G12), not as a fixed Capital request.
      if (g.plan.backstop && !d.unlimited && plan.resource === 'Capital') continue;
      const amount =
        dailyAmount(plan, d.day, d.weather, d.table) * g.w * (g.spatial.inMult[plan.resource] ?? 1);
      const assigned = plan.role === 'capacity' ? g.spatial.assigned[plan.resource] : undefined;
      if (assigned) {
        d.assignedInputs.push({ g, plan, amount, share: d.unlimited ? 1 : assigned.share });
        continue;
      }
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
        for (const i of g.members)
          mat += maturity(d.instances[i]!, g.plan, d.absDay) * (d.instances[i]!.scale ?? 1);
      }
      const m = g.spatial.outMult[o.resource] ?? 1;
      d.capAvail.set(o.resource, (d.capAvail.get(o.resource) ?? 0) + o.qty * mat * m);
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
  d.seed = seedReserve(d);
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
        const free = Math.max(0, (stocks[sub] ?? 0) - (reserved[sub] ?? 0) - (d.seed[sub] ?? 0));
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
    // Service boosts (pollination) use yesterday's service output; Flow boosts (scraps, greens
    // for hens) draw on what is left in stock after direct requests (G16 fix: they read 0 before).
    const flow = meta.get(r)!.class === 'Flow';
    const avail = flow ? Math.max(0, (stocks[r] ?? 0) - (reserved[r] ?? 0) - (d.seed[r] ?? 0)) : (d.prev.services[r] ?? 0);
    d.boostSat.set(r, d.unlimited || req <= 0 ? 1 : Math.min(1, avail / req));
  }
}

/**
 * Seed kept for planting (G16): a season's worth of every food a planted system needs as seed
 * (a potato patch's 25 lbs of seed potatoes) is held back from the household's meals.
 */
function seedReserve(d: Day): Record<string, number> {
  const out: Record<string, number> = {};
  const food = new Set(d.plans.foodFamily);
  // Planted and still-being-planted systems both keep their seed.
  for (const inst of d.instances) {
    const plan = d.plans.bySystem.get(inst.systemId)!;
    if (plan.isHuman) continue;
    for (const f of plan.inputs) {
      if (f.period !== 'Per season' || f.role !== 'required' || !food.has(f.resource) || f.resource === 'Food') continue;
      out[f.resource] = (out[f.resource] ?? 0) + f.qty * (inst.scale ?? 1);
    }
  }
  return out;
}

/** Market trips cost 10 miles of Transportation, or a $25 delivery charge without it (G12). */
export const MARKET_TRIP_MILES = 10;
export const MARKET_DELIVERY_FEE = 25;

/**
 * Step 2b (G12): the market. One trip a day covers every order: one-off orders placed since
 * yesterday, and standing orders whose stock fell below their threshold. Nothing is bought
 * while cash is at or below zero.
 */
function marketTrip(d: Day): void {
  const m = d.market;
  if (!m) return;
  const orders = m.orders.map((o) => ({ ...o }));
  for (const so of m.standing) {
    const stock = d.stocks[so.resource] ?? 0;
    if (stock < so.keepAbove) orders.push({ resource: so.resource, amount: so.orderUpTo - stock });
  }
  d.market = { orders: [], standing: m.standing };
  const wanted = orders.filter((o) => o.amount > EPS && (d.meta.get(o.resource)?.marketPrice ?? null) !== null);
  if (!wanted.length) return;
  if (d.cash <= 0) {
    d.broke = true;
    return;
  }
  let trip: 'own transport' | 'delivery' = 'delivery';
  const miles = d.stocks['Transportation'] ?? 0;
  if (miles >= MARKET_TRIP_MILES) {
    d.stocks['Transportation'] = miles - MARKET_TRIP_MILES;
    d.res['Transportation']!.consumed += MARKET_TRIP_MILES;
    trip = 'own transport';
  } else {
    d.cash -= MARKET_DELIVERY_FEE;
    d.spend.delivery += MARKET_DELIVERY_FEE;
  }
  const bought: Record<string, number> = {};
  let cost = 0;
  for (const o of wanted) {
    const r = d.meta.get(o.resource)!;
    const price = r.marketPrice!;
    const affordable = price > 0 ? Math.max(0, d.cash) / price : o.amount;
    const amount = Math.min(o.amount, affordable);
    if (amount <= EPS) {
      d.broke = true;
      continue;
    }
    d.stocks[o.resource] = (d.stocks[o.resource] ?? 0) + amount;
    const led = d.res[o.resource];
    if (led) led.purchased += amount;
    d.bought[o.resource] = (d.bought[o.resource] ?? 0) + amount;
    if (r.needsRow) {
      const f = r.factorToNeed ?? 1;
      d.needs[r.needsRow].provided += amount * f;
      d.needs[r.needsRow].potential += amount * f;
      d.needs[r.needsRow].bought += amount * f;
    }
    d.cash -= amount * price;
    cost += amount * price;
    d.spend.market[o.resource] = (d.spend.market[o.resource] ?? 0) + amount * price;
    bought[o.resource] = (bought[o.resource] ?? 0) + amount;
  }
  if (cost > 0) d.events.push({ kind: 'market', absDay: d.absDay, bought, cost, trip });
}

/**
 * Step 5b (G12): backstops fill what on-site supply didn't. After allocation, each backstop
 * (grocery, grid, city water…) tops up the unmet requests for what it sells, by tier, up to
 * 3 × its catalog output a week, at its price per unit, while cash lasts. Connection fees are
 * charged every day whether used or not. A backstop that is short of its own inputs (a grocery
 * run with no transport) delivers that much less.
 */
function dispatchBackstops(d: Day): void {
  // Validation mode keeps the spreadsheet's fixed outputs, so potential parity still holds.
  if (d.unlimited) return;
  const groups = d.groups.filter((g) => g.plan.backstop);
  if (!groups.length) return;
  for (const g of groups) {
    const fee = (g.plan.backstop!.fee / 7) * g.w;
    if (fee > 0) {
      d.cash -= fee;
      d.spend.fees += fee;
    }
    g.dispatched = {};
  }
  // Each backstop's own satisfaction (transport for the grocery run) from what it was granted.
  const own = new Map<Group, number>();
  for (const reqs of d.byResource.values()) {
    for (const q of reqs) {
      if (!q.group.plan.backstop || q.plan.role !== 'required') continue;
      own.set(q.group, Math.min(own.get(q.group) ?? 1, q.amount > 0 ? q.grant / q.amount : 1));
    }
  }
  const sold = new Set<string>();
  for (const g of groups) for (const r of Object.keys(g.plan.backstop!.prices)) sold.add(r);
  for (const resource of sold) {
    const reqs = (d.byResource.get(resource) ?? []).filter(
      (q) => !q.group.plan.backstop && (q.plan.role === 'required' || q.plan.role === 'need'),
    );
    let unmet = 0;
    for (const q of reqs) unmet += Math.max(0, q.amount - q.grant);
    if (unmet <= EPS) continue;
    // Cheapest backstop first.
    const sellers = groups
      .filter((g) => g.plan.backstop!.prices[resource] !== undefined)
      .sort((a, b) => a.plan.backstop!.prices[resource]! - b.plan.backstop!.prices[resource]!);
    let delivered = 0;
    for (const g of sellers) {
      if (unmet - delivered <= EPS) break;
      if (d.cash <= 0) {
        d.broke = true;
        break;
      }
      const price = g.plan.backstop!.prices[resource]!;
      const capMult = (d.prev.settings.backstopCapMult ?? BACKSTOP_CAP_MULT) / BACKSTOP_CAP_MULT;
      const cap = ((g.plan.backstop!.capWeekly[resource] ?? 0) / 7) * g.w * (own.get(g) ?? 1) * capMult;
      const affordable = price > 0 ? d.cash / price : Infinity;
      const amount = Math.min(unmet - delivered, cap, affordable);
      if (amount <= EPS) continue;
      if (amount < Math.min(unmet - delivered, cap) - EPS) d.broke = true;
      delivered += amount;
      g.dispatched![resource] = (g.dispatched![resource] ?? 0) + amount;
      d.cash -= amount * price;
      d.spend.backstop[resource] = (d.spend.backstop[resource] ?? 0) + amount * price;
    }
    if (delivered <= EPS) continue;
    // Top up the unmet requests by tier, proportionally within a tier.
    const tops: Request[] = reqs.map((q) => ({ ...q, amount: Math.max(0, q.amount - q.grant), grant: 0 }));
    allocateByTier(tops, delivered);
    tops.forEach((t, k) => (reqs[k]!.grant += t.grant));
    d.stocks[resource] = (d.stocks[resource] ?? 0) + delivered;
    const led = d.res[resource];
    if (led) led.purchased += delivered;
    d.bought[resource] = (d.bought[resource] ?? 0) + delivered;
    const m = d.meta.get(resource)!;
    if (m.needsRow) {
      const f = m.factorToNeed ?? 1;
      d.needs[m.needsRow].provided += delivered * f;
      d.needs[m.needsRow].potential += delivered * f;
      d.needs[m.needsRow].bought += delivered * f;
    }
  }
  // By-products (food waste from groceries) follow what each backstop delivered of its first priced output.
  for (const g of groups) {
    const b = g.plan.backstop!;
    const nominal = ((b.capWeekly[b.primary] ?? 0) / 3 / 7) * g.w;
    const share = nominal > 0 ? (g.dispatched![b.primary] ?? 0) / nominal : 0;
    if (share <= 0) continue;
    for (const o of g.plan.outputs) {
      if (b.prices[o.resource] !== undefined || o.cls !== 'Flow') continue;
      const amount = (o.weekly / 7) * g.w * share;
      d.produced[o.resource] = (d.produced[o.resource] ?? 0) + amount;
      g.dispatched![o.resource] = (g.dispatched![o.resource] ?? 0) + amount;
    }
  }
}

function record(g: Group, r: string, requested: number, received: number, granted = received): void {
  const cur = g.inputs[r];
  if (cur) {
    cur.requested += requested / g.n;
    cur.granted += granted / g.n;
    cur.received += received / g.n;
  } else g.inputs[r] = { requested: requested / g.n, granted: granted / g.n, received: received / g.n };
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
  for (const a of d.assignedInputs) {
    record(a.g, a.plan.resource, a.amount, a.amount * a.share);
    if (a.share < a.g.sat) {
      a.g.sat = a.share;
      a.g.limitedBy = a.plan.resource;
    }
    if (a.plan.needsRow) {
      const n = d.needs[a.plan.needsRow];
      n.needed += a.amount * a.plan.needFactor;
      n.delivered += a.amount * a.share * a.plan.needFactor;
    }
  }
  for (const b of d.boostInputs) {
    const gate = b.g.spatial.gated[b.plan.resource];
    const s = gate === false && !d.unlimited ? 0 : d.boostSat.get(b.plan.resource)!;
    record(b.g, b.plan.resource, b.amount, b.amount * s);
    b.g.boostMult *= 1 - b.plan.boostWeight * (1 - s);
  }
}

/** Step 6b: required inputs use satisfaction × request (the rest stays in stock); needs use their grant. */
function consume(d: Day): void {
  const { meta, stocks, direct, res } = d;
  // Flow boosts use what they were given.
  for (const b of d.boostInputs) {
    if (meta.get(b.plan.resource)!.class !== 'Flow' || d.unlimited) continue;
    const gate = b.g.spatial.gated[b.plan.resource];
    const use = gate === false ? 0 : b.amount * (d.boostSat.get(b.plan.resource) ?? 0);
    if (use <= EPS) continue;
    stocks[b.plan.resource] = Math.max(0, (stocks[b.plan.resource] ?? 0) - use);
    res[b.plan.resource]!.consumed += use;
  }
  for (const [resource, reqs] of d.ordered) {
    let totalUse = 0;
    let requested = 0;
    let granted = 0;
    for (const q of reqs) {
      const use = q.plan.role === 'required' ? Math.min(q.grant, q.group.sat * q.amount) : q.grant;
      totalUse += use;
      requested += q.amount;
      granted += q.grant;
      record(q.group, resource, q.amount, use, q.grant);
      if (resource === 'Capital' && use > 0) {
        const sid = q.group.plan.system.id;
        (d.spend.running ??= {})[sid] = (d.spend.running[sid] ?? 0) + use;
      }
      if (resource === 'Labor') {
        const sid = q.group.plan.system.id;
        d.laborBySystem[sid] = (d.laborBySystem[sid] ?? 0) + use;
      }
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
        const take = Math.min(Math.max(0, have - (d.seed[sub] ?? 0)), left / sf);
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
    if (p.backstop && !d.unlimited) {
      // Backstops delivered on demand (dispatchBackstops); report it per instance.
      const per: Record<string, number> = {};
      for (const [r, v] of Object.entries(g.dispatched ?? {})) per[r] = v / Math.max(1e-12, g.w);
      d.lastDay[g.key] = { sat: g.sat, limitedBy: g.limitedBy, boostMult: 1, inputs: g.inputs, outputs: per, potential: per };
      continue;
    }
    const base: number[] = [];
    for (const o of p.outputs) {
      base.push(
        p.isHuman && o.resource === 'Labor'
          ? p.laborWeekly / 7
          : dailyAmount(o, d.day, d.weather, d.table) * (g.spatial.outMult[o.resource] ?? 1),
      );
    }
    let multSum = 0;
    let matSum = 0; // Σ maturity × scale: the potential multiplier
    for (const i of g.members) {
      const inst = d.instances[i]!;
      const m = p.isHuman ? (inst.scale ?? 1) : maturity(inst, p, d.absDay);
      matSum += m;
      multSum += p.isHuman ? (inst.person?.health ?? 1) : g.sat * g.boostMult * m;
    }
    const perUnit: Record<string, number> = {};
    const potUnit: Record<string, number> = {};
    const undelivered: string[] = [];
    const unitMult = p.isHuman ? 1 : g.sat * g.boostMult;
    for (let k = 0; k < p.outputs.length; k++) {
      const o = p.outputs[k]!;
      perUnit[o.resource] = (perUnit[o.resource] ?? 0) + base[k]! * unitMult;
      potUnit[o.resource] = (potUnit[o.resource] ?? 0) + base[k]!;
      if (p.isHuman && o.resource === 'Labor') {
        d.needs['Est. Required Labor'].potential += base[k]! * matSum;
        continue; // actual is counted in the pool
      }
      const amount = base[k]! * multSum;
      const pot = base[k]! * matSum;
      if (o.needsRow) d.needs[o.needsRow].potential += pot * o.needFactor;
      const led = o.cls === 'Flow' ? d.res[o.resource] : undefined;
      if (led) led.potential += pot;
      if (g.spatial.undelivered[o.resource]) {
        // Made, but it never reaches a shelter: potential only (G11).
        if (led) led.undelivered += amount;
        if (!undelivered.includes(o.resource)) undelivered.push(o.resource);
        continue;
      }
      if (o.needsRow) {
        d.needs[o.needsRow].provided += amount * o.needFactor;
        if (p.bought) d.needs[o.needsRow].bought += amount * o.needFactor;
      }
      if (o.cls === 'Money') d.cashIn += amount;
      else if (o.cls === 'Flow') {
        d.produced[o.resource] = (d.produced[o.resource] ?? 0) + amount;
        if (p.bought && amount > 0) d.bought[o.resource] = (d.bought[o.resource] ?? 0) + amount;
      } else if (o.cls === 'Service') d.services[o.resource] = (d.services[o.resource] ?? 0) + amount;
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
      potential: potUnit,
      ...(undelivered.length ? { undelivered } : {}),
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

/** Step 7: people's wellbeing (G15 wellbeing v2), hardship, and going to town and back. */
function updatePeople(d: Day): void {
  const share = (n: NeedDay) => (n.needed > EPS ? Math.min(1, n.delivered / n.needed) : 1);
  // Heat is measured against the shelter's own heat need, the same need the checklist shows.
  // Bedding (blankets, sleeping bags) lowers that need as a catalog modifier on the shelter (G16).
  const heatFrac = d.weather.hdd > HEAT_HDD_MIN ? share(d.needs['Heated shelter']) : null;
  const coolFrac = d.weather.cdd > COOL_CDD_MIN ? share(d.needs['Cooled shelter']) : null;
  const mult = d.prev.settings.wellbeingMult ?? 1;
  let present = 0;
  for (const g of d.groups) if (g.plan.isHuman) present += g.w;
  const servicePoints = present > EPS ? ((d.services['Wellbeing'] ?? 0) * 7) / present : 0;
  let anyShort = false;
  for (const g of d.groups) {
    if (!g.plan.isHuman) continue;
    const frac = (r: string): number | null => {
      const x = g.inputs[r];
      return x && x.requested > EPS ? Math.min(1, x.received / x.requested) : x ? 1 : null;
    };
    const today: PersonDay = {
      survival: {
        drinkingWater: frac('Drinking water'),
        food: frac('Food'),
        shelter: frac('Shelter'),
        heat: heatFrac,
        sanitation: frac('Sanitation'),
      },
      comfort: {
        electricity: frac('Electricity'),
        cooling: coolFrac,
        transportation: frac('Transportation'),
        hotWater: frac('Hot water'),
        cookingFuel: frac('Cooking fuel'),
      },
      servicePoints,
      mult,
    };
    // Members of a group see the same day; two people in the same state get the same update
    // (person states are immutable, so sharing the result is safe and saves the allocations).
    let memo: { old: PersonState; u: PersonUpdate } | null = null;
    for (const i of g.members) {
      const old = d.instances[i]!.person;
      if (!old) continue;
      const inst = touch(d, i);
      const u: PersonUpdate = memo && samePersonState(memo.old, old) ? memo.u : updateWellbeing(old, today);
      memo = { old, u };
      for (const h of u.hardships) {
        d.events.push({ kind: 'hardship', absDay: d.absDay, instanceId: inst.id, need: h.need, level: h.level });
      }
      if (u.person.wellbeing < old.wellbeing && Math.floor(old.wellbeing / 10) !== Math.floor(u.person.wellbeing / 10)) {
        d.events.push({ kind: 'health', absDay: d.absDay, instanceId: inst.id, health: u.person.health, wellbeing: u.person.wellbeing });
      }
      if (u.wentToTown && d.prev.settings.peopleLeave) {
        u.person.away = { since: d.absDay };
        d.events.push({ kind: 'went-to-town', absDay: d.absDay, instanceId: inst.id });
      }
      if (u.hardships.length || Object.values(u.person.short).some((v) => v > 0)) anyShort = true;
      inst.person = u.person;
      d.healthSum += u.person.health;
      d.wellbeingSum += u.person.wellbeing;
      d.people++;
    }
  }
  // Someone in town comes home once home could keep them: a shelter, a week of food, and
  // three days of drinking water on hand, and nobody at home going short today.
  for (let i = 0; i < d.instances.length; i++) {
    const p = d.instances[i]!.person;
    if (!p?.away || d.absDay - p.away.since < WB_AWAY_MIN_DAYS || anyShort) continue;
    const plan = d.plans.bySystem.get(d.instances[i]!.systemId)!;
    const need = (r: string) =>
      plan.inputs.filter((f) => f.resource === r).reduce((a, f) => a + dailyAmount(f, d.day, d.weather, d.table), 0);
    const shelter = d.instances.some((x) => x.status === 'active' && d.shelterIds.has(x.systemId));
    const food = (d.stocks['Food'] ?? 0) >= 7 * need('Food');
    const water = (d.stocks['Drinking water'] ?? 0) >= 3 * need('Drinking water');
    if (!shelter || !food || !water) continue;
    const inst = touch(d, i);
    const { away: _gone, ...rest } = p;
    inst.person = { ...rest, wellbeing: WB_RETURN_AT, health: laborShare(WB_RETURN_AT), why: [] };
    d.events.push({ kind: 'came-home', absDay: d.absDay, instanceId: inst.id });
  }
}

function samePersonState(a: PersonState, b: PersonState): boolean {
  if (a === b) return true;
  if (a.wellbeing !== b.wellbeing || a.severeFood !== b.severeFood || !!a.away !== !!b.away) return false;
  for (const k in a.short) if (a.short[k as keyof PersonState['short']] !== b.short[k as keyof PersonState['short']]) return false;
  return true;
}

/** Step 8: unstorable leftovers are lost, production lands, pools overflow, food spoils. */
function storeAndSpoil(d: Day): void {
  const { meta, stocks, direct, res, plans } = d;
  for (const r of plans.flowResources) {
    const m = meta.get(r)!;
    const led = res[r]!;
    const p = d.produced[r] ?? 0;
    if (r === 'Labor') {
      led.spilled = Math.max(0, d.pool - d.constructionUsed - d.gatherUsed - d.laborUsed); // unused hours; labor never stocks
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

export function spendTotal(s: DaySpend): number {
  let t = s.fees + s.delivery;
  for (const v of Object.values(s.backstop)) t += v;
  for (const v of Object.values(s.market)) t += v;
  return t;
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
      out: d.capitalUsed + spendTotal(d.spend),
      purchases: prev.pendingCash.purchases,
      refunds: prev.pendingCash.refunds,
      end: d.cash,
    },
    labor: {
      pool: d.pool,
      construction: d.constructionUsed,
      upkeepRequested: d.upkeepRequested,
      upkeepDelivered: d.laborUsed,
      unused: Math.max(0, d.pool - d.constructionUsed - d.gatherUsed - d.laborUsed),
      ...(Object.keys(d.byJob).length || d.laborUsed > 0
        ? { byJob: { ...d.byJob, ...(d.laborUsed > 0 ? { upkeep: d.laborUsed } : {}) } }
        : {}),
    },
    ...(d.gathered.length ? { gathered: d.gathered } : {}),
    ...(d.boiled ? { boiled: d.boiled } : {}),
    laborBySystem: d.laborBySystem,
    curtailed,
    weather: d.weather,
    bought: d.bought,
    hardships: d.events.filter((e) => e.kind === 'hardship').length,
    spend: d.spend,
    health: d.people ? d.healthSum / d.people : 1,
    wellbeing: d.people ? d.wellbeingSum / d.people : null,
    away: d.instances.filter((i) => i.person?.away).length,
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
  let rng = prev.rng;
  let yearWeather = prev.yearWeather;
  let weatherLog = prev.weatherLog;
  if (prev.settings.weatherMode === 'real' && yearWeather?.year !== year) {
    let yw: YearWeather;
    [yw, rng] = drawYearWeather(prev.site, year, rng);
    yearWeather = yw;
    weatherLog = [...(weatherLog ?? []), yw];
  }
  const weather = weatherFor(prev.site, table, day, prev.settings.weatherMode, yearWeather);
  const res: Record<string, ResourceDay> = {};
  for (const r of plans.flowResources) res[r] = newResourceDay((prev.stocks[r] ?? 0) + (prev.direct[r] ?? 0));
  const needs = {} as Record<NeedKey, NeedDay>;
  for (const k of NEED_KEYS) needs[k] = { provided: 0, potential: 0, needed: 0, delivered: 0, bought: 0 };

  const shelterIds = shelterSet(catalog, plans);
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
    assignedInputs: [],
    capAvail: new Map(),
    capSat: new Map(),
    boostSat: new Map(),
    laborUsed: 0,
    laborBySystem: {},
    upkeepRequested: 0,
    capitalUsed: 0,
    produced: {},
    bought: {},
    services: {},
    lastDay: {},
    cashIn: 0,
    healthSum: 0,
    wellbeingSum: 0,
    seed: {},
    people: 0,
    spoiledToday: {},
    spend: { backstop: {}, market: {}, fees: 0, delivery: 0, running: {} },
    market: prev.market,
    broke: false,
    byJob: {},
    gatherUsed: 0,
    gathered: [],
    boiled: null,
    nodeStock: prev.nodeStock,
    shelterIds,
  };

  groupInstances(d, computeSpatial(catalog, prev));
  startConstruction(d); // 2
  marketTrip(d); // 2b
  buildRequests(d); // 3
  laborPool(d); // 4: labor by job priority, gathering included (G14)
  allocate(d); // 5
  dispatchBackstops(d); // 5b
  satisfy(d); // 6
  consume(d);
  produce(d);
  updatePeople(d); // 7
  storeAndSpoil(d); // 8
  d.cash += d.cashIn; // 9
  finishConstruction(d);
  const flags = emitEvents(d); // 10
  if (d.broke && !prev.flags.broke) d.events.push({ kind: 'purchases-stopped', absDay, cash: d.cash });
  if (d.broke) flags.broke = true;
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
    ...(yearWeather ? { yearWeather, weatherLog } : {}),
    ...(d.market ? { market: d.market } : {}),
    ...(d.nodeStock ? { nodeStock: regrowNodes(prev.site, d.nodeStock, day, d.weather.precipIn) } : {}),
    pendingCash: { purchases: 0, refunds: 0 },
    flags,
  };
  // The tutorial (G16): a finished quest's reward lands between days.
  if (state.tutorial && !state.tutorial.skipped) {
    const t = advanceTutorial(state, catalog);
    if (t.completed) {
      d.events.push({ kind: 'quest', absDay, questId: t.completed.id, title: t.completed.title, reward: t.completed.reward.line });
      return { state: t.state, events: d.events, ledger };
    }
  }
  return { state, events: d.events, ledger };
}

const shelterSets = new WeakMap<Plans, Set<string>>();
function shelterSet(_catalog: Catalog, plans: Plans): Set<string> {
  let set = shelterSets.get(plans);
  if (!set) {
    set = new Set([...plans.bySystem.values()].filter((p) => p.outputs.some((o) => o.resource === 'Shelter' && o.isCapacity)).map((p) => p.system.id));
    shelterSets.set(plans, set);
  }
  return set;
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
