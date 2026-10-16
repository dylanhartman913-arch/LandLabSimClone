import type { Catalog } from '@homestead/catalog';
import { getSystem } from '../catalog-index.ts';
import { explained } from '../provenance.ts';
import {
  canPlace,
  costFor,
  footprintSideFt,
  parcelSideFt,
  placeSystem,
  setupHoursFor,
} from '../time/game.ts';
import { getPlans, dailyAmount } from '../time/plans.ts';
import { climateTable } from '../time/climate.ts';
import type { BuildMode, GameState } from '../time/types.ts';
import { contractorQuote } from '../time/recovery.ts';
import { constructionView } from './recovery.ts';
import { designBalance } from './hud.ts';
import { computeSpatial } from '../time/spatial.ts';
import { systemFlows } from './system.ts';

/** A sample legal site for a budget/schedule preview. Map reach is checked separately at the cursor. */
export function projectSamplePosition(state: GameState, catalog: Catalog, systemId: string) {
  const side = parcelSideFt(state.settings);
  const half = footprintSideFt(getSystem(catalog, systemId).footprintSqft) / 2;
  const step = Math.max(4, half);
  for (let y = half; y <= side - half; y += step)
    for (let x = half; x <= side - half; x += step) {
      if (canPlace(catalog, state, systemId, x, y).ok) return { x, y };
    }
  return null;
}

