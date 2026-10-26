import type { GameInit, GameState, GameEvent, Report } from '@homestead/engine';

export interface SharedSnapshot {
  revision: number;
  init: GameInit;
  game: GameState;
  events: GameEvent[];
  reports: Report[];
  running: boolean;
  pauseReason: string;
  players: { name: string; connected: boolean; ready: boolean }[];
}
