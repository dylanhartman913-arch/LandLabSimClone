import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import {
  animalState,
  daylightHours,
  livestockRule,
  operational,
  placeOffspring,
  runCovers,
  type LifecycleDay,
} from './livestock.ts';
import { conditionOutput } from './maintenance.ts';
import { availableToday, drawToday } from './processing.ts';
import type { DayLedger, GameState, Instance } from './types.ts';

type HatchRecord = NonNullable<DayLedger['hatching']>[number];

function isMatureHen(catalog: Catalog, i: Instance): boolean {
  const herd = catalog.livestockInfrastructure!;
  const rule = livestockRule(catalog, i);
  return i.status === 'active' && i.systemId === herd.henSystemId && !!rule && animalState(i, rule).growthDays >= rule.matureDays;
}

function batchRule(catalog: Catalog, inst: Instance) {
  const herd = catalog.livestockInfrastructure;
  if (!herd) return null;
  if (inst.systemId === herd.incubatorId) return { kind: 'incubator' as const, eggs: herd.incubator.eggs, hatchRate: herd.incubator.hatchRate };
  if (inst.systemId === herd.nestBoxId) return { kind: 'nest' as const, eggs: herd.nestBox.eggs, hatchRate: herd.nestBox.hatchRate };
  return null;
}

/** The nearest mature hen cohort within range that is not already sitting on another clutch. */
function broodyHen(catalog: Catalog, state: GameState, nest: Instance): Instance | null {
  const herd = catalog.livestockInfrastructure!;
  const sitting = new Set(state.instances.flatMap((i) => (i.hatch?.henId ? [i.hatch.henId] : [])));
  const hens = state.instances
    .filter((i) => isMatureHen(catalog, i) && !sitting.has(i.id))
    .map((i) => ({ i, d: Math.hypot(i.x - nest.x, i.y - nest.y) }))
    .filter((h) => h.d <= herd.nestBox.rangeFt)
    .sort((a, b) => a.d - b.d);
  return hens[0]?.i ?? null;
}

function whyNotSet(catalog: Catalog, state: GameState, inst: Instance): string | null {
  const herd = catalog.livestockInfrastructure!;
  if (!state.settings.livestockLifecycle) return 'Enable Livestock lifecycle to hatch chicks.';
  if (inst.status !== 'active') return 'Finish building it first.';
  if (inst.hatch) return 'A clutch is already set.';
  if (!state.instances.some((i) => isMatureHen(catalog, i)))
    return 'Fertile eggs need a mature laying flock on the parcel.';
  if (inst.systemId === herd.nestBoxId) {
    if (daylightHours(state.site.latitude, state.calendar.day) < herd.nestBox.minDaylightHours)
      return `Hens go broody only with at least ${herd.nestBox.minDaylightHours} h of daylight.`;
    if (!broodyHen(catalog, state, inst)) return `No free mature hen within ${herd.nestBox.rangeFt} ft.`;
  }
  return null;
}

export function setHatch(catalog: Catalog, state: GameState, id: string, operation: 'set' | 'cancel'): GameState {
  const inst = state.instances.find((i) => i.id === id);
  if (!inst || !batchRule(catalog, inst)) throw new Error('Choose an incubator or nest box');
  let hatch: Instance['hatch'];
  if (operation === 'set') {
    const why = whyNotSet(catalog, state, inst);
    if (why) throw new Error(why);
    const hen = inst.systemId === catalog.livestockInfrastructure!.nestBoxId ? broodyHen(catalog, state, inst) : null;
    hatch = { eggs: 0, days: 0, missed: 0, ...(hen ? { henId: hen.id } : {}) };
  }
  return {
    ...state,
    instances: state.instances.map((i) => {
      if (i.id !== id) return i;
      const copy = { ...i };
      if (hatch) copy.hatch = hatch;
      else delete copy.hatch;
      return copy;
    }),
  };
}

/** Eggs held back from meals for clutches still waiting to be set (like seed held for planting). */
export function clutchReserve(catalog: Catalog, instances: readonly Instance[]): number {
  let eggs = 0;
  for (const i of instances) {
    if (i.status !== 'active' || i.hatch?.eggs !== 0) continue;
    eggs += batchRule(catalog, i)?.eggs ?? 0;
  }
  return eggs;
}

