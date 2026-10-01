import type { Catalog, Site, System } from '@homestead/catalog';
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
    calendar: { day: s.startDay ?? 0, year: 0, absDay: 0 },
    cash: s.startingCash,
    stocks,
    direct: {},
    services: {},
    lastDay: {},
    instances: [],
    nextInstanceId: 1,
    weather: climateTable(site).days[s.startDay ?? 0]!,
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
  opts: { scale?: number } = {},
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
  if (opts.scale !== undefined && opts.scale !== 1) inst.scale = opts.scale;
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
 * Lay a design out automatically (prebuilt by default): objects in rows from the north-west
 * corner, ground plantings from the south-east, systems with no footprint at the centre. Heat
 * and cooling producers that must reach a shelter (stoves, fans, shade trees) are placed beside
 * the first shelter with room, so a count-only design is laid out sensibly (G11).
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
  const res = new Map(catalog.resources.map((r) => [r.name, r]));
  const outputs = new Map<string, Set<string>>();
  for (const f of catalog.flows) {
    if (f.direction !== 'out') continue;
    const set = outputs.get(f.systemId) ?? new Set<string>();
    set.add(f.resource);
    outputs.set(f.systemId, set);
  }
  const isShelter = (id: string) => outputs.get(id)?.has('Shelter') ?? false;
  const attachRadius = (sys: System): number | null => {
    if (sys.layer !== 'object' || sys.outdoor || isShelter(sys.id)) return null;
    let r: number | null = null;
    for (const o of outputs.get(sys.id) ?? []) {
      const m = res.get(o);
      if (m?.deliversTo === 'shelter') r = r === null ? m.deliveryRadiusFt : Math.min(r, m.deliveryRadiusFt);
    }
    return r;
  };
  const attach: System[] = [];
  const shelters: { x: number; y: number; half: number }[] = [];
  for (const sys of catalog.systems) {
    const n = counts[sys.id] ?? 0;
    if (n > 0 && attachRadius(sys) !== null) {
      for (let k = 0; k < n; k++) attach.push(sys);
      continue;
    }
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
      if (isShelter(sys.id)) shelters.push({ x, y, half: w / 2 });
    }
  }
  // Stoves, fans, and shade go beside a shelter, ring by ring outward.
  for (const sys of attach) {
    const w = footprintSideFt(sys.footprintSqft);
    const radius = attachRadius(sys)!;
    let spot: { x: number; y: number } | null = null;
    for (const sh of shelters) {
      for (let ring = 1; ring <= radius + w && !spot; ring += 2) {
        const d = sh.half + w / 2 + ring;
        const steps = Math.max(8, Math.ceil((8 * d) / Math.max(1, w)));
        for (let k = 0; k < steps && !spot; k++) {
          // Walk the square ring around the shelter.
          const t = (k / steps) * 8;
          const seg = Math.floor(t);
          const f = t - seg;
          const pts: [number, number][] = [
            [-d + 2 * d * f, -d],
            [d, -d + 2 * d * f],
            [d - 2 * d * f, d],
            [-d, d - 2 * d * f],
          ];
          const [ox, oy] = pts[Math.floor(seg / 2)]!;
          const x = sh.x + ox;
          const y = sh.y + oy;
          if (canPlace(catalog, s, sys.id, x, y).ok) spot = { x, y };
        }
      }
      if (spot) break;
    }
    if (!spot) {
      if (cx + w > side) {
        cx = 0;
        cy += rowH + gap;
        rowH = 0;
      }
      spot = { x: cx + w / 2, y: cy + w / 2 };
      cx += w + gap;
      rowH = Math.max(rowH, w);
    }
    s = placeSystem(catalog, s, sys.id, spot.x, spot.y, buildMode).state;
  }
  return s;
}

// --- Exact inverses for the UI's undo stack ----------------------------------

