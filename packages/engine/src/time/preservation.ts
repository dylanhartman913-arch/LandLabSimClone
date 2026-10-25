import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { conditionOutput } from './maintenance.ts';
import {
  availableToday,
  drawToday,
  spareLabor,
  workProcessing,
  type ProcessingDay,
  type PreservedBatch,
} from './processing.ts';
import type { GameState } from './types.ts';

export function setPreservation(
  catalog: Catalog,
  state: GameState,
  id: string,
  resource: string | null,
  keep = 0,
): GameState {
  const inst = state.instances.find((i) => i.id === id);
  const recipe = catalog.preservationRecipes?.find((r) => r.systemId === inst?.systemId);
  if (!inst || !recipe) throw new Error('This system has no preservation recipe');
  if (resource && !state.settings.foodPreservation) throw new Error('Food preservation is disabled');
  if (resource && !recipe.inputs.includes(resource))
    throw new Error('This processor cannot preserve that food');
  if (!Number.isFinite(keep) || keep < 0) throw new Error('Keep a finite nonnegative reserve');
  return {
    ...state,
    instances: state.instances.map((i) => {
      if (i.id !== id) return i;
      const copy = { ...i };
      if (resource) copy.preservation = { resource, keep };
      else delete copy.preservation;
      return copy;
    }),
  };
}

export function preservationView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const recipe = catalog.preservationRecipes?.find((r) => r.systemId === inst?.systemId);
  if (!state.settings.foodPreservation || !inst || !recipe) return null;
  return {
    inputs: recipe.inputs.map((name) => ({
      name,
      unit: catalog.resources.find((r) => r.name === name)!.unit,
    })),
    order: inst.preservation ?? null,
    capacity: explained(
      recipe.kcalPerDay * (inst.scale ?? 1),
      'recipe batch ceiling, input kcal/day; limited by actual upkeep, food, spare labor and energy',
    ),
    yield: explained(recipe.yieldFraction, recipe.note),
    labor: explained(recipe.laborPer1000Kcal, 'additional processing hours per 1,000 input kcal'),
    energy: explained(recipe.energyPer1000Kcal, 'additional energy per 1,000 input kcal'),
    energyResource: recipe.energyResource,
    energyUnit:
      recipe.energyResource === 'Sunlight'
        ? 'sun hours'
        : catalog.resources.find((r) => r.name === recipe.energyResource)!.unit,
    lastBatch: state.ledgers.at(-1)?.preserved?.find((b) => b.instanceId === id) ?? null,
  };
}

export function preserveFood(
  d: ProcessingDay & { weather: GameState['weather']; seed: Record<string, number> },
  catalog: Catalog,
  satisfaction: Map<string, number>,
): PreservedBatch[] {
  if (!d.prev.settings.foodPreservation) return [];
  const batches: PreservedBatch[] = [];
  for (const inst of d.instances) {
    if (inst.status !== 'active' || !inst.preservation) continue;
    const recipe = catalog.preservationRecipes?.find((r) => r.systemId === inst.systemId);
    if (!recipe) throw new Error(`No preservation recipe for ${inst.systemId}`);
    const order = inst.preservation;
    const meta = catalog.resources.find((r) => r.name === order.resource)!;
    const factor = meta.factorToNeed!;
    const available = Math.max(
      0,
      availableToday(d, order.resource) - Math.max(order.keep, d.seed[order.resource] ?? 0),
    );
    const energy =
      recipe.energyResource === 'Sunlight' ? d.weather.psh : availableToday(d, recipe.energyResource);
    const sys = catalog.systems.find((s) => s.id === inst.systemId)!;
    const condition = d.prev.settings.wearAndRepair ? conditionOutput(inst, sys) : 1;
    const kcal = Math.min(
      available * factor,
      recipe.kcalPerDay * (inst.scale ?? 1) * condition * (satisfaction.get(inst.id) ?? 0),
      (spareLabor(d) * 1000) / recipe.laborPer1000Kcal,
      (energy * 1000) / recipe.energyPer1000Kcal,
    );
    if (!(kcal > 1e-9)) continue;
    const amount = kcal / factor;
    const outputKcal = kcal * recipe.yieldFraction;
    const labor = (kcal / 1000) * recipe.laborPer1000Kcal;
    const energyUsed = (kcal / 1000) * recipe.energyPer1000Kcal;
    drawToday(d, order.resource, amount, 'processed');
    if (recipe.energyResource !== 'Sunlight') drawToday(d, recipe.energyResource, energyUsed, 'consumed');
    workProcessing(d, inst.systemId, labor);
    d.produced['Preserved food'] = (d.produced['Preserved food'] ?? 0) + outputKcal;
    d.res['Preserved food']!.converted = (d.res['Preserved food']!.converted ?? 0) + outputKcal;
    batches.push({
      instanceId: inst.id,
      resource: order.resource,
      amount,
      inputKcal: kcal,
      outputKcal,
      labor,
      energyResource: recipe.energyResource,
      energy: energyUsed,
    });
  }
  return batches;
}
