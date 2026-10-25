import { setShelter, closeShelter } from './time/occupancy.ts';
import { manageLivestock } from './time/livestock.ts';
import { setHatch } from './time/husbandry.ts';
import { setPreservation } from './time/preservation.ts';
import { releaseFrozen, setWinterProtection } from './time/storage.ts';
import { activateFinance, manageFinance } from './time/finance.ts';
import { setRole } from './time/household.ts';
import { serviceSystem } from './time/maintenance.ts';
import { queueTrade } from './time/trade.ts';
import { getSite, getStart, type Catalog, type Difficulty } from '@homestead/catalog';
import { gameFromStart } from './time/start.ts';
import { hireConstruction } from './time/recovery.ts';
import { digest } from './digest.ts';
import {
  buyAtMarket,
  deleteInstance,
  initGame,
  insertInstance,
  moveInstances,
  moveSystem,
  placeSystem,
  removeSystem,
  setLink,
  setPriority,
  setStandingOrder,
} from './time/game.ts';
import { stepDays } from './time/step.ts';
import type { BuildMode, GameSettings, GameState, Instance } from './time/types.ts';

/** How a game began: enough to rebuild it exactly. */
export interface GameInit {
  siteId: string;
  seed: number;
  settings: Partial<GameSettings>;
  /** Began from a start config (G15): its id, difficulty, and household. `settings` are applied on top. */
  start?: { id: string; difficulty: Difficulty; household: number };
}

/**
 * One state-changing operation between days. `at` is the absolute day on which
 * it was applied (before that day was stepped). Undo and redo are logged as the
 * operations they perform, so replay never needs the undo stack.
 */
export type Action = { at: number } & (
  | { kind: 'place'; systemId: string; x: number; y: number; mode: BuildMode; id: string; scale?: number }
  | { kind: 'assignShelter'; id: string; shelterId: string | null }
  | { kind: 'closeShelter'; id: string; closed: boolean }
  | { kind: 'preserve'; id: string; resource: string | null; keep: number }
  | { kind: 'livestock'; id: string; operation: 'breed' | 'cull' | 'cancel' }
  | { kind: 'hatch'; id: string; operation: 'set' | 'cancel' }
  | { kind: 'winterize'; id: string; protection: 'insulated' | 'heated' | null }
  | { kind: 'finance'; operation: 'borrow' | 'repay' | 'insurance' | 'reserve'; amount: number }
  | { kind: 'role'; id: string; role: 'adult' | 'child' | 'elder' }
  | { kind: 'service'; id: string; replace: boolean }
  | { kind: 'sell'; resource: string; amount: number; keep: number; receive?: string }
  | { kind: 'remove'; id: string }
  | { kind: 'hireConstruction'; id: string }
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'moveMany'; moves: { id: string; x: number; y: number }[] }
  | { kind: 'priority'; id: string; priority: number }
  | { kind: 'link'; id: string; resource: string; providerId: string | null }
  | { kind: 'insert'; instance: Instance; cashDelta: number; index?: number }
  | { kind: 'delete'; id: string; cashDelta: number }
  | { kind: 'settings'; settings: Partial<GameSettings> }
  | { kind: 'buy'; resource: string; amount: number }
  | { kind: 'standing'; resource: string; keepAbove: number; orderUpTo?: number }
  | { kind: 'ui'; panel: string }
  | { kind: 'tutorial'; skip: boolean }
);

/** An action without its day stamp (the store adds `at` when it applies one). */
export type ActionBody = Action extends infer A ? (A extends Action ? Omit<A, 'at'> : never) : never;

