import type { Catalog } from '@homestead/catalog';
import { getPlans, dailyAmount } from '../time/plans.ts';
import { climateTable } from '../time/climate.ts';
import { computeSpatial } from '../time/spatial.ts';
import type { GameState } from '../time/types.ts';

/** Warn about physically impossible gathering targets, not a promise of successful replenishment. */
export function waterReserveWarning(state: GameState, catalog: Catalog): string[] {
  const targetDays = state.settings.autoGather?.waterDays ?? 0;
  if (targetDays <= 0) return [];
  const plans = getPlans(catalog, state.site);
  const spatial = computeSpatial(catalog, state);
  const climate = climateTable(state.site);
  let daily = 0;
  let capacity = plans.poolBuffer.get('Water storage') ?? 0;
  for (const inst of state.instances) {
    if (inst.status !== 'active' || inst.person?.away) continue;
    const p = plans.bySystem.get(inst.systemId)!;
    for (const f of p.inputs) {
      if (f.resource === 'Water' || f.resource === 'Drinking water') {
        daily += dailyAmount(f, state.calendar.day, state.weather, climate) * (inst.scale ?? 1) * (spatial.get(inst.id)?.inMult[f.resource] ?? 1);
      }
    }
    for (const f of p.outputs) if (f.resource === 'Water storage') capacity += f.qty * (inst.scale ?? 1);
  }
  const target = daily * targetDays;
  return target > capacity + 1e-9
    ? [`The ${targetDays}-day water target needs about ${Math.ceil(target)} gal, but completed shared water storage holds ${Math.floor(capacity)} gal (raw and drinking water together). Add storage or lower the target; filtering and gathering labor can still limit safe water.`]
    : [];
}
