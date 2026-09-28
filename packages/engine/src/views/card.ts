import type { Catalog, InputRole } from '@homestead/catalog';
import { getSystem, indexCatalog } from '../catalog-index.ts';
import { explained, type Explained } from '../provenance.ts';
import { maturity } from '../time/step.ts';
import { getPlans } from '../time/plans.ts';
import { computeSpatial, instanceGroupKey } from '../time/spatial.ts';
import type { GameState, Instance } from '../time/types.ts';
import { resourceWeek, type ResourceWeek } from './resources.ts';
import { systemFlows, type FlowView } from './system.ts';

export interface CardInput {
  view: FlowView;
  role: InputRole;
  /** Needed per the flow's own period (for one system). */
  needed: Explained;
  /** Supplied per the flow's own period. */
  supplied: Explained;
  /** supplied ÷ needed (0-1). */
  share: Explained;
}

export interface CardOutput {
  view: FlowView;
  /** Produced per the flow's own period (live for an instance, nominal in the catalog). */
  produced: Explained;
  /** Where this resource went across the design last week. */
  week: ResourceWeek | null;
}

export interface CardView {
  systemId: string;
  inputs: CardInput[];
  outputs: CardOutput[];
  /** Where the instance sits: adjacency and terrain effects, and assigned capacities. */
  spatial: null | {
    notes: string[];
    links: {
      resource: string;
      providerId: string | null;
      share: number;
      distanceFt: number | null;
      linked: boolean;
      maxDistanceFt: number | null;
      candidates: { id: string; name: string; distanceFt: number }[];
    }[];
  };
  instance: null | {
    id: string;
    status: Instance['status'];
    buildMode: Instance['buildMode'];
    satisfaction: Explained;
    limitedBy: string | null;
    maturity: Explained;
    ageDays: number;
    priority: number;
    setupProgress: Explained;
  };
}

/**
 * The System Card's numbers. For a placed instance, bars show that instance's
 * live satisfaction yesterday; from the catalog, they show what the current
 * design supplied of each input last week.
 */