/**
 * Runs after the day's livestock lifecycle, so a hen culled, lost or dead today ends her clutch.
 * Eggs are set from stock only once the full clutch is on hand; each counted day then needs
 * the incubator's power and upkeep, or the hen's flock. Too many missed days lose the eggs.
 */
export function advanceHatching(
  d: LifecycleDay,
  catalog: Catalog,
  satisfaction: Map<string, number>,
  removed: ReadonlySet<string>,
): HatchRecord[] {
  const herd = catalog.livestockInfrastructure;
  const records: HatchRecord[] = [];
  if (!herd || !d.prev.settings.livestockLifecycle) return records;
  const emit = (inst: Instance, event: 'eggs-set' | 'hatch-failed' | 'born', amount: number) =>
    d.events.push({ kind: 'livestock', absDay: d.prev.calendar.absDay, instanceId: inst.id, event, amount });
  const original = d.instances.length;
  for (let index = 0; index < original; index++) {
    const inst = d.instances[index]!;
    const rule = batchRule(catalog, inst);
    if (!rule || inst.status !== 'active' || !inst.hatch || removed.has(inst.id)) continue;
    const hatch = { ...inst.hatch };
    const record: HatchRecord = { instanceId: inst.id, eggsSet: 0, counted: false, kWh: 0, hatched: 0 };
    const henGone =
      hatch.henId !== undefined &&
      (removed.has(hatch.henId) || !d.instances.some((i) => i.id === hatch.henId && i.status === 'active'));
    if (henGone) {
      if (hatch.eggs > 0) emit(inst, 'hatch-failed', hatch.eggs);
      const copy = { ...inst };
      delete copy.hatch;
      d.instances[index] = copy;
      records.push(record);
      continue;
    }
    if (hatch.eggs === 0) {
      if (availableToday(d, 'Eggs') + 1e-9 < rule.eggs) {
        records.push(record);
        continue; // waiting for a full clutch
      }
      drawToday(d, 'Eggs', rule.eggs, 'processed');
      hatch.eggs = rule.eggs;
      record.eggsSet = rule.eggs;
      emit(inst, 'eggs-set', rule.eggs);
    }
    if (hatch.days < herd.hatchDays) {
      let counts = true;
      if (rule.kind === 'incubator') {
        const sys = catalog.systems.find((s) => s.id === inst.systemId)!;
        const working = (satisfaction.get(inst.id) ?? 0) * (d.prev.settings.wearAndRepair ? conditionOutput(inst, sys) : 1);
        const kWh = herd.incubator.kWhPerDay;
        counts = working >= 0.8 - 1e-9 && availableToday(d, 'Electricity') + 1e-9 >= kWh;
        if (counts) {
          drawToday(d, 'Electricity', kWh, 'consumed');
          record.kWh = kWh;
        }
      }
      if (counts) hatch.days++;
      else hatch.missed++;
      record.counted = counts;
      if (hatch.missed > herd.maxMissedDays) {
        emit(inst, 'hatch-failed', hatch.eggs);
        const copy = { ...inst };
        delete copy.hatch;
        d.instances[index] = copy;
        records.push(record);
        continue;
      }
    }
    if (hatch.days >= herd.hatchDays) {
      const chicks = Math.floor(hatch.eggs * rule.hatchRate + 1e-9);
      const perUnit = livestockRule(catalog, { ...inst, systemId: herd.chickSystemId })!.animalsPerUnit;
      const child =
        chicks > 0 ? placeOffspring(d, catalog, removed, herd.chickSystemId, chicks / perUnit, inst) : null;
      if (chicks === 0 || child) {
        record.hatched = chicks;
        if (child) emit(child, 'born', chicks);
        const copy = { ...inst };
        delete copy.hatch;
        d.instances[index] = copy;
        records.push(record);
        continue;
      } // otherwise wait for free parcel room, without drawing more power
    }
    d.instances[index] = { ...inst, hatch };
    records.push(record);
  }
  return records;
}

/** LL-43: the pasture a paddock kit sits on, and the yield multiplier its moving labor earned. */
export function paddockHost(catalog: Catalog, state: Pick<GameState, 'instances'>, kit: Instance): Instance | null {
  const herd = catalog.livestockInfrastructure;
  if (!herd || kit.systemId !== herd.paddockId) return null;
  return (
    state.instances.find((p) => {
      if (p.status !== 'active' || !herd.pastureIds.includes(p.systemId)) return false;
      const half = Math.sqrt(catalog.systems.find((s) => s.id === p.systemId)!.footprintSqft) / 2;
      return Math.abs(kit.x - p.x) <= half + 1e-6 && Math.abs(kit.y - p.y) <= half + 1e-6;
    }) ?? null
  );
}

