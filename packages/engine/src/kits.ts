import type { Catalog } from '@homestead/catalog';
import { canPlace, parcelSideFt } from './time/game.ts';
import { applyAction, startGame, type Action, type GameInit } from './replay.ts';
import type { GameState } from './time/types.ts';

export type StartingKit = 'empty' | 'tent' | 'suburban';

export const KIT_LABELS: Record<StartingKit, { name: string; blurb: string }> = {
  empty: { name: 'Empty land', blurb: 'Your household arrives with supplies and nothing else.' },
  tent: { name: 'Tent camp', blurb: 'A bell tent, the land title, and a couple of months of groceries.' },
  suburban: {
    name: 'Suburban home to convert',
    blurb:
      'A house on a mortgage with grid power, city water, groceries, a car, and a job. Replace it piece by piece.',
  },
};

const KITS: Record<StartingKit, [name: string, dx: number, dy: number][]> = {
  empty: [],
  tent: [
    ['Land Title ($50k)', 0, 0],
    ['Bell Tent', 0, -30],
  ],
  suburban: [
    ['30 Year Mortgage and Interest', 0, 0],
    ['Average Suburban Home', 0, -10],
    ['Central Power Plant (Coal / NatGas / Nuclear)', 0, 0],
    ['Municipal Water Hookup', 32, -30],
    ['Big Box Grocery Store', 0, 0],
    ['Average Job', 0, 0],
    ['Average American Vehicle', -45, 30],
    ['Septic Tank & Drain Field', 0, 45],
  ],
};

export interface NewGameOptions {
  siteId: string;
  parcelAcres: number;
  startingCash: number;
  adults: number;
  children: number;
  weatherMode: 'average' | 'real';
  kit: StartingKit;
  seed: number;
}

/** Children count as this share of a Human Being (needs and labor). */
export const CHILD_SCALE = 0.6;

/**
 * Build a new game and the actions that laid it out (so the save replays from day 0).
 * People arrive with a few weeks of food and some drinking water.
 */
export function newGameFromOptions(
  catalog: Catalog,
  o: NewGameOptions,
): { init: GameInit; game: GameState; actions: Action[] } {
  const people = o.adults + o.children * CHILD_SCALE;
  const init: GameInit = {
    siteId: o.siteId,
    seed: o.seed,
    settings: {
      parcelAcres: o.parcelAcres,
      startingCash: o.startingCash,
      weatherMode: o.weatherMode,
      startDay: 90,
      startingStocks: { Food: Math.round(14000 * 8 * people), 'Drinking water': 40 },
    },
  };
  let game = startGame(catalog, init);
  const actions: Action[] = [];
  const side = parcelSideFt(game.settings);
  const c = side / 2;
  const place = (name: string, x: number, y: number, scale?: number) => {
    const sys = catalog.systems.find((s) => s.name === name);
    if (!sys) throw new Error(`Kit names unknown system ${name}`);
    const spot = findSpot(catalog, game, sys.id, x, y);
    if (!spot) throw new Error(`No room for ${name} on this parcel`);
    const a: Action = {
      at: 0,
      kind: 'place',
      systemId: sys.id,
      x: spot.x,
      y: spot.y,
      mode: 'prebuilt',
      id: `i${game.nextInstanceId}`,
      ...(scale !== undefined ? { scale } : {}),
    };
    game = applyAction(catalog, game, a);
    actions.push(a);
  };
  place('Sunlight', c, c);
  place('Rainfall', c, c);
  if (game.site.ambient['Stream flow']) place('Stream Frontage', c, c);
  for (const [name, dx, dy] of KITS[o.kit]) place(name, c + dx, c + dy);
  for (let k = 0; k < o.adults; k++) place('Human Being', c - 8 + k * 5, c + 10);
  for (let k = 0; k < o.children; k++) place('Human Being', c - 6 + k * 4, c + 15, CHILD_SCALE);
  return { init, game, actions };
}

/** The nearest valid spot to (x, y), searching outward in 2 ft rings. */
export function findSpot(
  catalog: Catalog,
  game: GameState,
  systemId: string,
  x: number,
  y: number,
): { x: number; y: number } | null {
  const side = parcelSideFt(game.settings);
  for (let r = 0; r <= side; r += 2) {
    const steps = r === 0 ? 1 : Math.max(8, Math.round((2 * Math.PI * r) / 2));
    for (let k = 0; k < steps; k++) {
      const a = (k / steps) * 2 * Math.PI;
      const px = Math.round((x + r * Math.cos(a)) * 10) / 10;
      const py = Math.round((y + r * Math.sin(a)) * 10) / 10;
      if (canPlace(catalog, game, systemId, px, py).ok) return { x: px, y: py };
    }
  }
  return null;
}
