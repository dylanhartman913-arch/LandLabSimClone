import type { ResourceNode, Site } from '@homestead/catalog';
import { monthOfDay } from './calendar.ts';
import { parcelSideFt } from './game.ts';
import type { DayLedger, GameSettings, GameState } from './types.ts';
import type { YearWeather } from './weather.ts';

/**
 * Jobs people can spend labor on (G14). Labor goes to priority 1 first, then 2… and
 * proportionally within a priority; an optional weekly cap limits a job's hours.
 */
export type JobId =
  | 'gather-water'
  | 'gather-wood'
  | 'gather-food'
  | 'gather-soil'
  | 'gather-carbon'
  | 'construction'
  | 'upkeep';

export const JOBS: { id: JobId; label: string; defaultPriority: number }[] = [
  { id: 'gather-water', label: 'Fetch water', defaultPriority: 1 },
  { id: 'gather-wood', label: 'Gather firewood', defaultPriority: 1 },
  { id: 'gather-food', label: 'Forage greens and berries', defaultPriority: 1 },
  { id: 'construction', label: 'Build', defaultPriority: 2 },
  { id: 'upkeep', label: 'Look after systems', defaultPriority: 3 },
  { id: 'gather-soil', label: 'Dig clay and soil', defaultPriority: 4 },
  { id: 'gather-carbon', label: 'Rake leaf litter', defaultPriority: 4 },
];

/** Which job gathers each node type. */
export const NODE_JOB: Record<ResourceNode['type'], JobId> = {
  deadfall: 'gather-wood',
  creek: 'gather-water',
  spring: 'gather-water',
  'rain-pools': 'gather-water',
  'wild-greens': 'gather-food',
  'berry-thicket': 'gather-food',
  'clay-bank': 'gather-soil',
  'leaf-litter': 'gather-carbon',
};

export const NODE_LABEL: Record<ResourceNode['type'], string> = {
  deadfall: 'Deadfall',
  creek: 'Creek',
  spring: 'Spring',
  'rain-pools': 'Rain pools',
  'wild-greens': 'Wild greens',
  'berry-thicket': 'Berry thicket',
  'clay-bank': 'Clay bank',
  'leaf-litter': 'Leaf litter',
};

/** Walking: one minute per 50 ft each way, per trip; a trip is one hour of work at the node. */
export const WALK_MIN_PER_50FT = 1;
export const GATHER_TRIP_HOURS = 1;
/** Boiling untreated water: an hour of cooking fuel boils 4 gallons, and minding it takes 0.05 h a gallon. */
export const BOIL_GAL_PER_FUEL_HOUR = 4;
export const BOIL_LABOR_PER_GAL = 0.05;
/** In a dry real-weather year a creek or spring yields this share of normal at worst. */
export const DROUGHT_FLOOR = 0.2;

export function jobPriority(settings: GameSettings, job: JobId): number {
  return settings.work?.priorities?.[job] ?? JOBS.find((j) => j.id === job)!.defaultPriority;
}

export function jobCap(settings: GameSettings, job: JobId): number | null {
  const c = settings.work?.caps?.[job];
  return c === undefined || c === null ? null : c;
}

/** Hours worked on a job over the last `days` ledgers. */
export function jobHours(ledgers: readonly DayLedger[], job: JobId, days = 7): number {
  let h = 0;
  for (const l of ledgers.slice(-days)) h += l.labor.byJob?.[job] ?? 0;
  return h;
}

/** Where the household lives (the first shelter), or the parcel's centre. */
export function homeOf(state: GameState, shelterIds: ReadonlySet<string>): { x: number; y: number } {
  const sh = state.instances.find((i) => shelterIds.has(i.systemId) && i.status === 'active');
  if (sh) return { x: sh.x, y: sh.y };
  const side = parcelSideFt(state.settings);
  return { x: side / 2, y: side / 2 };
}

export function nodePosition(state: GameState, n: ResourceNode): { x: number; y: number } {
  const side = parcelSideFt(state.settings);
  return { x: n.x * side, y: n.y * side };
}

/** Units at a node now. Untouched nodes are full, except rain pools, which follow recent rain. */
export function nodeStockOf(state: GameState, n: ResourceNode): number {
  const tracked = state.nodeStock?.[n.id];
  if (tracked !== undefined) return tracked;
  if (n.stock === null) return Infinity;
  if (n.rainFill > 0) {
    let s = 0;
    for (const l of state.ledgers.slice(-10)) s = Math.min(n.maxStock ?? Infinity, s * (1 - n.evaporatePerDay) + l.weather.precipIn * n.rainFill);
    return s;
  }
  return n.stock;
}

export function inSeason(n: ResourceNode, day: number): boolean {
  return n.months.includes(monthOfDay(day) + 1);
}

/** Yield per hour of work at the node today (a dry year starves creeks and springs). */
export function nodeYield(n: ResourceNode, yw: YearWeather | undefined, mode: GameSettings['weatherMode']): number {
  if (!n.droughtSensitive || mode !== 'real' || !yw) return n.yieldPerHour;
  return n.yieldPerHour * Math.max(DROUGHT_FLOOR, Math.min(1, yw.precipMult));
}

/** Walking hours per hour of work for a node `dist` feet away. */
export function walkPerTrip(distFt: number): number {
  return (2 * (distFt / 50) * WALK_MIN_PER_50FT) / 60;
}

/** Daily regrowth (in season), rain refills, and evaporation for nodes someone has worked. */
export function regrowNodes(site: Site, stocks: Record<string, number> | undefined, day: number, precipIn: number): Record<string, number> | undefined {
  if (!stocks) return stocks;
  const out: Record<string, number> = { ...stocks };
  for (const n of site.nodes) {
    const cur = out[n.id];
    if (cur === undefined || n.stock === null) continue;
    let s = cur;
    if (n.rainFill > 0) s = s * (1 - n.evaporatePerDay) + precipIn * n.rainFill;
    if (inSeason(n, day)) s += n.regrowPerDay;
    out[n.id] = Math.min(n.maxStock ?? Infinity, s);
  }
  return out;
}
