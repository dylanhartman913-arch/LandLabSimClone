import type { Catalog, Difficulty, Site, Start } from '@homestead/catalog';
import { initGame, parcelSideFt, placeSystem } from './game.ts';
import { stepDay } from './step.ts';
import { getPlans } from './plans.ts';
import { newTutorial } from '../tutorial.ts';
import { QUEST_LINES } from '@homestead/catalog';
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
  /** v0.7 (`settings.serviceWarmUp`): a second silent day, fed by the household's own by-products. */
  warmUp?: boolean;
  /** v0.8 (`settings.tutorialSeasons`): the start's seasonal quest line, when it has one (LL-18). */
  tutorialSeasons?: boolean;
  householdStart?: boolean;
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
      startingCash: opts.householdStart && start.id === 'greenfield' ? start.cash * people : start.cash,
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
  const eveCal = { ...s.calendar, day: (startDay + 364) % 365 };
  let eve = stepDay({ ...s, calendar: eveCal }, catalog).state;
  // v0.7: on that silent day the toilet had no organic waste yet (people make it during the day), so
  // day 1 showed 0% sanitation. A second silent day starts with the first day's household by-products;
  // they carry into day 1 too. The stockpile stays exactly as the start defines it.
  const byproducts = new Set<string>();
  if (opts.warmUp) {
    const plans = getPlans(catalog, site);
    for (const i of s.instances)
      if (i.person) for (const o of plans.bySystem.get(i.systemId)!.outputs) if (o.resource !== 'Labor' && start.stockpile[o.resource] === undefined) byproducts.add(o.resource);
    const made = (g: GameState) => Object.fromEntries([...byproducts].map((r) => [r, g.stocks[r] ?? 0]));
    eve = stepDay({ ...s, calendar: eveCal, stocks: { ...s.stocks, ...made(eve) }, direct: eve.direct, services: eve.services, lastDay: eve.lastDay }, catalog).state;
  }
  const carried: Record<string, number> = { ...s.stocks };
  for (const r of catalog.resources) if (r.class === 'Flow' && !r.storable && eve.stocks[r.name] !== undefined) carried[r.name] = eve.stocks[r.name]!;
  for (const r of byproducts) if (eve.stocks[r] !== undefined) carried[r] = eve.stocks[r]!;
  // With the warm-up, yesterday's steady gaps (the starter toilet covers half of two adults) are not
  // announced as new on day 1; a shortage that first appears on day 1 still is.
  s = { ...s, stocks: carried, direct: eve.direct, services: eve.services, lastDay: eve.lastDay, ...(opts.warmUp ? { flags: eve.flags } : {}) };
  return {
    ...s,
    start: { id: start.id, difficulty, household: people, headline: start.headline, tutorial: start.tutorial },
    ...(start.tutorial ? { tutorial: newTutorial(tutorialLineFor(start.tutorial, opts.tutorialSeasons), s.calendar.absDay) } : {}),
  };
}

/** The seasonal line (`<line>-seasons`) keeps teaching through summer; legacy games keep the original. */
function tutorialLineFor(line: string, seasons?: boolean): string {
  return seasons && QUEST_LINES[`${line}-seasons`] ? `${line}-seasons` : line;
}
