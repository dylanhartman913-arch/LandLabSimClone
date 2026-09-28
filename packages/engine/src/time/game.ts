import type { Catalog, Site } from '@homestead/catalog';
import { getSystem } from '../catalog-index.ts';
import { climateTable } from './climate.ts';
import {
  BUY_SETUP_FRACTION,
  DEFAULT_ARRIVAL_SUPPLIES,
  DEFAULT_CONSTRUCTION_SHARE,
  DEFAULT_PARCEL_ACRES,
  DEFAULT_STARTING_CASH,
  DIY_SETUP_FRACTION,
  PERSON_NEEDS,
  REFUND_BUILDING,
  REFUND_BUILT,
  SQFT_PER_ACRE,
} from './constants.ts';
import { seedState } from './rng.ts';
import type { BuildMode, GameSettings, GameState, Instance, PersonState } from './types.ts';

export function defaultSettings(overrides: Partial<GameSettings> = {}): GameSettings {
  return {
    parcelAcres: DEFAULT_PARCEL_ACRES,
    startingCash: DEFAULT_STARTING_CASH,
    weatherMode: 'average',
    constructionShare: DEFAULT_CONSTRUCTION_SHARE,
    startingStocks: { ...DEFAULT_ARRIVAL_SUPPLIES },
    ...overrides,
  };
}

/** A new game on a site: empty parcel, starting cash, arrival supplies. */
export function initGame(
  catalog: Catalog,
  site: Site,
  settings: Partial<GameSettings> = {},
  seed = 1,
): GameState {
  const s = defaultSettings(settings);
  const stocks: Record<string, number> = {};
  for (const r of catalog.resources) if (r.class === 'Flow' && r.storable) stocks[r.name] = 0;
  for (const [k, v] of Object.entries(s.startingStocks)) {
    if (!(k in stocks)) throw new Error(`startingStocks: "${k}" is not a storable Flow resource`);
    stocks[k] = v;
  }
  return {
    schema: 'homestead.game.v1',
    seed,
    rng: seedState(seed),
    site,
    settings: s,
    calendar: { day: 0, year: 0, absDay: 0 },
    cash: s.startingCash,
    stocks,
    direct: {},
    services: {},
    lastDay: {},
    instances: [],
    nextInstanceId: 1,
    weather: climateTable(site).days[0]!,
    ledgers: [],
    pendingCash: { purchases: 0, refunds: 0 },
    flags: { short: {}, spilling: false },
  };
}

// --- Geometry --------------------------------------------------------------

/** Parcel side in feet (square parcels; 1 acre ≈ 208.7 ft). */
export function parcelSideFt(settings: Pick<GameSettings, 'parcelAcres'>): number {
  return Math.sqrt(settings.parcelAcres * SQFT_PER_ACRE);
}

