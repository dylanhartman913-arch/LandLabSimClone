import type { Catalog, System } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import type { GameState, Instance, InstanceInputRecord } from './types.ts';

/** Physical purchased assets only: people, living systems and external services have other lifecycles. */
export function wearsOut(sys: System): boolean {
  return (
    sys.lifespanYrs > 0 &&
    sys.costBuy > 0 &&
    !sys.backstop &&
    sys.yearsToFullOutput === 0 &&
    !sys.categories.some((c) => /animal|livestock|plant|tree|employment|insect|land|garden/i.test(c)) &&
    sys.name !== 'Human Being' &&
    !['Biochar', 'Green Biomass', 'Woody Biomass'].includes(sys.name)
  );
}

export function conditionOutput(inst: Instance, sys: System): number {
  if (!wearsOut(sys)) return 1;
  const c = inst.condition ?? 1;
  return c >= 0.3 ? 1 : Math.max(0, c / 0.3);
}

export function wearInstance(
  inst: Instance,
  sys: System,
  use: number,
  upkeep?: InstanceInputRecord,
): Instance {
  if (!wearsOut(sys)) return inst;
  const missed = upkeep && upkeep.requested > 0 ? 1 - upkeep.received / upkeep.requested : 0;
  // Calendar aging never stops; full use consumes the catalog life. Unmet upkeep adds up to two full-use days of wear.
  const loss = (0.25 + 0.75 * use + 2 * missed) / (365 * sys.lifespanYrs);
  return { ...inst, condition: Math.max(0, (inst.condition ?? 1) - loss) };
}

export function maintenanceView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const sys = catalog.systems.find((s) => s.id === inst?.systemId);
  if (!state.settings.wearAndRepair || !inst || !sys || !wearsOut(sys)) return null;
  return {
    servicing: !!inst.servicing,
    condition: explained(
      inst.condition ?? 1,
      'remaining service life; daily wear follows catalog lifespan, use and skipped upkeep',
    ),
    output: explained(
      conditionOutput(inst, sys),
      'full output above 30% condition; linear decline below 30%; zero at end of life',
    ),
    parts: explained(sys.costBuy * 0.2, 'repair parts cost: 20% of catalog purchase cost'),
    hours: explained(
      Math.max(1, sys.setupLaborHrs * 0.25),
      'repair work: 25% of setup labor, minimum one hour',
    ),
    replacement: explained(sys.costBuy, 'replacement parts at catalog purchase price'),
    replacementPerYear: explained(
      sys.costBuy / sys.lifespanYrs,
      'catalog purchase price ÷ catalog lifespan; planning allowance, not a bill',
    ),
    canRepair: inst.status === 'active' && state.cash >= sys.costBuy * 0.2,
    canReplace: inst.status === 'active' && state.cash >= sys.costBuy,
  };
}

/** Work uses the existing construction queue; parts are paid now, operation resumes after labor. */
export function serviceSystem(catalog: Catalog, state: GameState, id: string, replace = false): GameState {
  const v = maintenanceView(state, catalog, id);
  if (!v) throw new Error('Wear and repair is disabled or this system has no repairable lifespan');
  if (!(replace ? v.canReplace : v.canRepair))
    throw new Error('System is busy or cash cannot cover the parts');
  const sys = catalog.systems.find((s) => s.id === state.instances.find((i) => i.id === id)!.systemId)!;
  const cost = replace ? v.replacement.value : v.parts.value;
  return {
    ...state,
    cash: state.cash - cost,
    pendingCash: { ...state.pendingCash, purchases: state.pendingCash.purchases + cost },
    instances: state.instances.map((i) => {
      if (i.id !== id) return i;
      const copy = { ...i };
      delete copy.contractor;
      return {
        ...copy,
        status: 'building',
        setupHoursDone: 0,
        setupHoursNeeded: replace ? Math.max(1, sys.setupLaborHrs) : v.hours.value,
        materialsDrawn: true,
        servicing: { activeSince: replace ? state.calendar.absDay : i.activeSince },
      };
    }),
  };
}
