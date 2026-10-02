import { NEED_KEYS, type NeedKey } from '@homestead/catalog';
import { costFor } from '@homestead/engine';
import { doStep } from './steps.ts';
import type { Bot } from './types.ts';

/**
 * Each week, builds the cheapest catalog system that makes something for the worst checklist
 * row (cheapest per unit of that row a week), if it can afford it. No backstops, no conventional systems.
 */
export function greedyBot(): Bot {
  const skipped: string[] = [];
  return {
    name: 'greedy',
    act(catalog, state, log) {
      if (state.ledgers.length < 7 || state.calendar.absDay % 7 !== 0) return state;
      const week = state.ledgers.slice(-7);
      let worst: NeedKey | null = null;
      let worstPct = Infinity;
      for (const k of NEED_KEYS) {
        if (k === 'Est. Required Labor') continue;
        const need = week.reduce((a, l) => a + l.needs[k].needed, 0);
        if (need <= 1e-9) continue;
        const pct = week.reduce((a, l) => a + l.needs[k].delivered, 0) / need;
        if (pct < worstPct) [worst, worstPct] = [k, pct];
      }
      if (!worst || worstPct >= 0.999) return state;
      const feeds = new Map(catalog.resources.filter((r) => r.needsRow === worst).map((r) => [r.name, r.factorToNeed ?? 1]));
      let best: { name: string; mode: 'buy' | 'diy'; perUnit: number } | null = null;
      for (const s of catalog.systems) {
        if (s.backstop || s.categories.includes('Conventional') || s.categories.includes('Household')) continue;
        let weekly = 0;
        for (const f of catalog.flows) {
          if (f.systemId !== s.id || f.direction !== 'out' || !feeds.has(f.resource)) continue;
          weekly += (f.qty.kind === 'const' ? f.qty.value : 0) * (f.period === 'Weekly' ? 1 : f.period === 'Per season' ? 1 / 52 : f.period === 'Capacity' ? 1 : 0) * feeds.get(f.resource)!;
        }
        if (weekly <= 0) continue;
        const mode = s.costDiy !== null && s.costDiy !== undefined ? 'diy' : 'buy';
        const cost = costFor(catalog, s.id, mode);
        if (cost > state.cash * 0.5) continue;
        const perUnit = cost / weekly;
        if (!best || perUnit < best.perUnit || (perUnit === best.perUnit && s.name < best.name)) best = { name: s.name, mode, perUnit };
      }
      if (!best) return state;
      return doStep(catalog, state, { do: 'place', system: best.name, mode: best.mode, count: 1, near: 'home', on: false }, log, skipped);
    },
  };
}
