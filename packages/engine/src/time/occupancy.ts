import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { roleNeeds } from './household.ts';
import { getPlans } from './plans.ts';
import { conditionOutput } from './maintenance.ts';
import type { GameState, Instance } from './types.ts';

/** Experimental mothballing policy: retain a tenth of recurring labor and capital bills. */
export const CLOSED_SHELTER_UPKEEP = 0.1;

/** Assignments reserve room for people in town too. Invalid/deleted explicit homes stay unassigned. */
export function shelterAssignments(catalog: Catalog, state: GameState): Map<string, string | null> {
  const plans = getPlans(catalog, state.site);
  const shelters = state.instances.filter(
    (i) =>
      i.status === 'active' &&
      !i.shelterClosed &&
      plans.bySystem.get(i.systemId)!.outputs.some((o) => o.resource === 'Shelter' && o.isCapacity),
  );
  const people = state.instances.filter((i) => i.person && i.status === 'active');
  const result = new Map<string, string | null>();
  for (const i of people.filter((p) => p.shelterId !== undefined)) {
    const home = shelters.find((s) => s.id === i.shelterId);
    result.set(i.id, home?.id ?? null);
  }
  for (const i of people.filter((p) => p.shelterId === undefined)) {
    // Keep the initial household together. Buying an extra shelter never moves residents.
    const home = shelters[0];
    result.set(i.id, home?.id ?? null);
  }
  return result;
}

/** Seed only undefined assignments, using the original kit, never subsequently purchased homes. */
export function initializeStarterHomes(catalog: Catalog, state: GameState, starterIds: string[]): GameState {
  const plans = getPlans(catalog, state.site);
  const homes = state.instances.filter((i) => starterIds.includes(i.id) && i.status === 'active' && !i.shelterClosed &&
    plans.bySystem.get(i.systemId)!.outputs.some((o) => o.resource === 'Shelter' && o.isCapacity));
  // A single starter home already receives the household through the legacy default.
  // Only enlarged kits need seeded assignments; preserve single-home replacement behavior.
  if (homes.length < 2) return state;
  const need = (i: Instance) => (plans.bySystem.get(i.systemId)!.inputs.find((f) => f.resource === 'Shelter')?.qty ?? 0) *
    (i.scale ?? 1) * roleNeeds(catalog, state.settings, i.person!);
  const capacity = (i: Instance) => plans.bySystem.get(i.systemId)!.outputs.find((o) => o.resource === 'Shelter')!.qty * (i.scale ?? 1) *
    (state.settings.wearAndRepair ? conditionOutput(i, plans.bySystem.get(i.systemId)!.system) : 1);
  const loads = new Map(homes.map((h) => [h.id, state.instances.filter((i) => i.person && i.status === 'active' && i.shelterId === h.id).reduce((n, i) => n + need(i), 0)]));
  const people = state.instances.filter((i) => starterIds.includes(i.id) && i.person && i.status === 'active' && i.shelterId === undefined);
  // Starter households are small (at most seven). Search all placements so indivisible
  // residents waste as little room as possible; proportional greedy packing can strand children.
  let bestLoss = Infinity;
  let best: string[] = [];
  const chosen: string[] = [];
  const search = (k: number) => {
    if (k === people.length) {
      const loss = homes.reduce((sum, h) => sum + Math.max(0, loads.get(h.id)! - capacity(h)), 0);
      if (loss < bestLoss - 1e-9) { bestLoss = loss; best = [...chosen]; }
      return;
    }
    const amount = need(people[k]!);
    for (const h of homes) {
      loads.set(h.id, loads.get(h.id)! + amount);
      chosen.push(h.id);
      search(k + 1);
      chosen.pop();
      loads.set(h.id, loads.get(h.id)! - amount);
    }
  };
  search(0);
  const assignments = new Map(people.map((i, k) => [i.id, best[k]!]));
  return { ...state, instances: state.instances.map((i) => assignments.has(i.id) ? { ...i, shelterId: assignments.get(i.id)! } : i) };
}

