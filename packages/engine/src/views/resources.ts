import type { Catalog } from '@homestead/catalog';
import { explained, type Explained } from '../provenance.ts';
import type { GameState } from '../time/types.ts';

export interface ResourceWeek {
  resource: string;
  unit: string;
  /** Requested by consumers over the last 7 days. */
  needed: Explained;
  /** What consumers received. */
  supplied: Explained;
  /** supplied ÷ needed (1 when nothing was needed). */
  share: Explained;
  produced: Explained;
  consumed: Explained;
  spilled: Explained;
  spoiled: Explained;
  /** Change in stock over the week (stored if positive). */
  stored: Explained;
  short: boolean;
}

/**
 * The last 7 days per Flow resource: supply bars for the Inputs tab and
 * where-it-went for the Outputs tab. Each number carries its formula.
 */
export function resourceWeek(state: GameState, catalog: Catalog): ResourceWeek[] {
  const week = state.ledgers.slice(-7);
  const out: ResourceWeek[] = [];
  const days = week.length;
  for (const r of catalog.resources) {
    if (r.class !== 'Flow') continue;
    let requested = 0;
    let unmet = 0;
    let produced = 0;
    let consumed = 0;
    let spilled = 0;
    let spoiled = 0;
    for (const l of week) {
      const x = l.resources[r.name];
      if (!x) continue;
      requested += x.requested;
      unmet += x.unmet;
      produced += x.produced;
      consumed += x.consumed;
      spilled += x.spilled;
      spoiled += x.spoiled;
    }
    if (requested === 0 && produced === 0 && consumed === 0) continue;
    const first = week[0]?.resources[r.name]?.start ?? 0;
    const lastL = week[days - 1]?.resources[r.name];
    const last = lastL
      ? lastL.start + lastL.produced + lastL.supplied - lastL.consumed - lastL.spilled - lastL.spoiled
      : 0;
    const supplied = requested - unmet;
    const refs = { days };
    out.push({
      resource: r.name,
      unit: r.unit,
      needed: explained(requested, `Σ requests for ${r.name} over the last ${days} days`, { refs }),
      supplied: explained(supplied, 'requested − unmet', { refs: { requested, unmet } }),
      share: explained(requested > 0 ? supplied / requested : 1, 'supplied ÷ needed', {
        refs: { supplied, needed: requested },
      }),
      produced: explained(produced, `Σ ${r.name} produced over the last ${days} days`, { refs }),
      consumed: explained(consumed, `Σ ${r.name} used over the last ${days} days`, { refs }),
      spilled: explained(spilled, 'overflow beyond storage, unused services, and unused daytime power', {
        refs,
      }),
      spoiled: explained(spoiled, 'spoilage at the resource’s weekly rate', { refs }),
      stored: explained(last - first, 'stock at the end of the week − stock at the start', {
        refs: { start: first, end: last },
      }),
      short: unmet > 1e-9 * Math.max(1, requested),
    });
  }
  return out;
}
