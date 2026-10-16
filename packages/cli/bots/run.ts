import { catalog as defaultCatalog, getSite, getStart, type Catalog, type Difficulty } from '@homestead/catalog';
import { gameFromStart, stepDay, type Action, type DayLedger, type GameEvent, type GameState } from '@homestead/engine';
import type { Bot } from './types.ts';

export interface PlayOptions {
  start: string;
  site: string;
  difficulty?: Difficulty;
  seed?: number;
  days: number;
  catalog?: Catalog;
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
  let state = gameFromStart(catalog, getSite(o.site), getStart(o.start), { difficulty: o.difficulty ?? 'standard', seed: o.seed ?? 1 });
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
