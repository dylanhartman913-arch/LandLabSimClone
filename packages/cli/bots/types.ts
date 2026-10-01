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
}
