import {
  aggregateMonteCarlo,
  type MonteCarloResult,
  type MonteCarloRun,
  type MonteCarloSpec,
} from '@homestead/engine';
import type { McMessage, McRequest } from '../workers/montecarlo.worker.ts';

export interface McJob {
  promise: Promise<MonteCarloResult>;
  cancel(): void;
}

/** Workers to use: leave a core for the page, and at most four. */
export function workerCount(): number {
  const n = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 2) : 2;
  return Math.max(1, Math.min(4, n - 1));
}

/**
 * Run Monte Carlo in Web Workers. Seeds are dealt round-robin across workers and the
 * runs are put back in seed order before aggregating, so the result is identical to
 * the CLI's for the same spec whatever the number of workers.
 */
export function startMonteCarlo(
  spec: MonteCarloSpec,
  onProgress: (done: number, total: number) => void,
  workers = workerCount(),
): McJob {
  const pool: Worker[] = [];
  let cancelled = false;
  let rejectFn: (e: Error) => void = () => {};
  const promise = new Promise<MonteCarloResult>((resolve, reject) => {
    rejectFn = reject;
    const runs: (MonteCarloRun | undefined)[] = new Array(spec.seeds);
    let done = 0;
    let finished = 0;
    const n = Math.min(workers, spec.seeds);
    if (n === 0) {
      resolve(aggregateMonteCarlo(spec, []));
      return;
    }
    for (let w = 0; w < n; w++) {
      const ks: number[] = [];
      for (let k = w; k < spec.seeds; k += n) ks.push(k);
      const worker = new Worker(new URL('../workers/montecarlo.worker.ts', import.meta.url), { type: 'module' });
      pool.push(worker);
      worker.onmessage = (e: MessageEvent<McMessage>) => {
        if (cancelled) return;
        const m = e.data;
        if (m.type === 'run') {
          runs[m.k] = m.run;
          done++;
          onProgress(done, spec.seeds);
        } else if (m.type === 'done') {
          worker.terminate();
          if (++finished === n) resolve(aggregateMonteCarlo(spec, runs as MonteCarloRun[]));
        } else {
          for (const x of pool) x.terminate();
          reject(new Error(m.message));
        }
      };
      worker.onerror = (e) => {
        for (const x of pool) x.terminate();
        reject(new Error(e.message || 'The simulation worker failed to start'));
      };
      worker.postMessage({ spec, ks } satisfies McRequest);
    }
  });
  return {
    promise,
    cancel() {
      cancelled = true;
      for (const w of pool) w.terminate();
      rejectFn(new Error('cancelled'));
    },
  };
}
