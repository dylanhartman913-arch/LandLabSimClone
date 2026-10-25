import { toolRule } from '../time/tools.ts';
import type { Catalog, InputRole } from '@homestead/catalog';
import { getSystem, indexCatalog } from '../catalog-index.ts';
import { explained, type Explained } from '../provenance.ts';
import { maturity } from '../time/step.ts';
import { getPlans } from '../time/plans.ts';
import { livestockRule } from '../time/livestock.ts';
import { computeSpatial, instanceGroupKey, rangeDistanceText } from '../time/spatial.ts';
import type { GameState, Instance } from '../time/types.ts';
import { resourceWeek, type ResourceWeek } from './resources.ts';
import { systemFlows, type FlowView } from './system.ts';

/** A preview's stock bar is full at this many days of cover. */
export const STOCK_FULL_DAYS = 14;

export interface CardInput {
  view: FlowView;
  role: InputRole;
  /** Needed per the flow's own period (for one system). */
  needed: Explained;
  /** Supplied per the flow's own period. */
  supplied: Explained;
  /** supplied ÷ needed (0-1). */
  share: Explained;
  /** Catalog preview of a stored supply (LL-19): stock on hand and how long it lasts with this system added. */
  stock?: { onHand: Explained; days: Explained | null };
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
  basis: string;
  hasMeasurement: boolean;
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
      candidates: { id: string; name: string; distanceFt: number; distanceText: string }[];
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
  const group = inst?.status === 'active' ? state.lastDay[instanceGroupKey(catalog, state, inst)] : undefined;
  const plansAll = getPlans(catalog, state.site);
  const plan = plansAll.bySystem.get(systemId)!;
  const idx = indexCatalog(catalog);

  const stockView = new Map<string, NonNullable<CardInput['stock']>>();
  const inputs: CardInput[] = flows.inputs.map((v) => {
    const role = v.flow.inputRole ?? 'required';
    const inputFactor =
      inst && (state.settings.shelterOccupancy || (state.settings.toolGathering && toolRule(catalog, inst.systemId))) && v.flow.period !== 'One-time'
        ? (computeSpatial(catalog, state).get(inst.id)?.inMult[v.resource] ?? 1)
        : 1;
    const needed = v.qty.value * inputFactor;
    let share: number;
    let how: string;
    let refs: Record<string, number>;
    if (v.flow.period === 'One-time' && inst?.materialsDrawn) {
      share = 1;
      how = 'supplied during construction; not a recurring input';
      refs = { suppliedDuringConstruction: needed };
    } else if (inst?.status === 'building' && v.flow.period !== 'One-time') {
      share = 0;
      how = 'not operating while under construction';
      refs = { needed };
    } else if (inst && group) {
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
    } else if (!inst && idx.resourceByName.get(v.resource)?.storable && idx.resourceByName.get(v.resource)?.class === 'Flow') {
      // LL-19: a stored supply is judged by what is on hand, not by last week's design-wide share
      // (compost read 200 / 200 with 3.6 lbs in stock when nothing else asked for it).
      const w = week.get(v.resource);
      const stock = state.stocks[v.resource] ?? 0;
      const mine = (plan.inputs.find((f) => f.resource === v.resource)?.weekly ?? 0) / 7;
      const others = Math.max(0, ((w?.needed.value ?? 0) - (w?.supplied.value ?? 0)) / 7);
      const daily = mine + others;
      const days = daily > 1e-9 ? stock / daily : Infinity;
      share = Math.min(1, days / STOCK_FULL_DAYS);
      how = `days this stock lasts with this system added (unmet design demand included) ÷ ${STOCK_FULL_DAYS}; future production, gathering and orders not counted`;
      refs = {
        stock,
        thisSystemPerDay: mine,
        unmetDesignPerDay: others,
        days: Number.isFinite(days) ? days : -1,
      };
      stockView.set(v.flow.id, {
        onHand: explained(stock, 'stock on hand now'),
        days: Number.isFinite(days)
          ? explained(days, 'stock ÷ (this system’s daily use + unmet design demand per day)', {
              refs: { stock, daily },
            })
          : null,
      });
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
      needed: explained(
        needed,
        inputFactor === 1
          ? v.qty.explain.formula
          : `${v.qty.explain.formula} × occupancy/spatial input factor`,
        { ...v.qty.explain },
      ),
      supplied: explained(supplied, `needed × share (${how})`, { refs: { needed, share, ...refs } }),
      share: explained(share, how, { refs }),
      ...(stockView.has(v.flow.id) ? { stock: stockView.get(v.flow.id)! } : {}),
    };
  });

