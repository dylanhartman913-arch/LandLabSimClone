import { catalog, getSite, type Catalog } from '@homestead/catalog';
import {
  initGame,
  placeDesign,
  placeSystem,
  stepDays,
  type BuildMode,
  type DayLedger,
  type GameEvent,
  type GameSettings,
  type GameState,
} from '../src/index.ts';

export const sysId = (name: string, cat: Catalog = catalog): string => {
  const s = cat.systems.find((x) => x.name === name);
  if (!s) throw new Error(`No system named ${name}`);
  return s.id;
};

/** A new game with named systems placed (prebuilt unless a mode is given). */
export function newGame(
  counts: Record<string, number>,
  opts: { site?: string; settings?: Partial<GameSettings>; seed?: number; mode?: BuildMode } = {},
): GameState {
  const byId: Record<string, number> = {};
  for (const [name, n] of Object.entries(counts))
    byId[name.startsWith('S') && /^S\d+$/.test(name) ? name : sysId(name)] = n;
  const s = initGame(catalog, getSite(opts.site ?? 'front-range'), opts.settings ?? {}, opts.seed ?? 1);
  return placeDesign(catalog, s, byId, opts.mode ?? 'prebuilt');
}

export function run(state: GameState, days: number) {
  return stepDays(state, catalog, days);
}

/** Advance to a given day of year (0 = Jan 1) without recording. */
export function advanceTo(state: GameState, dayOfYear: number): GameState {
  const n = (dayOfYear - state.calendar.day + 365) % 365;
  return n === 0 ? state : run(state, n).state;
}

export function place(state: GameState, name: string, x: number, y: number, mode: BuildMode = 'prebuilt') {
  return placeSystem(catalog, state, sysId(name), x, y, mode);
}

export const eventsOf = <K extends GameEvent['kind']>(events: GameEvent[], kind: K) =>
  events.filter((e): e is Extract<GameEvent, { kind: K }> => e.kind === kind);

export const need = (ledgers: DayLedger[], row: keyof DayLedger['needs']) => {
  let needed = 0;
  let delivered = 0;
  let provided = 0;
  for (const l of ledgers) {
    needed += l.needs[row].needed;
    delivered += l.needs[row].delivered;
    provided += l.needs[row].provided;
  }
  return { needed, delivered, provided, pct: needed > 0 ? delivered / needed : 1 };
};

export { catalog };
