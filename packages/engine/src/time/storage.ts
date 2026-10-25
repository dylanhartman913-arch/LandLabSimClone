import type { Catalog, WinterStorageRule } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { getPlans, type Plans } from './plans.ts';
import { availableToday, drawToday, spareLabor, workProcessing, type ProcessingDay } from './processing.ts';
import type { DayLedger, GameEvent, GameState, Instance } from './types.ts';

/** LL-33 (`storagePools`): raw and drinking water in separate pools, feed storage, and winter freezing. */
export const RAW_WATER = 'Water';
export const POTABLE_WATER = 'Drinking water';
export const FEED_POOL = 'Feed storage';

export interface StoragePool {
  /** Display name, also the key the views use. */
  name: string;
  members: { resource: string; unitsPer: number }[];
  /** Room in capacity units (gal for water, cu ft for food and feed). */
  cap: number;
}

/** A frozen tank thaws after about half its tolerance again in thawing degree-days. */
export const FROST_CAP = 1.5;

export type WinterProtection = 'insulated' | 'heated';
export type WinterRecord = NonNullable<DayLedger['winter']>[number];

/** Daily mean outdoor temperature (°F) from the day's degree days (base 65 °F). */
export function meanTempF(w: { hdd: number; cdd: number }): number {
  return 65 - w.hdd + w.cdd;
}

export function tankRule(catalog: Catalog, systemId: string) {
  return catalog.winterStorage?.tanks.find((t) => t.systemId === systemId) ?? null;
}

/** Water storage one instance provides at catalog size (gal). */
export function tankGallons(plans: Plans, inst: Instance): number {
  const out = plans.bySystem.get(inst.systemId)!.outputs.find((o) => o.resource === 'Water storage' && o.isCapacity);
  return (out?.qty ?? 0) * (inst.scale ?? 1);
}

function protectionReady(rule: WinterStorageRule, inst: Instance): WinterProtection | null {
  const w = inst.winter;
  if (!w?.protection) return null;
  const hours = w.protection === 'insulated' ? rule.insulation.hours : rule.heating.hours;
  return (w.setupHours ?? 0) >= hours - 1e-9 ? w.protection : null;
}

/** Freezing degree-days this tank tolerates before it locks. */
export function freezeThreshold(catalog: Catalog, inst: Instance): number {
  const rule = catalog.winterStorage!;
  const base = tankRule(catalog, inst.systemId)!.freezeDegreeDays;
  return protectionReady(rule, inst) === 'insulated' ? base * rule.insulation.freezeMultiplier : base;
}

/** Water storage capacity currently locked in ice. */
export function frozenCapacity(plans: Plans, instances: readonly Instance[]): number {
  let cap = 0;
  for (const i of instances) if (i.status === 'active' && i.winter?.frozen !== undefined) cap += tankGallons(plans, i);
  return cap;
}

/**
 * The storage pools in force. With the gate off this is the catalog's pools unchanged. With it on,
 * Water storage holds raw water only, drinking water lives in its own household containers
 * (the catalog buffer), frozen tanks hold nothing new, and hay and feed share free Storage space.
 */
export function storagePools(
  catalog: Catalog,
  plans: Plans,
  on: boolean,
  capacity: (resource: string) => number,
  freeSpace: number,
  frozenCap: number,
): StoragePool[] {
  const out: StoragePool[] = [];
  for (const [capRes, members] of plans.pools) {
    if (!on || capRes !== 'Water storage') {
      out.push({ name: capRes, members, cap: capacity(capRes) + (plans.poolBuffer.get(capRes) ?? 0) });
      continue;
    }
    for (const m of members) {
      const buffer = catalog.resources.find((r) => r.name === m.resource)!.storedIn!.buffer;
      const raw = m.resource === RAW_WATER;
      out.push({
        name: raw ? 'Raw water storage' : 'Drinking water storage',
        members: [m],
        cap: raw ? Math.max(0, capacity(capRes) - frozenCap) + buffer : buffer,
      });
    }
  }
  const rule = catalog.winterStorage;
  if (on && rule)
    out.push({
      name: FEED_POOL,
      members: rule.feed.members.map((m) => ({ resource: m.resource, unitsPer: m.lbsPerCuFt })),
      cap: Math.max(0, freeSpace) + rule.feed.bufferCuFt,
    });
  return out;
}

