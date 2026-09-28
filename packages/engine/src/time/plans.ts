import {
  evalQtyExpr,
  type Catalog,
  type Flow,
  type InputRole,
  type NeedKey,
  type Period,
  type ResourceClass,
  type Site,
  type System,
} from '@homestead/catalog';
import { weeklyFactors } from '../periods.ts';
import { windowDays } from './calendar.ts';
import type { ClimateTable, DayWeather } from './climate.ts';

export type Shape = 'steady' | 'heating' | 'cooling' | 'sun' | 'rain' | 'wind' | 'growing' | 'window';

export interface FlowPlan {
  flow: Flow;
  resource: string;
  cls: ResourceClass;
  role: InputRole | null;
  period: Period;
  /** Per-period quantity for one instance. */
  qty: number;
  /** Weekly equivalent for one instance (qty × weekly factor). */
  weekly: number;
  shape: Shape;
  window?: { first: number; last: number; days: number };
  boostWeight: number;
  needsRow?: NeedKey;
  needFactor: number;
  isCapacity: boolean;
  isOneTime: boolean;
}

export interface SystemPlan {
  system: System;
  isHuman: boolean;
  /**
   * Buys its outputs from outside the homestead (a Conventional system paid in Capital:
   * grid power, city water, groceries). Its Flow outputs are recorded as `bought` in the ledger.
   */
  bought: boolean;
  /** Recurring inputs (excluding one-time materials). */
  inputs: FlowPlan[];
  outputs: FlowPlan[];
  /** One-time construction materials. */
  materials: FlowPlan[];
  /** Human Being labor output per week (0 for other systems). */
  laborWeekly: number;
}

export interface Plans {
  bySystem: Map<string, SystemPlan>;
  /** Storage pools: capacity resource → member resources. */
  pools: Map<string, { resource: string; unitsPer: number }[]>;
  poolBuffer: Map<string, number>;
  flowResources: string[];
  foodFamily: string[];
  /** Flow resources with a spoilage rate. */
  perishable: string[];
}

const QTY_SHAPE: Partial<Record<Flow['qty']['kind'], Shape>> = {
  sun: 'sun',
  pv: 'sun',
  rain: 'rain',
  rainCapture: 'rain',
  wind: 'wind',
  heatLoad: 'heating',
  coolLoad: 'cooling',
};

function shapeFor(flow: Flow): { shape: Shape; window?: FlowPlan['window'] } {
  const fromQty = QTY_SHAPE[flow.qty.kind];
  if (fromQty) return { shape: fromQty };
  switch (flow.timing.kind) {
    case 'heating':
      return { shape: 'heating' };
    case 'cooling':
      return { shape: 'cooling' };
    case 'growing-season':
      return { shape: 'growing' };
    case 'window':
      return { shape: 'window', window: windowDays(flow.timing.startWeek, flow.timing.endWeek) };
    default:
      return { shape: 'steady' };
  }
}

const cache = new WeakMap<Catalog, Map<Site, Plans>>();

/** Per-system flow plans for a catalog and site, cached. */
export function getPlans(catalog: Catalog, site: Site): Plans {
  let bySite = cache.get(catalog);
  if (!bySite) cache.set(catalog, (bySite = new Map()));
  const hit = bySite.get(site);
  if (hit) return hit;

  const a = site.assumptions;
  const factors = weeklyFactors(catalog, a);
  const resByName = new Map(catalog.resources.map((r) => [r.name, r]));
  const bySystem = new Map<string, SystemPlan>();
  for (const system of catalog.systems) {
    bySystem.set(system.id, {
      system,
      isHuman: system.name === 'Human Being',
      bought:
        system.categories.includes('Conventional') &&
        catalog.flows.some((f) => f.systemId === system.id && f.direction === 'in' && f.resource === 'Capital'),
      inputs: [],
      outputs: [],
      materials: [],
      laborWeekly: 0,
    });
  }
  for (const flow of catalog.flows) {
    const sp = bySystem.get(flow.systemId)!;
    const res = resByName.get(flow.resource)!;
    const qty = evalQtyExpr(flow.qty, sp.system, a);
    const { shape, window } = shapeFor(flow);
    const plan: FlowPlan = {
      flow,
      resource: flow.resource,
      cls: res.class,
      role: flow.inputRole,
      period: flow.period,
      qty,
      weekly: qty * factors[flow.period],
      shape,
      boostWeight: flow.boostWeight ?? 0,
      needFactor: res.factorToNeed ?? 1,
      isCapacity: flow.period === 'Capacity',
      isOneTime: flow.period === 'One-time',
    };
    if (window) plan.window = window;
    if (res.needsRow) plan.needsRow = res.needsRow;
    if (flow.direction === 'in') (plan.isOneTime ? sp.materials : sp.inputs).push(plan);
    else {
      sp.outputs.push(plan);
      if (sp.isHuman && flow.resource === 'Labor') sp.laborWeekly += plan.weekly;
    }
  }

  const pools = new Map<string, { resource: string; unitsPer: number }[]>();
  const poolBuffer = new Map<string, number>();
  for (const r of catalog.resources) {
    if (!r.storedIn) continue;
    const list = pools.get(r.storedIn.capacityResource) ?? [];
    list.push({ resource: r.name, unitsPer: r.storedIn.unitsPerCapacityUnit });
    pools.set(r.storedIn.capacityResource, list);
    poolBuffer.set(
      r.storedIn.capacityResource,
      Math.max(poolBuffer.get(r.storedIn.capacityResource) ?? 0, r.storedIn.buffer),
    );
  }
  const plans: Plans = {
    bySystem,
    pools,
    poolBuffer,
    flowResources: catalog.resources.filter((r) => r.class === 'Flow').map((r) => r.name),
    foodFamily: catalog.resources.filter((r) => r.needsRow === 'Food').map((r) => r.name),
    perishable: catalog.resources.filter((r) => r.class === 'Flow' && r.spoilPerWeek > 0).map((r) => r.name),
  };
  bySite.set(site, plans);
  return plans;
}

/** Today's multiplier on a flow's weekly ÷ 7 amount. Every shape averages 1 over a year. */
export function shapeValue(plan: FlowPlan, day: number, w: DayWeather, t: ClimateTable): number {
  const a = t.assumptions;
  switch (plan.shape) {
    case 'steady':
      return 1;
    case 'heating':
      return a.hdd > 0 ? w.hdd / (a.hdd / 365) : 0;
    case 'cooling':
      return a.cdd > 0 ? w.cdd / (a.cdd / 365) : 0;
    case 'sun':
      return a.psh > 0 ? w.psh / a.psh : 0;
    case 'rain':
      return a.precipIn > 0 ? w.precipIn / (a.precipIn / 365) : 0;
    case 'wind':
      return a.windCf > 0 ? w.windCf / a.windCf : 0;
    case 'growing':
      return w.growing ? (365 / t.seasonDays) * (w.growMult ?? 1) : 0;
    case 'window': {
      const win = plan.window!;
      return day >= win.first && day <= win.last ? 365 / win.days : 0;
    }
  }
}

/** A flow's amount today for one instance: capacity flows are levels, the rest weekly ÷ 7 × shape. */
export function dailyAmount(plan: FlowPlan, day: number, w: DayWeather, t: ClimateTable): number {
  if (plan.isCapacity) return plan.qty;
  if (plan.isOneTime || plan.weekly === 0) return 0;
  return (plan.weekly / 7) * shapeValue(plan, day, w, t);
}