/** Put an instance back exactly as it was (undo of a removal, redo of a placement). */
export function insertInstance(
  state: GameState,
  inst: Instance,
  cashDelta: number,
  index?: number,
): GameState {
  if (state.instances.some((i) => i.id === inst.id)) throw new Error(`Instance ${inst.id} already exists`);
  const instances = state.instances.slice();
  instances.splice(index ?? instances.length, 0, inst);
  const n = Number(inst.id.slice(1));
  return {
    ...state,
    instances,
    cash: state.cash + cashDelta,
    nextInstanceId: Math.max(state.nextInstanceId, Number.isFinite(n) ? n + 1 : state.nextInstanceId),
    pendingCash: adjustPending(state.pendingCash, cashDelta),
  };
}

/** Take an instance out with an explicit cash adjustment (undo of a placement: the full price back). */
export function deleteInstance(state: GameState, instanceId: string, cashDelta: number): GameState {
  if (!state.instances.some((i) => i.id === instanceId)) throw new Error(`No instance ${instanceId}`);
  return {
    ...state,
    instances: state.instances.filter((i) => i.id !== instanceId),
    cash: state.cash + cashDelta,
    pendingCash: adjustPending(state.pendingCash, cashDelta),
  };
}

function adjustPending(p: GameState['pendingCash'], cashDelta: number): GameState['pendingCash'] {
  return cashDelta >= 0
    ? { ...p, refunds: p.refunds + cashDelta }
    : { ...p, purchases: p.purchases - cashDelta };
}

/** Set several positions at once (a group move the UI has already validated as a whole). */
export function moveInstances(
  state: GameState,
  moves: readonly { id: string; x: number; y: number }[],
): GameState {
  const byId = new Map(moves.map((m) => [m.id, m]));
  return {
    ...state,
    instances: state.instances.map((i) => {
      const m = byId.get(i.id);
      return m ? { ...i, x: m.x, y: m.y } : i;
    }),
  };
}

/** Link a consumer to a provider for an assigned capacity (null returns it to nearest-with-room). */
export function setLink(
  state: GameState,
  instanceId: string,
  resource: string,
  providerId: string | null,
): GameState {
  return {
    ...state,
    instances: state.instances.map((i) => {
      if (i.id !== instanceId) return i;
      const links = { ...(i.links ?? {}) };
      if (providerId) links[resource] = providerId;
      else delete links[resource];
      return { ...i, links };
    }),
  };
}

// --- Market (G12) -------------------------------------------------------------

function marketOf(state: GameState): NonNullable<GameState['market']> {
  return state.market ?? { orders: [], standing: [] };
}

function assertSold(catalog: Catalog, resource: string): void {
  const r = catalog.resources.find((x) => x.name === resource);
  if (!r) throw new Error(`Unknown resource ${resource}`);
  if (r.marketPrice === null || !r.marketAvailable) throw new Error(`The market doesn't sell ${resource}`);
}

/** Order something for the next market trip (tomorrow morning). */
export function buyAtMarket(catalog: Catalog, state: GameState, resource: string, amount: number): GameState {
  assertSold(catalog, resource);
  if (!(amount > 0)) throw new Error('Buy a positive amount');
  const m = marketOf(state);
  return { ...state, market: { ...m, orders: [...m.orders, { resource, amount }] } };
}

/**
 * Keep a stock topped up: whenever it falls below `keepAbove`, the next trip buys up to
 * `orderUpTo` (default 1.5 × keepAbove). `keepAbove` 0 removes the standing order.
 */
export function setStandingOrder(
  catalog: Catalog,
  state: GameState,
  resource: string,
  keepAbove: number,
  orderUpTo = keepAbove * 1.5,
): GameState {
  assertSold(catalog, resource);
  const m = marketOf(state);
  const standing = m.standing.filter((s) => s.resource !== resource);
  if (keepAbove > 0) standing.push({ resource, keepAbove, orderUpTo: Math.max(orderUpTo, keepAbove) });
  return { ...state, market: { ...m, standing } };
}