export function applyAction(catalog: Catalog, s: GameState, a: Action): GameState {
  switch (a.kind) {
    case 'place': {
      const r = placeSystem(
        catalog,
        s,
        a.systemId,
        a.x,
        a.y,
        a.mode,
        a.scale !== undefined ? { scale: a.scale } : {},
      );
      if (r.instanceId !== a.id) throw new Error(`Replay diverged: expected ${a.id}, placed ${r.instanceId}`);
      return r.state;
    }
    case 'hireConstruction':
      return hireConstruction(s, a.id);
    case 'assignShelter':
      return setShelter(catalog, s, a.id, a.shelterId);
    case 'closeShelter':
      return closeShelter(catalog, s, a.id, a.closed);
    case 'preserve':
      return setPreservation(catalog, s, a.id, a.resource, a.keep);
    case 'livestock':
      return manageLivestock(catalog, s, a.id, a.operation);
    case 'hatch':
      return setHatch(catalog, s, a.id, a.operation);
    case 'finance':
      return manageFinance(catalog, s, a.operation, a.amount);
    case 'role':
      return setRole(catalog, s, a.id, a.role);
    case 'winterize':
      return setWinterProtection(catalog, s, a.id, a.protection);
    case 'service':
      return serviceSystem(catalog, s, a.id, a.replace);
    case 'sell':
      return queueTrade(catalog, s, a.resource, a.amount, a.keep, a.receive);
    case 'remove':
      return removeSystem(s, a.id);
    case 'move':
      return moveSystem(catalog, s, a.id, a.x, a.y);
    case 'moveMany':
      return moveInstances(s, a.moves);
    case 'priority':
      return setPriority(s, a.id, a.priority);
    case 'link':
      return setLink(s, a.id, a.resource, a.providerId);
    case 'insert':
      return insertInstance(s, a.instance, a.cashDelta, a.index);
    case 'delete':
      return deleteInstance(s, a.id, a.cashDelta);
    case 'settings': {
      let next = { ...s, settings: { ...s.settings, ...a.settings } };
      if ('riskEvents' in a.settings && !a.settings.riskEvents) delete next.risks;
      if (a.settings.finance && !s.settings.finance) next = activateFinance(catalog, next);
      if ('shelterOccupancy' in a.settings && !!a.settings.shelterOccupancy !== !!s.settings.shelterOccupancy)
        delete next.shelterThermal;
      if (s.settings.storagePools && 'storagePools' in a.settings && !a.settings.storagePools) return releaseFrozen(next);
      return next;
    }
    case 'buy':
      return buyAtMarket(catalog, s, a.resource, a.amount);
    case 'standing':
      return setStandingOrder(catalog, s, a.resource, a.keepAbove, a.orderUpTo);
    case 'ui':
      return s.tutorial && !s.tutorial.ui.includes(a.panel) ? { ...s, tutorial: { ...s.tutorial, ui: [...s.tutorial.ui, a.panel] } } : s;
    case 'tutorial':
      return s.tutorial ? { ...s, tutorial: { ...s.tutorial, skipped: a.skip } } : s;
  }
}

export function startGame(catalog: Catalog, init: GameInit): GameState {
  if (init.start) {
    const g = gameFromStart(catalog, getSite(init.siteId), getStart(init.start.id), {
      difficulty: init.start.difficulty,
      household: init.start.household,
      seed: init.seed,
      warmUp: init.settings.serviceWarmUp === true,
      tutorialSeasons: init.settings.tutorialSeasons === true,
      householdStart: init.settings.householdStart === true,
    });
    return Object.keys(init.settings).length ? { ...g, settings: { ...g.settings, ...init.settings } } : g;
  }
  return initGame(catalog, getSite(init.siteId), init.settings, init.seed);
}

/** Rebuild a game from its start and action log, stepping to `untilAbsDay`. */
export function replay(
  catalog: Catalog,
  init: GameInit,
  actions: readonly Action[],
  untilAbsDay: number,
): GameState {
  let s = startGame(catalog, init);
  for (const a of actions) {
    if (a.at < s.calendar.absDay)
      throw new Error(`Action at day ${a.at} is out of order (now ${s.calendar.absDay})`);
    if (a.at > s.calendar.absDay) s = stepDays(s, catalog, a.at - s.calendar.absDay).state;
    s = applyAction(catalog, s, a);
  }
  if (untilAbsDay > s.calendar.absDay) s = stepDays(s, catalog, untilAbsDay - s.calendar.absDay).state;
  return s;
}

