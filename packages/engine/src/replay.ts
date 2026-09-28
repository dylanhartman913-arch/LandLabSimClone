import { getSite, type Catalog } from '@homestead/catalog';
import { digest } from './digest.ts';
import {
  deleteInstance,
  initGame,
  insertInstance,
  moveInstances,
  moveSystem,
  placeSystem,
  removeSystem,
  setLink,
  setPriority,
} from './time/game.ts';
import { stepDays } from './time/step.ts';
import type { BuildMode, GameSettings, GameState, Instance } from './time/types.ts';

/** How a game began: enough to rebuild it exactly. */
export interface GameInit {
  siteId: string;
  seed: number;
  settings: Partial<GameSettings>;
}

/**
 * One state-changing operation between days. `at` is the absolute day on which
 * it was applied (before that day was stepped). Undo and redo are logged as the
 * operations they perform, so replay never needs the undo stack.
 */
export type Action = { at: number } & (
  | { kind: 'place'; systemId: string; x: number; y: number; mode: BuildMode; id: string; scale?: number }
  | { kind: 'remove'; id: string }
  | { kind: 'move'; id: string; x: number; y: number }
  | { kind: 'moveMany'; moves: { id: string; x: number; y: number }[] }
  | { kind: 'priority'; id: string; priority: number }
  | { kind: 'link'; id: string; resource: string; providerId: string | null }
  | { kind: 'insert'; instance: Instance; cashDelta: number; index?: number }
  | { kind: 'delete'; id: string; cashDelta: number }
  | { kind: 'settings'; settings: Partial<GameSettings> }
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
    case 'settings':
      return { ...s, settings: { ...s.settings, ...a.settings } };
  }
}

export function startGame(catalog: Catalog, init: GameInit): GameState {
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
    rng: s.rng,
    stocks: s.stocks,
    direct: s.direct,
    instances: s.instances,
    settings: s.settings,
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

export function validateSave(x: unknown): SaveFile {
  const f = x as Partial<SaveFile>;
  if (!f || typeof f !== 'object') throw new Error('Not a save file');
  if (f.schema !== SAVE_SCHEMA) throw new Error(`Unsupported save schema: ${String(f.schema)}`);
  for (const k of ['init', 'actions', 'absDay', 'digest', 'state'] as const) {
    if (f[k] === undefined) throw new Error(`Save file is missing "${k}"`);
  }
  if (!Array.isArray(f.actions)) throw new Error('Save file actions must be a list');
  return f as SaveFile;
}
