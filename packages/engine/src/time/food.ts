import type { Plans } from './plans.ts';
import type { Instance } from './types.ts';

/** Planting stock withheld from meals by the live allocator, including unfinished gardens. */
export function plantingReserve(instances: readonly Instance[], plans: Plans): Record<string, number> {
  const out: Record<string, number> = {};
  const food = new Set(plans.foodFamily);
  for (const inst of instances) {
    const plan = plans.bySystem.get(inst.systemId)!;
    if (plan.isHuman) continue;
    for (const f of plan.inputs) {
      if (f.period !== 'Per season' || f.role !== 'required' || !food.has(f.resource) || f.resource === 'Food') continue;
      out[f.resource] = (out[f.resource] ?? 0) + f.qty * (inst.scale ?? 1);
    }
  }
  return out;
}
