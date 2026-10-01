import type { Catalog, Difficulty, Site, Start } from '@homestead/catalog';
import { initGame, parcelSideFt, placeSystem } from './game.ts';
import { stepDay } from './step.ts';
import type { GameState } from './types.ts';

/** Days before the last spring frost that a `spring` start begins. */
export const SPRING_LEAD_DAYS = 30;

/** "Spring, day 1" on a site: a month before its last frost (0-based day of year). */
export function springStartDay(site: Site): number {
  return Math.max(0, site.growingSeason.startDay - 1 - SPRING_LEAD_DAYS);
}

export interface StartOptions {
  difficulty?: Difficulty;
  /** Adults in the household (defaults to the start's default). */
  household?: number;
  seed?: number;
}

/**
 * A new game from a start config (G15): the land, systems already running (no construction),
 * the stockpile scaled to the household and difficulty, cash, auto-gather rules, and the
 * difficulty's wellbeing and weather settings. People go to town at 0 wellbeing.
 */
export function gameFromStart(catalog: Catalog, site: Site, start: Start, opts: StartOptions = {}): GameState {
  const difficulty = opts.difficulty ?? 'standard';
  const d = start.difficulty[difficulty];
  if (!d) throw new Error(`Start "${start.id}" has no difficulty "${difficulty}"`);
  const people = Math.max(start.household.min, Math.min(start.household.max, opts.household ?? start.household.default));
  const scale = (people / start.household.default) * d.stockMult;
  const startDay = start.startDay === 'spring' ? springStartDay(site) : start.startDay;
  const stocks: Record<string, number> = {};
  for (const [r, v] of Object.entries(start.stockpile)) stocks[r] = v * scale;
  let s = initGame(
    catalog,
    site,
    {
      parcelAcres: start.parcelAcres,
      startingCash: start.cash,
      startDay,
      startingStocks: stocks,
      weatherMode: d.weatherMode,
      wellbeingMult: d.wellbeingMult,
      peopleLeave: true,
      ...(start.autoGather ? { autoGather: { ...start.autoGather } } : {}),
      ...(start.backstopCapMult ? { backstopCapMult: start.backstopCapMult } : {}),
    },
    opts.seed ?? 1,
  );
  const side = parcelSideFt(s.settings);
  const byName = new Map(catalog.systems.map((x) => [x.name, x.id]));
  for (const it of start.instances) {
    const id = byName.get(it.system);
    if (!id) throw new Error(`Start "${start.id}": no catalog system named "${it.system}"`);
    const n = it.perPerson ? people : it.count;
    for (let k = 0; k < n; k++) s = placeSystem(catalog, s, id, it.x * side, it.y * side, 'prebuilt').state;
  }
  // The kit was already running yesterday: carry over one silent day's direct-use output and
  // group results (so the house's sanitation and the cars' miles count on day 1), nothing else.
  const eve = stepDay({ ...s, calendar: { ...s.calendar, day: (startDay + 364) % 365 } }, catalog).state;
  const carried: Record<string, number> = { ...s.stocks };
  for (const r of catalog.resources) if (r.class === 'Flow' && !r.storable && eve.stocks[r.name] !== undefined) carried[r.name] = eve.stocks[r.name]!;
  s = { ...s, stocks: carried, direct: eve.direct, services: eve.services, lastDay: eve.lastDay };
  return { ...s, start: { id: start.id, difficulty, household: people, headline: start.headline, tutorial: start.tutorial } };
}