/** Side of a system's square footprint in feet (0 for systems with no footprint). */
export function footprintSideFt(footprintSqft: number): number {
  return footprintSqft > 0 ? Math.sqrt(footprintSqft) : 0;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export function footprintRect(catalog: Catalog, systemId: string, x: number, y: number): Rect {
  const half = footprintSideFt(getSystem(catalog, systemId).footprintSqft) / 2;
  return { x0: x - half, y0: y - half, x1: x + half, y1: y + half };
}

function overlaps(a: Rect, b: Rect): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export type PlaceCheck = { ok: true } | { ok: false; reason: string; blockers: string[] };

/**
 * Can a system sit at (x, y)? It must fit inside the parcel and not overlap
 * another footprint on the same layer. Ground-layer plantings (pasture, food
 * forest, coppice…) may have objects on top of them; no-footprint systems
 * (people, a job, sunlight) never collide.
 */
export function canPlace(
  catalog: Catalog,
  state: GameState,
  systemId: string,
  x: number,
  y: number,
  ignoreIds: readonly string[] = [],
): PlaceCheck {
  const sys = getSystem(catalog, systemId);
  if (sys.layer === 'none') return { ok: true };
  const side = parcelSideFt(state.settings);
  const r = footprintRect(catalog, systemId, x, y);
  const eps = 1e-6;
  if (r.x0 < -eps || r.y0 < -eps || r.x1 > side + eps || r.y1 > side + eps) {
    return { ok: false, reason: `${sys.name} does not fit inside the parcel here`, blockers: [] };
  }
  const blockers: string[] = [];
  for (const inst of state.instances) {
    if (ignoreIds.includes(inst.id)) continue;
    const other = getSystem(catalog, inst.systemId);
    if (other.layer !== sys.layer) continue;
    if (overlaps(r, footprintRect(catalog, inst.systemId, inst.x, inst.y))) blockers.push(inst.id);
  }
  if (blockers.length) return { ok: false, reason: `${sys.name} overlaps another system`, blockers };
  return { ok: true };
}

function newPerson(): PersonState {
  const recent = {} as PersonState['recent'];
  const lowStreak = {} as PersonState['lowStreak'];
  for (const k of PERSON_NEEDS) {
    recent[k] = [];
    lowStreak[k] = 0;
  }
  return { recent, health: 1, lowStreak };
}

export function costFor(catalog: Catalog, systemId: string, mode: BuildMode): number {
  const s = getSystem(catalog, systemId);
  if (mode === 'prebuilt') return 0;
  if (mode === 'diy') return s.costDiy ?? s.costBuy;
  return s.costBuy;
}

export function setupHoursFor(catalog: Catalog, systemId: string, mode: BuildMode): number {
  const s = getSystem(catalog, systemId);
  if (mode === 'prebuilt') return 0;
  return (
    s.setupLaborHrs * (mode === 'diy' && s.costDiy !== undefined ? DIY_SETUP_FRACTION : BUY_SETUP_FRACTION)
  );
}

/**
 * Place a system. Buy pays the purchase cost and needs 25% of the setup hours;
 * DIY pays the DIY cost and needs all of them; prebuilt is free, active at
 * once, and already mature (for starter kits and tests). Throws if the spot is
 * invalid; call `canPlace` first in the UI.
 */
export function placeSystem(
  catalog: Catalog,
  state: GameState,
  systemId: string,
  x: number,
  y: number,
  buildMode: BuildMode,
): { state: GameState; instanceId: string } {
  const check = canPlace(catalog, state, systemId, x, y);
  if (!check.ok) throw new Error(check.reason);
  const sys = getSystem(catalog, systemId);
  const id = `i${state.nextInstanceId}`;
  const paid = costFor(catalog, systemId, buildMode);
  const hours = setupHoursFor(catalog, systemId, buildMode);
  const prebuilt = buildMode === 'prebuilt';
  const inst: Instance = {
    id,
    systemId,
    x,
    y,
    status: prebuilt ? 'active' : 'building',
    buildMode,
    paid,
    setupHoursNeeded: hours,
    setupHoursDone: 0,
    materialsDrawn: prebuilt,
    activeSince: prebuilt ? state.calendar.absDay - Math.round(sys.yearsToFullOutput * 365) : null,
    priority: sys.priorityTier,
  };
  if (sys.name === 'Human Being') inst.person = newPerson();
  return {
    instanceId: id,
    state: {
      ...state,
      cash: state.cash - paid,
      instances: [...state.instances, inst],
      nextInstanceId: state.nextInstanceId + 1,
      pendingCash: { ...state.pendingCash, purchases: state.pendingCash.purchases + paid },
    },
  };
}

export function moveSystem(
  catalog: Catalog,
  state: GameState,
  instanceId: string,
  x: number,
  y: number,
): GameState {
  const inst = state.instances.find((i) => i.id === instanceId);
  if (!inst) throw new Error(`No instance ${instanceId}`);
  const check = canPlace(catalog, state, inst.systemId, x, y, [instanceId]);
  if (!check.ok) throw new Error(check.reason);
  return { ...state, instances: state.instances.map((i) => (i.id === instanceId ? { ...i, x, y } : i)) };
}

/** Refund for removing an instance: 25% of what was paid if built, 100% if still building. */
export function refundFor(inst: Instance): number {
  return inst.paid * (inst.status === 'building' ? REFUND_BUILDING : REFUND_BUILT);
}

export function removeSystem(state: GameState, instanceId: string): GameState {
  const inst = state.instances.find((i) => i.id === instanceId);
  if (!inst) throw new Error(`No instance ${instanceId}`);
  const refund = refundFor(inst);
  return {
    ...state,
    cash: state.cash + refund,
    instances: state.instances.filter((i) => i.id !== instanceId),
    pendingCash: { ...state.pendingCash, refunds: state.pendingCash.refunds + refund },
  };
}

export function setPriority(state: GameState, instanceId: string, priority: number): GameState {
  return { ...state, instances: state.instances.map((i) => (i.id === instanceId ? { ...i, priority } : i)) };
}

/**
 * Lay out a balance-mode design on the parcel (prebuilt), for tests, the CLI,
 * and starter kits. Places systems left-to-right, top-to-bottom in rows;
 * ground-layer systems are laid from the opposite corner.
 */
export function placeDesign(
  catalog: Catalog,
  state: GameState,
  counts: Record<string, number>,
  buildMode: BuildMode = 'prebuilt',
): GameState {
  let s = state;
  const side = parcelSideFt(state.settings);
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  let gx = side;
  let gy = side;
  let gRowH = 0;
  const gap = 2;
  for (const sys of catalog.systems) {
    const n = counts[sys.id] ?? 0;
    for (let k = 0; k < n; k++) {
      const w = footprintSideFt(sys.footprintSqft);
      let x: number;
      let y: number;
      if (sys.layer === 'none') {
        x = side / 2 + (k % 5) * 3;
        y = side / 2 + Math.floor(k / 5) * 3;
      } else if (sys.layer === 'ground') {
        if (gx - w < 0) {
          gx = side;
          gy -= gRowH + gap;
          gRowH = 0;
        }
        x = gx - w / 2;
        y = gy - w / 2;
        gx -= w + gap;
        gRowH = Math.max(gRowH, w);
      } else {
        if (cx + w > side) {
          cx = 0;
          cy += rowH + gap;
          rowH = 0;
        }
        x = cx + w / 2;
        y = cy + w / 2;
        cx += w + gap;
        rowH = Math.max(rowH, w);
      }
      s = placeSystem(catalog, s, sys.id, x, y, buildMode).state;
    }
  }
  return s;
}