/** Purchase impact and nominal ongoing requirements, before any commitment. Pure. */
export function projectPreview(
  state: GameState,
  catalog: Catalog,
  systemId: string,
  mode: BuildMode,
  position = projectSamplePosition(state, catalog, systemId),
) {
  const sys = getSystem(catalog, systemId);
  const plan = getPlans(catalog, state.site).bySystem.get(systemId)!;
  const flows = systemFlows(catalog, systemId, state.site.assumptions);
  const cost = costFor(catalog, systemId, mode);
  const hours = setupHoursFor(catalog, systemId, mode);
  const candidate =
    position && canPlace(catalog, state, systemId, position.x, position.y).ok
      ? placeSystem(catalog, state, systemId, position.x, position.y, mode)
      : null;
  const before = designBalance(state, catalog);
  const after = candidate ? designBalance(candidate.state, catalog) : null;
  const demand = after
    ? Object.values(after.potential.resources)
        .map((r) => {
          const old = before.potential.resources[r.resource]?.consumed.value ?? 0;
          return {
            resource: r.resource,
            unit: r.unit,
            capacity: catalog.resources.find((m) => m.name === r.resource)!.class === 'Capacity',
            delta: explained(
              r.consumed.value - old,
              'planned demand after project − planned demand before project',
              { refs: { before: old, after: r.consumed.value } },
            ),
          };
        })
        .filter((r) => Math.abs(r.delta.value) > 1e-9)
    : [];
  const household = state.instances.filter((i) => i.person).reduce((a, i) => a + (i.scale ?? 1), 0);
  const meals = new Set(catalog.resources.find((r) => r.name === 'Food')!.satisfiedBy);
  let kcalDay = 0;
  for (const f of plan.outputs)
    if (meals.has(f.resource))
      kcalDay += (f.weekly / 7) * (catalog.resources.find((r) => r.name === f.resource)?.factorToNeed ?? 1);
  const human = [...getPlans(catalog, state.site).bySystem.values()].find((p) => p.isHuman)!;
  const dailyFood = human.inputs.filter((f) => f.resource === 'Food').reduce((a, f) => a + f.weekly / 7, 0);
  const food =
    kcalDay > 0
      ? {
          daily: explained(
            kcalDay,
            'Σ accepted food outputs × kcal conversion ÷ 7; full required inputs and maturity, before optional boosts',
          ),
          perPerson: explained(
            household > 0 ? kcalDay / household : 0,
            'annual-average nominal food kcal/day ÷ adult-equivalent household',
            { refs: { kcalDay, household } },
          ),
          share: explained(
            household > 0 ? kcalDay / (household * dailyFood) : 0,
            'nominal daily food ÷ household daily calorie demand',
            { refs: { kcalDay, household, dailyFood } },
          ),
          timing: plan.outputs
            .filter((f) => meals.has(f.resource))
            .map(
              (f) =>
                `${f.resource}: ${f.shape === 'window' ? `daily during days ${f.window!.first + 1}–${f.window!.last + 1}; harvest event marks the start of that window` : f.shape === 'growing' ? 'distributed through the growing season' : 'distributed daily while operating'}`,
            )
            .join('; '),
        }
      : null;
  const winter = (() => {
    if (!candidate) return null;
    const climate = climateTable(state.site);
    const coldest = climate.days.reduce((best, w, k) => (w.hdd > climate.days[best]!.hdd ? k : best), 0);
    const heat = (s: GameState) => {
      // Shelter requests are charged for every completed shelter, including empty ones.
      // Reflect planned completion and actual host heat-loss modifiers without changing the live model.
      const b = designBalance(s, catalog);
      const r = b.potential.resources.Heat;
      return r?.consumed.value ?? 0;
    };
    const added = heat(candidate.state) - heat(state);
    const future = {
      ...candidate.state,
      instances: candidate.state.instances.map((i) => ({ ...i, status: 'active' as const })),
    };
    const spatial = computeSpatial(catalog, future);
    let coldNeed = 0;
    let coldSupply = 0;
    for (const i of future.instances) {
      const p = getPlans(catalog, state.site).bySystem.get(i.systemId)!;
      for (const f of p.inputs)
        if (f.resource === 'Heat')
          coldNeed +=
            dailyAmount(f, coldest, climate.days[coldest]!, climate) *
            (i.scale ?? 1) *
            (spatial.get(i.id)?.inMult.Heat ?? 1);
      for (const f of p.outputs)
        if (f.resource === 'Heat' && !spatial.get(i.id)?.undelivered.Heat)
          coldSupply +=
            dailyAmount(f, coldest, climate.days[coldest]!, climate) *
            (i.scale ?? 1) *
            (spatial.get(i.id)?.outMult.Heat ?? 1);
    }
    // Annual model is separate from a cold-day peak based on this project's catalog climate shape.
    const peak = plan.inputs
      .filter((f) => f.resource === 'Heat')
      .reduce((a, f) => a + dailyAmount(f, coldest, climate.days[coldest]!, climate), 0);
    return {
      added: explained(added, 'additional planned annual-average heat demand per week'),
      peak: explained(
        peak,
        'project heat request on the coldest average-climate day, before any new host modifiers',
      ),
      gap: explained(
        Math.max(0, coldNeed - coldSupply),
        'max(0, coldest-day planned heat demand − delivered nominal heat); full inputs and maturity',
        { refs: { coldNeed, coldSupply, dayOfYear: coldest + 1 } },
      ),
    };
  })();
  const schedule = candidate
    ? constructionView(candidate.state, catalog).find((p) => p.id === candidate.instanceId)
    : null;
  const crew = candidate
    ? contractorQuote(
        candidate.state,
        candidate.state.instances.find((i) => i.id === candidate.instanceId)!,
      )
    : null;
  return {
    crew,
    cashAfterCrew: explained(
      state.cash - cost - (crew?.cost ?? 0),
      'current cash − purchase − optional prepaid outside construction',
    ),
    name: sys.name,
    position,
    cost: explained(cost, 'catalog purchase price for selected construction mode'),
    cashAfter: explained(state.cash - cost, 'current cash − project purchase price', {
      refs: { cash: state.cash, cost },
    }),
    hours: explained(hours, 'catalog setup hours × selected mode factor'),
    eta: schedule?.eta ?? null,
    materials: plan.materials.map((m) => ({
      resource: m.resource,
      unit: catalog.resources.find((r) => r.name === m.resource)!.unit,
      needed: explained(m.qty, 'one-time catalog material quantity'),
      missing: explained(
        Math.max(0, m.qty - (state.stocks[m.resource] ?? 0)),
        'max(0, required − stock on hand)',
      ),
    })),
    recurring: flows.inputs.filter((f) => f.flow.period !== 'One-time'),
    demand,
    food,
    winter,
    maturityDays: explained(Math.round(sys.yearsToFullOutput * 365), 'catalog years to full output × 365'),
    running: explained(
      plan.inputs.filter((f) => f.resource === 'Capital').reduce((a, f) => a + f.weekly, 0),
      'nominal recurring Capital requests per week; usage-priced backstops are billed on delivered output',
    ),
  };
}
