import type { DayLedger, GameState, ResourceDay } from './types.ts';

/** Mutable day-local accounting shared by the two opt-in work queues. */
export interface ProcessingDay {
  prev: GameState;
  instances: GameState['instances'];
  stocks: Record<string, number>;
  produced: Record<string, number>;
  res: Record<string, ResourceDay>;
  pool: number;
  constructionUsed: number;
  gatherUsed: number;
  laborUsed: number;
  upkeepRequested: number;
  laborBySystem: Record<string, number>;
}

export function spareLabor(d: ProcessingDay): number {
  return Math.max(0, d.pool - d.constructionUsed - d.gatherUsed - d.laborUsed);
}

export function workProcessing(d: ProcessingDay, systemId: string, hours: number): void {
  d.laborUsed += hours;
  d.upkeepRequested += hours;
  d.res.Labor!.consumed += hours;
  d.laborBySystem[systemId] = (d.laborBySystem[systemId] ?? 0) + hours;
}

export function availableToday(d: ProcessingDay, resource: string): number {
  return Math.max(0, (d.stocks[resource] ?? 0) + (d.produced[resource] ?? 0));
}

/** Preserve gross production when work draws today's output before it enters stock. */
export function drawToday(
  d: ProcessingDay,
  resource: string,
  amount: number,
  kind: 'consumed' | 'processed',
): void {
  const fromStock = Math.min(d.stocks[resource] ?? 0, amount);
  d.stocks[resource] = (d.stocks[resource] ?? 0) - fromStock;
  d.produced[resource] = (d.produced[resource] ?? 0) - (amount - fromStock);
  const led = d.res[resource]!;
  led.produced += amount - fromStock;
  led[kind] = (led[kind] ?? 0) + amount;
}

export type PreservedBatch = NonNullable<DayLedger['preserved']>[number];
