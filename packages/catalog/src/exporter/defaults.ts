import type { InputRole, Period, ResourceClass, StorageRule, Timing } from '../schema.ts';

/**
 * Default rules for engine-only fields the spreadsheet does not carry yet.
 * Each rule is documented in docs/CATALOG.md; overrides in
 * data/catalog_overrides.json win over these.
 */

export const DEFAULT_BOOST_WEIGHT = 0.15;

export function defaultInputRole(
  resource: string,
  cls: ResourceClass,
  systemName: string,
): { role: InputRole; boostWeight?: number } {
  if (cls === 'Capacity') return { role: 'capacity' };
  // People and shelter comfort are needs: shortfalls are tracked and hurt health, but never
  // switch the consumer off (an unheated tent is still a tent).
  if (systemName === 'Human Being') return { role: 'need' };
  if (resource === 'Heat' || resource === 'Cooling') return { role: 'need' };
  if (resource === 'Labor') return { role: 'required' };
  switch (cls) {
    case 'Service':
      return { role: 'boost', boostWeight: DEFAULT_BOOST_WEIGHT };
    case 'Ambient':
      return { role: 'ambient' };
    default:
      return { role: 'required' };
  }
}

export function defaultPriorityTier(name: string, categories: string[]): number {
  if (name === 'Human Being') return 0;
  if (categories.some((c) => c === 'Livestock' || c === 'Fowl' || c === 'Insects')) return 1;
  return 2;
}

/** Plants and Biomass trees 5, food forest 7, coppice 3, everything else 0. */
export function defaultYearsToFullOutput(name: string, categories: string[]): number {
  const n = name.toLowerCase();
  if (n.includes('food forest')) return 7;
  if (n.includes('coppice')) return 3;
  const woody = /\b(tree|bush|hedgerow)\b/.test(n);
  if (woody && categories.some((c) => c === 'Plants' || c === 'Biomass')) return 5;
  return 0;
}

const WOOD = new Set(['Woody biomass', 'Wood chips']);
const FUEL = new Set(['Woody biomass', 'Wood chips', 'Wood pellets', 'Propane']);

/** What the timing rule needs to know about the flow's system. */
export interface TimingContext {
  systemName: string;
  categories: string[];
  /** Resources this system outputs. */
  outputs: Set<string>;
  /** True when the resource belongs to the food family (feeds the Food checklist row). */
  isFood: (resource: string) => boolean;
}

/**
 * Timing of a flow within the year (time mode only). Every shape keeps the
 * annual total equal to the balance-mode weekly average × 365/7.
 * - Yearly outputs are harvests: wood weeks 44–48, honey 30–35, everything else (fruit, nuts, leaf litter) 34–43.
 * - Yearly inputs (orchard compost) are applied in spring, weeks 12–16.
 * - Per-season flows are spread over the growing season.
 * - Heat outputs follow heating degree-days, Cooling outputs cooling degree-days. Fuel for a
 *   heating-only system (category Heating, not Cooking) follows HDD; power for a cooling-only
 *   system follows CDD.
 * - Garden and Plants systems irrigate and yield weekly flows only in the growing season
 *   (greenhouses and cold frames excepted).
 * - Everything else is steady.
 */
