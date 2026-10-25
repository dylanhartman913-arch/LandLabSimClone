import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { inSeason, nodePosition } from './gather.ts';
import { conditionOutput } from './maintenance.ts';
import type { SystemPlan } from './plans.ts';
import type { InstanceSpatial } from './spatial.ts';
import type { GameState, Instance } from './types.ts';

function serviceable(catalog: Catalog, state: GameState, inst: Instance): boolean {
  return (
    !state.settings.wearAndRepair ||
    conditionOutput(
      inst,
      catalog.systems.find((s) => s.id === inst.systemId)!,
    ) > 0
  );
}

/** A box connects to the nearest spring; ties use the site's stable node id. */
export function springNode(catalog: Catalog, state: GameState, inst: Instance) {
  const rule = catalog.waterInfrastructure;
  if (!rule) return null;
  return (
    state.site.nodes
      .filter((n) => n.type === 'spring' && n.resource === 'Water' && inSeason(n, state.calendar.day))
      .map((n) => ({
        n,
        distance: Math.hypot(inst.x - nodePosition(state, n).x, inst.y - nodePosition(state, n).y),
      }))
      .filter((x) => x.distance <= rule.springRadiusFt)
      .sort((a, b) => a.distance - b.distance || a.n.id.localeCompare(b.n.id))[0]?.n ?? null
  );
}

export function waterSpatial(
  catalog: Catalog,
  state: GameState,
  inst: Instance,
  plan: SystemPlan,
  s: InstanceSpatial,
): void {
  const rule = catalog.waterInfrastructure;
  if (!rule) return;
  if (inst.systemId === rule.diverterId || inst.systemId === rule.testKitId) s.soloKey = inst.id;
  if (!state.settings.storagePools) return;
  const ready = state.instances.some(
    (i) =>
      i.status === 'active' &&
      i.systemId === rule.diverterId &&
      serviceable(catalog, state, i) &&
      (state.lastDay[`${i.systemId}|${i.priority}|solo:${i.id}`]?.sat ?? 0) >= 0.99,
  );
  if (!ready) return;
  for (const out of plan.outputs)
    if (out.flow.qty.kind === 'rainCapture') {
      s.outMult[out.resource] = (s.outMult[out.resource] ?? 1) * (1 - rule.rainLossFraction);
      s.notes.push('Working first flush discards dirty roof runoff; captured water still needs treatment.');
    }
  const rain = state.instances.some(
    (i) =>
      i.status === 'active' &&
      catalog.flows.some(
        (f) => f.systemId === i.systemId && f.direction === 'out' && f.qty.kind === 'rainCapture',
      ),
  );
  if (
    rain &&
    plan.inputs.some((f) => f.resource === 'Water') &&
    plan.outputs.some((f) => f.resource === 'Drinking water')
  ) {
    s.inMult.Labor = (s.inMult.Labor ?? 1) * rule.filterLaborMultiplier;
    s.notes.push(
      'First flush reduces rainwater filter cleaning labor; it does not remove the treatment step.',
    );
  }
}

/** Precautionary screening warning, never a claim that a simulated sample passed. */
export function waterTests(state: GameState, catalog: Catalog, satisfaction: Map<string, number>) {
  const rule = catalog.waterInfrastructure;
  if (!rule || !state.settings.riskEvents) return [];
  const rawSources =
    state.site.nodes.some((n) => n.resource === 'Water') ||
    state.instances.some(
      (i) =>
        i.status === 'active' &&
        catalog.flows.some(
          (f) => f.systemId === i.systemId && f.direction === 'out' && f.resource === 'Water',
        ),
    );
  if (!rawSources) return [];
  return state.instances
    .filter(
      (i) =>
        i.status === 'active' &&
        i.systemId === rule.testKitId &&
        serviceable(catalog, state, i) &&
        (satisfaction.get(i.id) ?? 0) >= 0.99,
    )
    .map((i) => ({
      instanceId: i.id,
      warning:
        'Contamination warning: untreated spring, surface and captured water may contain contaminants. Filter or boil before drinking. First flush and a spring box do not make water potable. This kit does not certify safety.',
    }));
}

export function waterInfrastructureView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const rule = catalog.waterInfrastructure;
  if (!inst || !rule) return null;
  if (inst.systemId === rule.springId)
    return {
      text: `Spring connection: ${springNode(catalog, state, inst)?.id ?? 'no in-season spring in range'}. Output is untreated Water; multiple boxes share site flow.`,
      radius: explained(rule.springRadiusFt, rule.note),
      warning: null,
    };
  if (inst.systemId === rule.testKitId)
    return {
      text: state.settings.riskEvents
        ? 'Testing needs measured labor and reagent spending.'
        : 'Enable Warned risk events to receive water-test warnings.',
      radius: null,
      warning: state.ledgers.at(-1)?.waterTests?.find((t) => t.instanceId === id)?.warning ?? null,
    };
  if (inst.systemId === rule.diverterId)
    return {
      text: state.settings.storagePools
        ? 'After one fully staffed day, diverts dirty roof runoff and reduces filter cleaning labor. Treatment is still required.'
        : 'Enable Separate storage and winter water for first-flush operation.',
      radius: null,
      warning: null,
    };
  return null;
}
