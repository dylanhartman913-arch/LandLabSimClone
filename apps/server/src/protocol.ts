import type { GameInit, GameState, GameEvent, Report, QuestView } from '@homestead/engine';

export interface SharedSnapshot {
  revision: number;
  tutorial: { completed: number; total: number; quest: QuestView | null };
  durable: boolean;
  storageError: string | null;
  init: GameInit;
  game: GameState;
  events: GameEvent[];
  reports: Report[];
  running: boolean;
  pauseReason: string;
  players: { name: string; connected: boolean; ready: boolean }[];
}