/** Pools from completed instances at catalog size (views and market trips, before today's capacities). */
export function statePools(state: GameState, catalog: Catalog): StoragePool[] {
  const plans = getPlans(catalog, state.site);
  const made = new Map<string, number>();
  const used = new Map<string, number>();
  for (const inst of state.instances) {
    if (inst.status !== 'active') continue;
    const plan = plans.bySystem.get(inst.systemId)!;
    for (const o of plan.outputs)
      if (o.isCapacity) made.set(o.resource, (made.get(o.resource) ?? 0) + o.qty * (inst.scale ?? 1));
    for (const i of plan.inputs)
      if (i.role === 'capacity') used.set(i.resource, (used.get(i.resource) ?? 0) + i.qty * (inst.scale ?? 1));
  }
  const space = catalog.winterStorage?.feed.capacityResource ?? '';
  return storagePools(
    catalog,
    plans,
    !!state.settings.storagePools,
    (r) => made.get(r) ?? 0,
    (made.get(space) ?? 0) - (used.get(space) ?? 0),
    frozenCapacity(plans, state.instances),
  );
}

/** Free room for one resource, in its own units; Infinity when it has no pool. */
export function roomFor(pools: readonly StoragePool[], stocks: Record<string, number>, resource: string): number {
  const pool = pools.find((p) => p.members.some((m) => m.resource === resource));
  if (!pool) return Infinity;
  let volume = 0;
  for (const m of pool.members) volume += (stocks[m.resource] ?? 0) / m.unitsPer;
  return Math.max(0, pool.cap - volume) * pool.members.find((m) => m.resource === resource)!.unitsPer;
}

export function winterizeCost(catalog: Catalog, state: GameState, inst: Instance, protection: WinterProtection): number {
  const rule = catalog.winterStorage!;
  if (protection === 'heated') return rule.heating.cost;
  return rule.insulation.cost + rule.insulation.costPerGal * tankGallons(getPlans(catalog, state.site), inst);
}

/** Buy insulation or a heater for an outdoor tank (null removes protection; nothing is refunded). */
export function setWinterProtection(
  catalog: Catalog,
  state: GameState,
  id: string,
  protection: WinterProtection | null,
): GameState {
  if (!state.settings.storagePools) throw new Error('Separate storage and winter water is disabled');
  const inst = state.instances.find((i) => i.id === id);
  if (!inst || !tankRule(catalog, inst.systemId)) throw new Error('Only outdoor water tanks can be winterized');
  if ((inst.winter?.protection ?? null) === protection) throw new Error('This tank already has that protection');
  const cost = protection ? winterizeCost(catalog, state, inst, protection) : 0;
  if (cost > 0 && state.cash < cost) throw new Error('Cash cannot cover the winter protection');
  const winter: NonNullable<Instance['winter']> = { frost: inst.winter?.frost ?? 0 };
  if (inst.winter?.frozen !== undefined) winter.frozen = inst.winter.frozen;
  if (protection) {
    winter.protection = protection;
    winter.setupHours = 0;
  }
  return {
    ...state,
    cash: state.cash - cost,
    pendingCash: { ...state.pendingCash, purchases: state.pendingCash.purchases + cost },
    instances: state.instances.map((i) => (i.id === id ? { ...i, winter } : i)),
  };
}

/** Turning the gate off releases every frozen tank's water back into stock. */
export function releaseFrozen(state: GameState): GameState {
  let gal = 0;
  const instances = state.instances.map((i) => {
    if (!i.winter) return i;
    gal += i.winter.frozen ?? 0;
    const winter = { ...i.winter, frost: 0 };
    delete winter.frozen;
    return { ...i, winter };
  });
  if (!state.instances.some((i) => i.winter)) return state;
  return { ...state, instances, stocks: gal > 0 ? { ...state.stocks, [RAW_WATER]: (state.stocks[RAW_WATER] ?? 0) + gal } : state.stocks };
}

/**
 * The day's winter for outdoor tanks: protection work, heater power, frost, freezing and thawing.
 * Frost accumulates °F-days below the freezing point and melts on warmer days. A tank freezes when
 * frost reaches its tolerance, locking its share of the raw water, and thaws when frost is gone.
 */
