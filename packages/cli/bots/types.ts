import type { Catalog } from '@homestead/catalog';
import type { Action, GameState } from '@homestead/engine';

/**
 * A playtest bot (G16): a deterministic policy over the engine API. Each morning it may act;
 * whatever it does is logged as replayable actions.
 */
export interface Bot {
  name: string;
  /** Act before today is simulated; return the new state (actions already applied and logged). */
  act(catalog: Catalog, state: GameState, log: Action[]): GameState;
  /** What the bot saw, for gates that judge warnings (day offset from the start, alert id). */
  seen?: { day: number; id: string }[];
  /** LL-49: every alert in the ranked list each morning, with its section and place in the list. */
  shown?: { day: number; id: string; group: string; rank: number; resource: string | null }[];
}
