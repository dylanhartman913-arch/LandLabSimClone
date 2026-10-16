/// <reference lib="webworker" />
import { catalog } from '@homestead/catalog';
import { monteCarloRun, type MonteCarloRun, type MonteCarloSpec } from '@homestead/engine';

export type McRequest = { spec: MonteCarloSpec; ks: number[] };
export type McMessage =
  | { type: 'run'; k: number; run: MonteCarloRun }
  | { type: 'done' }
  | { type: 'error'; message: string };

// The same engine function the CLI runs, one seed at a time.
self.onmessage = (e: MessageEvent<McRequest>) => {
  const { spec, ks } = e.data;
  try {
    for (const k of ks) {
      const run = monteCarloRun(catalog, spec, k);
      (self as unknown as Worker).postMessage({ type: 'run', k, run } satisfies McMessage);
    }
    (self as unknown as Worker).postMessage({ type: 'done' } satisfies McMessage);
  } catch (err) {
    (self as unknown as Worker).postMessage({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    } satisfies McMessage);
  }
};