export function advanceWinter(
  d: ProcessingDay & { weather: { hdd: number; cdd: number }; capAvail: Map<string, number>; absDay: number },
  catalog: Catalog,
): { records: WinterRecord[]; events: GameEvent[] } {
  const rule = catalog.winterStorage;
  if (!d.prev.settings.storagePools || !rule) return { records: [], events: [] };
  const plans = getPlans(catalog, d.prev.site);
  const temp = meanTempF(d.weather);
  const fdd = rule.freezeAtF - temp;
  const records: WinterRecord[] = [];
  const events: GameEvent[] = [];
  const buffer = catalog.resources.find((r) => r.name === RAW_WATER)!.storedIn!.buffer;
  for (let k = 0; k < d.instances.length; k++) {
    const inst0 = d.instances[k]!;
    if (inst0.status !== 'active' || !tankRule(catalog, inst0.systemId)) continue;
    const inst = { ...inst0, winter: { ...(inst0.winter ?? { frost: 0 }) } };
    const w = inst.winter;
    if (w.protection) {
      const hours = w.protection === 'insulated' ? rule.insulation.hours : rule.heating.hours;
      const work = Math.min(spareLabor(d), Math.max(0, hours - (w.setupHours ?? 0)));
      if (work > 1e-9) {
        workProcessing(d, inst.systemId, work);
        w.setupHours = (w.setupHours ?? 0) + work;
      }
    }
    const ready = protectionReady(rule, inst);
    const gal = tankGallons(plans, inst);
    let heaterNeed = 0;
    let heater = 0;
    let met = 0;
    if (ready === 'heated' && fdd > 0) {
      heaterNeed = gal * rule.heating.kWhPerGalDegreeDay * fdd;
      heater = Math.min(heaterNeed, availableToday(d, 'Electricity'));
      if (heater > 1e-9) drawToday(d, 'Electricity', heater, 'consumed');
      met = heaterNeed > 0 ? heater / heaterNeed : 0;
    }
    // A fully powered heater reverses the day's freezing; partial power slows it.
    const change = ready === 'heated' && fdd > 0 ? fdd * (1 - 2 * met) : fdd;
    const threshold = freezeThreshold(catalog, inst);
    // Once frozen through, more cold adds little: frost is capped at 1.5× the tolerance.
    w.frost = Math.min(FROST_CAP * threshold, Math.max(0, w.frost + change));
    if (w.frozen === undefined && w.frost >= threshold) {
      const rawCap = Math.max(0, (d.capAvail.get('Water storage') ?? 0) - frozenCapacity(plans, d.instances)) + buffer;
      const lock = rawCap > 0 ? (d.stocks[RAW_WATER] ?? 0) * Math.min(1, gal / rawCap) : 0;
      d.stocks[RAW_WATER] = (d.stocks[RAW_WATER] ?? 0) - lock;
      d.res[RAW_WATER]!.frozen = (d.res[RAW_WATER]!.frozen ?? 0) + lock;
      w.frozen = lock;
      events.push({ kind: 'winter-water', absDay: d.absDay, instanceId: inst.id, event: 'froze', gal: lock });
    } else if (w.frozen !== undefined && w.frost <= 0) {
      const gal = w.frozen;
      d.stocks[RAW_WATER] = (d.stocks[RAW_WATER] ?? 0) + gal;
      d.res[RAW_WATER]!.frozen = (d.res[RAW_WATER]!.frozen ?? 0) - gal;
      delete w.frozen;
      events.push({ kind: 'winter-water', absDay: d.absDay, instanceId: inst.id, event: 'thawed', gal });
    }
    d.instances[k] = inst;
    if (w.frost > 0 || w.frozen !== undefined || heaterNeed > 0)
      records.push({
        instanceId: inst.id,
        meanF: temp,
        frost: w.frost,
        threshold,
        frozen: w.frozen ?? null,
        heaterKWh: heater,
        heaterNeedKWh: heaterNeed,
      });
  }
  return { records, events };
}

/** Card model for an outdoor tank: every number comes from here. */
export function winterView(state: GameState, catalog: Catalog, id: string) {
  const rule = catalog.winterStorage;
  const inst = state.instances.find((i) => i.id === id);
  if (!state.settings.storagePools || !rule || !inst || !tankRule(catalog, inst.systemId)) return null;
  const plans = getPlans(catalog, state.site);
  const w = inst.winter ?? { frost: 0 };
  const today = state.ledgers.at(-1)?.winter?.find((r) => r.instanceId === id) ?? null;
  const hours = w.protection === 'insulated' ? rule.insulation.hours : w.protection === 'heated' ? rule.heating.hours : 0;
  return {
    gallons: explained(tankGallons(plans, inst), 'catalog Water storage × scale'),
    protection: w.protection ?? null,
    ready: protectionReady(rule, inst),
    setup: w.protection ? { done: w.setupHours ?? 0, hours } : null,
    frost: explained(w.frost, '°F-days below freezing accumulated, less thawing days (and heater relief)'),
    threshold: explained(freezeThreshold(catalog, inst), rule.note),
    frozen: w.frozen !== undefined,
    locked: explained(w.frozen ?? 0, 'raw water locked in ice when the tank froze; released on thaw'),
    meanF: today ? explained(today.meanF, '65 °F − heating degree days + cooling degree days, yesterday') : null,
    heater: today && today.heaterNeedKWh > 0 ? { kWh: explained(today.heaterKWh, 'electricity drawn after household use'), need: explained(today.heaterNeedKWh, `gal × ${rule.heating.kWhPerGalDegreeDay} kWh × °F below freezing`) } : null,
    options: (['insulated', 'heated'] as const).map((p) => ({
      protection: p,
      cost: explained(winterizeCost(catalog, state, inst, p), p === 'insulated' ? `$${rule.insulation.cost} + $${rule.insulation.costPerGal}/gal` : 'thermostatic heater kit'),
      hours: p === 'insulated' ? rule.insulation.hours : rule.heating.hours,
    })),
  };
}