/** A stable fingerprint of a game's substance (for saves and the replay test). */
export function gameDigest(s: GameState): string {
  return digest({
    calendar: s.calendar,
    cash: s.cash,
    ...(s.access !== undefined ? { access: s.access } : {}),
    ...(s.risks !== undefined ? { risks: s.risks } : {}),
    ...(s.riskRng !== undefined ? { riskRng: s.riskRng } : {}),
    ...(s.finance !== undefined ? { finance: s.finance } : {}),
    ...(s.pendingCash.borrowed || s.pendingCash.repaid ? { financing: { borrowed: s.pendingCash.borrowed ?? 0, repaid: s.pendingCash.repaid ?? 0 } } : {}),
    rng: s.rng,
    ...(s.shelterThermal !== undefined ? { shelterThermal: s.shelterThermal } : {}),
    ...(s.livestockRng !== undefined ? { livestockRng: s.livestockRng } : {}),
    ...(s.householdRng !== undefined ? { householdRng: s.householdRng } : {}),
    stocks: s.stocks,
    direct: s.direct,
    instances: s.instances,
    settings: s.settings,
    ...(s.market ? { market: s.market } : {}),
    ...(s.tutorial ? { tutorial: s.tutorial } : {}),
    // Real weather: the year draws are part of the game's substance (average-mode digests are unchanged).
    ...(s.weatherLog ? { weatherLog: s.weatherLog } : {}),
  });
}

export const SAVE_SCHEMA = 'homestead.save.v1';

/** The `.homestead.json` file: start, action log, a snapshot for fast loading, and its digest. */
export interface SaveFile {
  schema: typeof SAVE_SCHEMA;
  engineVersion: string;
  catalogSha256: string;
  name: string;
  /** Set by the app (the engine has no clock). */
  savedAt: string;
  init: GameInit;
  actions: Action[];
  absDay: number;
  digest: string;
  state: GameState;
}

/**
 * Everything wrong with a save file, in plain language (empty when it looks loadable).
 * With a catalog, also checks that every placed system still exists in it.
 */
export function saveProblems(x: unknown, catalog?: Catalog): string[] {
  const f = x as Partial<SaveFile> | null;
  if (!f || typeof f !== 'object' || Array.isArray(f)) return ['The file is not a save (it has no fields).'];
  const out: string[] = [];
  if (f.schema !== SAVE_SCHEMA) out.push(`It is not a ${SAVE_SCHEMA} file (schema: ${String(f.schema)}).`);
  for (const k of ['init', 'actions', 'absDay', 'digest', 'state'] as const) {
    if (f[k] === undefined) out.push(`It is missing "${k}".`);
  }
  if (f.actions !== undefined && !Array.isArray(f.actions)) out.push('Its action log is not a list.');
  if (f.init && (typeof f.init !== 'object' || typeof f.init.siteId !== 'string' || typeof f.init.seed !== 'number'))
    out.push('Its starting settings (site and seed) are unreadable.');
  const st = f.state as Partial<GameState> | undefined;
  if (st !== undefined) {
    if (!st || typeof st !== 'object') out.push('Its game snapshot is unreadable.');
    else {
      if (st.schema !== 'homestead.game.v1') out.push('Its game snapshot has an unknown format.');
      if (!st.calendar || typeof st.calendar.absDay !== 'number') out.push('Its game snapshot has no date.');
      if (!Array.isArray(st.instances)) out.push('Its game snapshot has no list of placed systems.');
      if (!st.stocks || typeof st.stocks !== 'object') out.push('Its game snapshot has no stocks.');
      if (!st.site || typeof st.site !== 'object' || typeof st.site.id !== 'string')
        out.push('Its game snapshot has no site.');
      if (!Array.isArray(st.ledgers)) out.push('Its game snapshot has no daily ledgers.');
      if (catalog && Array.isArray(st.instances)) {
        const ids = new Set(catalog.systems.map((s) => s.id));
        const unknown = [...new Set(st.instances.map((i) => i?.systemId).filter((id) => !ids.has(id)))];
        if (unknown.length) out.push(`It places systems this catalog doesn't have: ${unknown.join(', ')}.`);
      }
    }
  }
  return out;
}

export function validateSave(x: unknown, catalog?: Catalog): SaveFile {
  const problems = saveProblems(x, catalog);
  if (problems.length) throw new SaveError(problems);
  return x as SaveFile;
}

/** A save that can't be loaded, with every problem found. */
export class SaveError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join(' '));
    this.name = 'SaveError';
  }
}
