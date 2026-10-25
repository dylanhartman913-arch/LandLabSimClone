import type { Catalog, FertilityRule } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { getSystem } from '../catalog-index.ts';
import { getPlans, type Plans } from './plans.ts';
import { availableToday, drawToday, type ProcessingDay } from './processing.ts';
import type { DayLedger, GameState, Instance } from './types.ts';

/**
 * LL-35 (`soilFertility`): each garden keeps a fertility level. Cropping draws it down in proportion
 * to the realized harvest; compost at the catalog's own rate replaces exactly that draw; manure and
 * a nearby clover cover crop add more. Yield follows fertility.
 */
export type FertilityRecord = NonNullable<DayLedger['fertility']>[number];

export function gardenRule(catalog: Catalog, systemId: string) {
  return catalog.soilFertility?.gardens.find((g) => g.systemId === systemId) ?? null;
}

export function fertilityOf(catalog: Catalog, inst: Instance): number {
  return inst.fertility ?? gardenRule(catalog, inst.systemId)?.initial ?? 1;
}

/** Share of catalog yield at a fertility level: floor + (1 − floor) × fertility, capped at 110%. */
export function yieldFactor(rule: FertilityRule, fertility: number): number {
  return Math.min(1.1, rule.floorYield + (1 - rule.floorYield) * Math.max(0, fertility));
}

/** The catalog's compost a year for one instance (per season or yearly). */
export function compostPerYear(plans: Plans, inst: Instance): number {
  const f = plans.bySystem.get(inst.systemId)!.inputs.find((i) => i.resource === 'Compost');
  return (f?.qty ?? 0) * (inst.scale ?? 1);
}

/** Outputs that follow fertility: harvests and by-products, not wellbeing or capacities. */
export function followsFertility(resource: string, isCapacity: boolean): boolean {
  return !isCapacity && resource !== 'Wellbeing';
}

const dist = (a: Instance, b: Instance) => Math.hypot(a.x - b.x, a.y - b.y);

/** Share of each garden a working cover crop covers (its area shared by gardens in range), capped at 1. */
export function coverShares(catalog: Catalog, instances: readonly Instance[], working: (id: string) => boolean): Map<string, number> {
  const rule = catalog.soilFertility!;
  const out = new Map<string, number>();
  const gardens = instances.filter((i) => i.status === 'active' && gardenRule(catalog, i.systemId));
  const area = (i: Instance) => getSystem(catalog, i.systemId).footprintSqft * (i.scale ?? 1);
  for (const c of instances) {
    if (c.status !== 'active' || c.systemId !== rule.cover.systemId || !working(c.id)) continue;
    const near = gardens.filter((g) => dist(g, c) <= rule.cover.rangeFt);
    const total = near.reduce((a, g) => a + area(g), 0);
    if (total <= 0) continue;
    const share = Math.min(1, area(c) / total);
    for (const g of near) out.set(g.id, Math.min(1, (out.get(g.id) ?? 0) + share));
  }
  return out;
}

/** One garden's day, after production. Mutates stocks (manure) through the shared day accounting. */
export function advanceGarden(
  d: ProcessingDay,
  catalog: Catalog,
  inst: Instance,
  day: { growing: boolean; seasonDays: number; sat: number; compostRequested: number; compostReceived: number; cover: number },
): { inst: Instance; record: FertilityRecord } {
  const rule = catalog.soilFertility!;
  const garden = gardenRule(catalog, inst.systemId)!;
  const plans = getPlans(catalog, d.prev.site);
  const f = fertilityOf(catalog, inst);
  const perYear = compostPerYear(plans, inst);
  // Manure covers what compost did not, at its compost equivalent.
  let manure = 0;
  // Only for the share of the garden that ran today (compost use already follows it).
  const gap = Math.max(0, day.compostRequested * day.sat - day.compostReceived);
  if (gap > 1e-9 && rule.manureCompostEquivalent > 0) {
    manure = Math.min(availableToday(d, 'Manure'), gap / rule.manureCompostEquivalent);
    if (manure > 1e-9) drawToday(d, 'Manure', manure, 'consumed');
    else manure = 0;
  }
  const compostEq = day.compostReceived + manure * rule.manureCompostEquivalent;
  const fed = perYear > 0 ? (garden.drawPerYear * compostEq) / perYear : 0;
  const days = Math.max(1, day.seasonDays);
  const draw = day.growing ? (garden.drawPerYear / days) * day.sat * yieldFactor(rule, f) : 0;
  const cover = day.growing ? (rule.cover.gainPerYear / days) * day.cover : 0;
  const next = Math.min(rule.maxFertility, Math.max(0, f + fed + cover - draw));
  return {
    inst: { ...inst, fertility: next },
    record: { instanceId: inst.id, fertility: next, compost: day.compostReceived, manure, cover, fed, draw },
  };
}

/** Card model for a garden: every number comes from the engine. */
export function fertilityView(state: GameState, catalog: Catalog, id: string) {
  const rule = catalog.soilFertility;
  const inst = state.instances.find((i) => i.id === id);
  const garden = inst && gardenRule(catalog, inst.systemId);
  if (!state.settings.soilFertility || !rule || !inst || !garden) return null;
  const f = fertilityOf(catalog, inst);
  const week = state.ledgers.slice(-7).flatMap((l) => (l.fertility ?? []).filter((r) => r.instanceId === id));
  const total = (k: 'compost' | 'manure' | 'cover' | 'fed' | 'draw') => week.reduce((a, r) => a + r[k], 0);
  return {
    fertility: explained(f, rule.note),
    yield: explained(yieldFactor(rule, f), `${rule.floorYield} + ${1 - rule.floorYield} × fertility, capped at 1.1`),
    compostPerYear: explained(compostPerYear(getPlans(catalog, state.site), inst), 'catalog compost a year: replaces exactly a full year of cropping'),
    drawPerYear: explained(garden.drawPerYear, 'fertility a full year of cropping removes'),
    week: {
      compost: explained(total('compost'), 'compost received, last 7 days'),
      manure: explained(total('manure'), 'manure worked in, last 7 days'),
      gained: explained(total('fed') + total('cover'), 'fertility added by compost, manure and cover crop, last 7 days'),
      drawn: explained(total('draw'), 'fertility removed by cropping, last 7 days'),
    },
  };
}