export function setShelter(
  catalog: Catalog,
  state: GameState,
  id: string,
  shelterId: string | null,
): GameState {
  if (!state.settings.shelterOccupancy) throw new Error('Shelter occupancy is disabled');
  if (!state.instances.some((i) => i.id === id && i.person && i.status === 'active'))
    throw new Error('Select an active resident');
  if (shelterId !== null) {
    const home = state.instances.find((i) => i.id === shelterId);
    if (
      !home ||
      home.status !== 'active' ||
      home.shelterClosed ||
      !getPlans(catalog, state.site)
        .bySystem.get(home.systemId)!
        .outputs.some((o) => o.resource === 'Shelter' && o.isCapacity)
    )
      throw new Error('Choose a completed, open shelter');
  }
  return { ...state, instances: state.instances.map((i) => (i.id === id ? { ...i, shelterId } : i)) };
}

export function closeShelter(catalog: Catalog, state: GameState, id: string, closed: boolean): GameState {
  const v = occupancyView(state, catalog, id);
  if (!v || v.kind !== 'shelter' || state.instances.find((i) => i.id === id)!.status !== 'active')
    throw new Error('Choose a completed shelter with occupancy enabled');
  if (closed && v.residents.length)
    throw new Error('Move all assigned residents before closing this shelter, including people in town');
  return {
    ...state,
    instances: state.instances.map((i) => (i.id === id ? { ...i, shelterClosed: closed } : i)),
  };
}

/** Shared card model: all quantities and occupancy decisions come from the engine. */
export function occupancyView(state: GameState, catalog: Catalog, id: string) {
  if (!state.settings.shelterOccupancy) return null;
  const inst = state.instances.find((i) => i.id === id);
  if (!inst) return null;
  const plan = getPlans(catalog, state.site).bySystem.get(inst.systemId)!;
  const assigned = shelterAssignments(catalog, state);
  const names = (i: Instance) => `${catalog.systems.find((s) => s.id === i.systemId)!.name} (${i.id})`;
  if (inst.person)
    return {
      kind: 'person' as const,
      home: assigned.get(id) ?? null,
      shelters: state.instances
        .filter(
          (i) =>
            i.status === 'active' &&
            !i.shelterClosed &&
            getPlans(catalog, state.site)
              .bySystem.get(i.systemId)!
              .outputs.some((o) => o.resource === 'Shelter' && o.isCapacity),
        )
        .map((i) => ({ id: i.id, name: names(i) })),
    };
  if (!plan.outputs.some((o) => o.resource === 'Shelter' && o.isCapacity)) return null;
  const residents = state.instances.filter((i) => assigned.get(i.id) === id);
  const present = residents.filter((i) => !i.person?.away);
  const need = present.reduce(
    (sum, i) =>
      sum +
      (getPlans(catalog, state.site)
        .bySystem.get(i.systemId)!
        .inputs.find((f) => f.resource === 'Shelter')?.qty ?? 0) *
        (i.scale ?? 1) * roleNeeds(catalog, state.settings, i.person!),
    0,
  );
  const capacity =
    inst.status === 'active' && !inst.shelterClosed
      ? plan.outputs.find((o) => o.resource === 'Shelter')!.qty * (inst.scale ?? 1) *
        (state.settings.wearAndRepair ? conditionOutput(inst, plan.system) : 1)
      : 0;
  const last = state.ledgers.at(-1)?.shelters?.find((s) => s.id === id);
  return {
    kind: 'shelter' as const,
    closed: !!inst.shelterClosed,
    canClose: inst.status === 'active' && residents.length === 0,
    residents: residents.map((i) => ({ id: i.id, name: `${names(i)}${i.person?.away ? ' — in town' : ''}` })),
    capacity: explained(
      capacity,
      'completed open shelter capacity × instance scale × condition output factor; closed shelter supplies no living space',
    ),
    need: explained(
      need,
      'sum of assigned residents’ catalog Shelter requirements × active role needs × household scales; people in town consume nothing',
    ),
    upkeep: explained(
      inst.shelterClosed ? CLOSED_SHELTER_UPKEEP : 1,
      'closed shelters retain 10% of recurring labor and capital upkeep; other recurring inputs stop',
    ),
    heatNeeded: last
      ? explained(
          last.heatNeeded,
          'this shelter’s actual heat request yesterday, including bedding and other spatial modifiers',
        )
      : null,
    heatReceived: last
      ? explained(
          last.heatReceived,
          'heat delivered to this shelter yesterday; each source is split once among reachable occupied shelters',
        )
      : null,
  };
}