/** Yesterday's satisfaction of a kit, read from its own solo group (set in computeSpatial). */
export function paddockWork(state: Pick<GameState, 'lastDay'>, kit: Instance): number {
  return state.lastDay[`${kit.systemId}|${kit.priority}|solo:${kit.id}`]?.sat ?? 0;
}

export function paddockFactor(catalog: Catalog, work: number, condition: number): number {
  return 1 + catalog.livestockInfrastructure!.paddock.bonus * Math.max(0, Math.min(1, work)) * condition;
}

export function husbandryView(state: GameState, catalog: Catalog, id: string) {
  const herd = catalog.livestockInfrastructure;
  const inst = state.instances.find((i) => i.id === id);
  if (!herd || !inst) return null;
  const last = state.ledgers.at(-1)?.hatching?.find((r) => r.instanceId === id) ?? null;
  const rule = batchRule(catalog, inst);
  if (rule) {
    const h = inst.hatch;
    return {
      kind: rule.kind,
      text:
        rule.kind === 'incubator'
          ? `Sets ${rule.eggs} eggs from stock. Each of ${herd.hatchDays} days needs ${herd.incubator.kWhPerDay} kWh and its upkeep; more than ${herd.maxMissedDays} missed days loses the eggs.`
          : `Sets ${rule.eggs} eggs under the nearest free mature hen within ${herd.nestBox.rangeFt} ft. She stops laying while she sits. Hens go broody with at least ${herd.nestBox.minDaylightHours} h of daylight.`,
      hatchRate: explained(rule.hatchRate, herd.note),
      status: !h ? null : h.eggs === 0 ? `Waiting for ${rule.eggs} eggs in stock.` : null,
      daysLeft: h && h.eggs > 0 ? explained(Math.max(0, herd.hatchDays - h.days), 'counted days left; a missed day does not count') : null,
      missed: h && h.eggs > 0 ? explained(h.missed, `missed days so far; more than ${herd.maxMissedDays} loses the clutch`) : null,
      blocked: h ? null : whyNotSet(catalog, state, inst),
      set: !!h,
      lastKWh: last ? explained(last.kWh, 'incubator electricity drawn yesterday') : null,
      protectedBirds: null,
      paddock: null,
    };
  }
  if (inst.systemId === herd.runId) {
    const covered = state.instances
      .filter((c) => runCovers(state, catalog, c, (i) => operational(state, catalog, i)))
      .reduce((n, c) => n + livestockRule(catalog, c)!.animalsPerUnit * (c.scale ?? 1), 0);
    return {
      kind: 'run' as const,
      text: `A staffed run protects whole poultry cohorts within ${herd.run.rangeFt} ft from predator losses, up to ${herd.run.birds} birds per run. Requires Livestock lifecycle.`,
      hatchRate: null, status: null, daysLeft: null, missed: null, blocked: null, set: false, lastKWh: null,
      protectedBirds: explained(covered, 'birds in whole cohorts covered by working runs (80% upkeep met yesterday)'),
      paddock: null,
    };
  }
  if (inst.systemId === herd.paddockId) {
    const host = paddockHost(catalog, state, inst);
    const work = paddockWork(state, inst);
    const sys = catalog.systems.find((s) => s.id === inst.systemId)!;
    return {
      kind: 'paddock' as const,
      text: host
        ? `Rotating this pasture raises its ${herd.paddock.resources.join(' and ')} by up to ${(herd.paddock.bonus * 100).toFixed(0)}%, in proportion to yesterday's moving labor.`
        : 'Place it on a pasture to rotate grazing there.',
      hatchRate: null, status: null, daysLeft: null, missed: null, blocked: null, set: false, lastKWh: null,
      protectedBirds: null,
      paddock: host
        ? explained(
            paddockFactor(catalog, work, state.settings.wearAndRepair ? conditionOutput(inst, sys) : 1),
            'pasture hay and green biomass multiplier: 1 + bonus × yesterday’s moving labor met × condition',
          )
        : null,
    };
  }
  return null;
}

