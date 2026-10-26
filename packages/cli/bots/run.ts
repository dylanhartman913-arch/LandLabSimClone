import { catalog as defaultCatalog, getSite, getStart, type Catalog, type Difficulty, type Start } from '@homestead/catalog';
import { gameFromStart, initializeStarterHomes, stepDay, type Action, type DayLedger, type GameEvent, type GameSettings, type GameState } from '@homestead/engine';
import type { Bot } from './types.ts';

/** What a new game started in the app sets (NewGame.tsx): the same rules a player gets today. */
export const NEW_GAME_SETTINGS = { householdCorrectness: true, safeRecovery: true, reuseIdleLabor: true, survivalShelterReturn: true, safeWaterFirst: true, employmentPriority: true, siteCrewRates: true, cashFloor: true, serviceWarmUp: true, tutorialSeasons: true, tutorialInstructions: true, householdStart: true };

/** The opt-in Phase 9–10 rules under Settings → Experimental mechanics (Settings.tsx), all off in a new game. */
export const EXPERIMENTAL_MECHANICS = [
  'wearAndRepair',
  'sellingAndTrade',
  'foodPreservation',
  'livestockLifecycle',
  'shelterOccupancy',
  'storagePools',
  'toolGathering',
  'soilFertility',
  'householdRoles',
  'finance',
  'riskEvents',
  'transportAccess',
] as const;

export interface PlayOptions {
  /** A start id, or a start definition (a stress fixture's edited kit or stockpile). */
  start: string | Start;
  site: string;
  difficulty?: Difficulty;
  seed?: number;
  /** Adults and children (LL-51); default the start's default adults and no children. */
  household?: number;
  children?: number;
  days: number;
  catalog?: Catalog;
  /** Game settings on top of the start's, as a new game's init would set them. */
  settings?: Partial<GameSettings>;
}

export interface PlayResult {
  state: GameState;
  ledgers: DayLedger[];
  events: GameEvent[];
  actions: Action[];
}

/** Play a start with a bot for `days` days: each morning the bot acts, then the day runs. */
export function playBot(bot: Bot, o: PlayOptions): PlayResult {
  const catalog = o.catalog ?? defaultCatalog;
  let state = gameFromStart(catalog, getSite(o.site), typeof o.start === 'string' ? getStart(o.start) : o.start, { difficulty: o.difficulty ?? 'standard', seed: o.seed ?? 1, ...(o.household ? { household: o.household } : {}), ...(o.children ? { children: o.children } : {}), warmUp: o.settings?.serviceWarmUp === true, tutorialSeasons: o.settings?.tutorialSeasons === true, tutorialInstructions: o.settings?.tutorialInstructions === true, householdStart: o.settings?.householdStart === true });
  if (o.settings) state = { ...state, settings: { ...state.settings, ...o.settings } };
  if (state.settings.householdCorrectness && state.settings.shelterOccupancy)
    state = initializeStarterHomes(catalog, state, state.instances.map((i) => i.id));
  const ledgers: DayLedger[] = [];
  const events: GameEvent[] = [];
  const actions: Action[] = [];
  for (let k = 0; k < o.days; k++) {
    state = bot.act(catalog, state, actions);
    const r = stepDay(state, catalog);
    state = r.state;
    ledgers.push(r.ledger);
    events.push(...r.events);
  }
  return { state, ledgers, events, actions };
}