export function defaultTiming(
  period: Period,
  direction: 'in' | 'out',
  resource: string,
  ctx: TimingContext,
): Timing {
  if (period === 'Yearly') {
    if (direction === 'in') return { kind: 'window', startWeek: 12, endWeek: 16 };
    if (WOOD.has(resource)) return { kind: 'window', startWeek: 44, endWeek: 48 };
    if (resource === 'Honey') return { kind: 'window', startWeek: 30, endWeek: 35 };
    return { kind: 'window', startWeek: 34, endWeek: 43 };
  }
  if (period === 'Per season') return { kind: 'growing-season' };
  if (period !== 'Weekly' && period !== 'Daily' && period !== 'Monthly') return { kind: 'steady' };
  if (direction === 'out' && resource === 'Heat') return { kind: 'heating' };
  if (direction === 'out' && resource === 'Cooling') return { kind: 'cooling' };
  const heatingOnly = ctx.categories.includes('Heating') && !ctx.categories.includes('Cooking');
  if (direction === 'in' && FUEL.has(resource) && heatingOnly && ctx.outputs.has('Heat'))
    return { kind: 'heating' };
  const coolingOnly =
    ctx.outputs.has('Cooling') && !ctx.outputs.has('Heat') && ctx.categories.includes('Cooling');
  if (direction === 'in' && resource === 'Electricity' && coolingOnly) return { kind: 'cooling' };
  const garden = ctx.categories.includes('Garden') || ctx.categories.includes('Plants');
  const protectedBed = /greenhouse|cold frame/i.test(ctx.systemName);
  if (garden && !protectedBed) {
    if (direction === 'in' && resource === 'Water') return { kind: 'growing-season' };
    if (direction === 'out' && ctx.isFood(resource)) return { kind: 'growing-season' };
  }
  return { kind: 'steady' };
}

/** Daytime loads can run straight off solar: half of electricity output needs no battery. */
export const DEFAULT_DIRECT_USE: Record<string, number> = { Electricity: 0.5 };

/** Services that cannot be kept: unused supply is lost at the end of the day. */
export const NON_STORABLE = new Set([
  'Heat',
  'Cooling',
  'Cooking fuel',
  'Transportation',
  'Sanitation',
  'Labor',
]);

/** Large plantings and land systems that other systems may sit on. */
export function defaultLayer(footprintSqft: number, categories: string[]): 'none' | 'ground' | 'object' {
  if (footprintSqft <= 0) return 'none';
  const groundish = ['Land', 'Biomass', 'Plants', 'Biodiversity', 'Garden', 'Food System'];
  if (footprintSqft >= 1000 && categories.some((c) => groundish.includes(c))) return 'ground';
  return 'object';
}

/** Fraction of a perishable stock lost per week when not in cold/dry storage. */
export const DEFAULT_SPOIL_PER_WEEK: Record<string, number> = {
  'Vegetables fruit fiber herbs': 0.1,
  Eggs: 0.03,
  Milk: 0.3,
  Meat: 0.2,
  Fish: 0.3,
  Mushrooms: 0.25,
  'Root crops': 0.02,
  Grain: 0.002,
  Nuts: 0.002,
  Honey: 0.002,
};

/**
 * Units of each food that fit in one cubic foot of Food storage. These are
 * rough packing densities (the Food storage capacity is in cu ft).
 */
export const FOOD_UNITS_PER_CUFT: Record<string, number> = {
  Food: 48000, // kcal of shelf-stable food: ~30 lb/cu ft × ~1,600 kcal/lb
  'Vegetables fruit fiber herbs': 20, // lbs
  'Root crops': 35, // lbs
  Grain: 45, // lbs
  Eggs: 120, // eggs (cartons)
  Honey: 80, // lbs
  Meat: 40, // lbs (frozen)
  Milk: 7.5, // gal
  Fish: 40, // lbs (frozen)
  Nuts: 35, // lbs
  Mushrooms: 10, // lbs
};

export function defaultStorage(resource: string, needsRow: string | undefined): StorageRule | null {
  if (resource === 'Water' || resource === 'Drinking water') {
    return { capacityResource: 'Water storage', buffer: 50, unitsPerCapacityUnit: 1 };
  }
  if (resource === 'Electricity') {
    return { capacityResource: 'Battery storage', buffer: 0, unitsPerCapacityUnit: 1 };
  }
  if (needsRow === 'Food') {
    const density = FOOD_UNITS_PER_CUFT[resource];
    if (density === undefined) return null;
    return { capacityResource: 'Food storage', buffer: 10, unitsPerCapacityUnit: density };
  }
  return null;
}