  const outputs: CardOutput[] = flows.outputs.map((v) => {
    let produced = v.qty.value;
    let formula = `${v.qty.explain.formula} (nominal, at full satisfaction)`;
    let refs: Record<string, number> = { nominal: v.qty.value };
    if (inst?.status === 'building' || (inst && !group && v.flow.period !== 'Capacity')) {
      produced = 0;
      formula = inst.status === 'building' ? 'no output before construction completes' : 'no operating measurement yet';
    } else if (inst && v.flow.period === 'Capacity') {
      const mat = maturity(inst, plan, state.calendar.absDay);
      produced = v.qty.value * mat * (inst.scale ?? 1);
      formula = 'completed capacity × maturity × instance scale (not weekly production)';
      refs = { nominal: v.qty.value, maturity: mat, scale: inst.scale ?? 1 };
    } else if (inst && group) {
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
    if (inst && state.settings.shelterOccupancy && v.resource === 'Shelter') {
      const factor = computeSpatial(catalog, state).get(inst.id)?.outMult.Shelter ?? 1;
      produced *= factor;
      formula += ' × occupancy/condition output factor';
      refs.shelterOutput = factor;
    }
    if (inst && group && state.settings.foodPreservation && v.resource === 'Food storage') {
      const factor = computeSpatial(catalog, state).get(inst.id)?.outMult[v.resource] ?? 1;
      produced *= group.sat * group.boostMult * factor;
      formula += ' × realized operation × storage output factor';
      refs.operating = group.sat;
      refs.storageOutput = factor;
    }
    const tool = inst && state.settings.toolGathering ? toolRule(catalog, inst.systemId) : null;
    if (tool && tool.resource === v.resource) {
      // LL-34: the tool's output now arrives through gathering at the nodes (see Tool use).
      produced = 0;
      formula = 'no standalone output: the tool multiplies gathering at the nodes';
      refs = { nominal: v.qty.value };
    }
    if (inst && group && (state.settings.livestockLifecycle || inst.animal) && livestockRule(catalog, inst)) {
      const factor = computeSpatial(catalog, state).get(inst.id)?.outMult[v.resource] ?? 1;
      produced *= factor * (v.flow.period === 'Capacity' ? 1 : (inst.scale ?? 1));
      formula += ' × lifecycle/spatial output factor × cohort scale';
      refs.lifecycleOutput = factor;
      refs.cohortScale = inst.scale ?? 1;
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
            return {
              id: p.id,
              name: getSystem(catalog, p.systemId).name,
              distanceFt: Math.hypot(dx, dy),
              distanceText: rangeDistanceText(Math.hypot(dx, dy), a.maxDistanceFt),
            };
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
  return {
    systemId, inputs, outputs, spatial, instance,
    hasMeasurement: !!group,
    basis: !inst
      ? `Catalog preview: output at full supply and maturity. Stored supplies show what is on hand and how long it lasts with this system (a full bar is ${STOCK_FULL_DAYS} days or more); other inputs show last week's design availability. Not a promise of output.`
      : inst.status === 'building'
        ? 'Under construction: no operating output. Recurring needs begin after completion.'
        : !group
          ? 'Completed: awaiting the first operating day. Capacity is available; recurring output has not been measured.'
          : 'Operating measurement: yesterday’s supply share applied to catalog rates below. Capacity is available space, not weekly production. Design totals below cover the last 7 days.',
  };
}