export function systemCard(
  state: GameState,
  catalog: Catalog,
  systemId: string,
  instanceId?: string,
): CardView {
  const flows = systemFlows(catalog, systemId, state.site.assumptions);
  const week = new Map(resourceWeek(state, catalog).map((r) => [r.resource, r]));
  const inst = instanceId ? state.instances.find((i) => i.id === instanceId) : undefined;
  const group = inst ? state.lastDay[instanceGroupKey(catalog, state, inst)] : undefined;
  const plansAll = getPlans(catalog, state.site);
  const plan = plansAll.bySystem.get(systemId)!;
  const idx = indexCatalog(catalog);

  const inputs: CardInput[] = flows.inputs.map((v) => {
    const role = v.flow.inputRole ?? 'required';
    const needed = v.qty.value;
    let share: number;
    let how: string;
    let refs: Record<string, number>;
    if (inst && group) {
      const rec = group.inputs[v.resource];
      share = rec && rec.requested > 0 ? Math.min(1, rec.granted / rec.requested) : rec ? 1 : 0;
      how = 'this instance yesterday: supply offered ÷ requested';
      refs = {
        requestedPerDay: rec?.requested ?? 0,
        offeredPerDay: rec?.granted ?? 0,
        usedPerDay: rec?.received ?? 0,
      };
    } else if (v.flow.period === 'One-time') {
      const stock = state.stocks[v.resource] ?? 0;
      share = needed > 0 ? Math.min(1, stock / needed) : 1;
      how = 'stock on hand ÷ amount needed to build (the rest is brought in)';
      refs = { stock, needed };
    } else if (role === 'capacity' || role === 'boost') {
      const res = idx.resourceByName.get(v.resource)!;
      const supply =
        res.class === 'Service'
          ? (state.services[v.resource] ?? 0)
          : state.instances.reduce((a, i) => {
              if (i.status !== 'active') return a;
              const p = getPlans(catalog, state.site).bySystem.get(i.systemId)!;
              let s = 0;
              for (const o of p.outputs)
                if (o.resource === v.resource && o.isCapacity)
                  s += o.qty * maturity(i, p, state.calendar.absDay);
              return a + s;
            }, 0);
      share = needed > 0 ? Math.min(1, supply / needed) : 1;
      how =
        res.class === 'Service'
          ? 'yesterday’s service supply across the design ÷ what one more would need'
          : 'capacity the design provides ÷ what one more would need';
      refs = { available: supply, needed };
    } else if (role === 'ambient') {
      const ok =
        state.site.ambient[v.resource] === true ||
        state.instances.some((i) => {
          const p = getPlans(catalog, state.site).bySystem.get(i.systemId)!;
          return i.status === 'active' && p.outputs.some((o) => o.resource === v.resource);
        });
      share = ok ? 1 : 0;
      how = ok ? 'the site supplies it' : 'this site does not supply it (add the site system that does)';
      refs = {};
    } else {
      const w = week.get(v.resource);
      share = w ? w.share.value : 0;
      how = w
        ? 'what the design supplied of this resource last week ÷ what was asked for'
        : 'nothing in the design makes it yet';
      refs = { supplied: w?.supplied.value ?? 0, needed: w?.needed.value ?? 0 };
    }
    const supplied = needed * share;
    return {
      view: v,
      role,
      needed: explained(needed, v.qty.explain.formula, { ...v.qty.explain }),
      supplied: explained(supplied, `needed × share (${how})`, { refs: { needed, share, ...refs } }),
      share: explained(share, how, { refs }),
    };
  });

  const outputs: CardOutput[] = flows.outputs.map((v) => {
    let produced = v.qty.value;
    let formula = `${v.qty.explain.formula} (nominal, at full satisfaction)`;
    let refs: Record<string, number> = { nominal: v.qty.value };
    if (inst && group) {
      const human = plan.isHuman;
      const health = inst.person?.health ?? 1;
      const mat = maturity(inst, plan, state.calendar.absDay);
      const mult = human ? health : group.sat * group.boostMult * mat;
      produced = v.qty.value * mult;
      formula = human
        ? 'nominal × health'
        : 'nominal × satisfaction × boosts × maturity (this instance, yesterday)';
      refs = human
        ? { nominal: v.qty.value, health }
        : { nominal: v.qty.value, satisfaction: group.sat, boosts: group.boostMult, maturity: mat };
    }
    return {
      view: v,
      produced: explained(produced, formula, {
        refs,
        ...(v.qty.explain.assumptions ? { assumptions: v.qty.explain.assumptions } : {}),
      }),
      week: week.get(v.resource) ?? null,
    };
  });

  let instance: CardView['instance'] = null;
  if (inst) {
    const mat = maturity(inst, plan, state.calendar.absDay);
    const sat = plan.isHuman
      ? (inst.person?.health ?? 1)
      : (group?.sat ?? (inst.status === 'active' ? 1 : 0));
    const ageDays = inst.activeSince === null ? 0 : Math.max(0, state.calendar.absDay - inst.activeSince);
    instance = {
      id: inst.id,
      status: inst.status,
      buildMode: inst.buildMode,
      satisfaction: explained(
        sat,
        plan.isHuman
          ? 'health = 1 − Σ weight × (1 − 7-day share met) for food, drinking water, heat, shelter (floor 0.3)'
          : 'min over required, capacity, and ambient inputs of received ÷ requested (yesterday)',
        { refs: plan.isHuman ? {} : { satisfaction: sat } },
      ),
      limitedBy: plan.isHuman ? null : (group?.limitedBy ?? null),
      maturity: explained(mat, 'min(1, age ÷ years to full output)', {
        refs: { ageDays, yearsToFullOutput: getSystem(catalog, systemId).yearsToFullOutput },
      }),
      ageDays,
      priority: inst.priority,
      setupProgress: explained(
        inst.setupHoursNeeded > 0 ? inst.setupHoursDone / inst.setupHoursNeeded : 1,
        'setup hours done ÷ setup hours needed',
        { refs: { done: inst.setupHoursDone, needed: inst.setupHoursNeeded } },
      ),
    };
  }
  let spatial: CardView['spatial'] = null;
  if (inst) {
    const sp = computeSpatial(catalog, state).get(inst.id);
    const links = catalog.assignedCapacities
      .filter((a) => sp?.assigned[a.resource])
      .map((a) => {
        const cur = sp!.assigned[a.resource]!;
        const half = (id: string) => Math.sqrt(getSystem(catalog, id).footprintSqft) / 2;
        const candidates = state.instances
          .filter((p) => p.id !== inst.id && p.status === 'active')
          .filter((p) =>
            plansAll.bySystem.get(p.systemId)!.outputs.some((o) => o.resource === a.resource && o.isCapacity),
          )
          .map((p) => {
            const dx = Math.max(0, Math.abs(p.x - inst.x) - half(p.systemId) - half(inst.systemId));
            const dy = Math.max(0, Math.abs(p.y - inst.y) - half(p.systemId) - half(inst.systemId));
            return { id: p.id, name: getSystem(catalog, p.systemId).name, distanceFt: Math.hypot(dx, dy) };
          })
          .filter((c) => a.maxDistanceFt === null || c.distanceFt <= a.maxDistanceFt)
          .sort((x, y) => x.distanceFt - y.distanceFt);
        return {
          resource: a.resource,
          providerId: cur.providerId,
          share: cur.share,
          distanceFt: cur.distanceFt,
          linked: inst.links?.[a.resource] !== undefined,
          maxDistanceFt: a.maxDistanceFt,
          candidates,
        };
      });
    spatial = { notes: sp?.notes ?? [], links };
  }
  return { systemId, inputs, outputs, spatial, instance };
}
