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
import { computeSpatial, thermalDestinations } from '../time/spatial.ts';
import { systemFlows } from './system.ts';
import { findSpot } from '../kits.ts';
import { homeOf } from '../time/gather.ts';

/** A sample legal site for a budget/schedule preview. Map reach is checked separately at the cursor. */
export function projectSamplePosition(state: GameState, catalog: Catalog, systemId: string) {
  // Heat and cooling only count within reach of a shelter: sample next to the home (LL-19).
  const plans = getPlans(catalog, state.site);
  const reaches = plans.bySystem.get(systemId)!.outputs.some((o) => catalog.resources.find((r) => r.name === o.resource)?.deliversTo === 'shelter');
  if (reaches) {
    const shelters = new Set(
      catalog.flows.filter((f) => f.direction === 'out' && f.resource === 'Shelter').map((f) => f.systemId),
    );
    const home = homeOf(state, shelters);
    const near = findSpot(catalog, state, systemId, home.x, home.y);
    if (near) return near;
  }
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
    (!state.settings.cashFloor || state.cash >= cost) &&
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
      // The game’s spatial input factors include occupancy when enabled.
      // Reflect planned completion and actual host heat-loss modifiers without changing the live model.
      const b = designBalance(s, catalog);
      const r = b.potential.resources.Heat;
      return r?.consumed.value ?? 0;
    };
    const added = heat(candidate.state) - heat(state);
    const coldGap = (s: GameState) => {
    const future = {
      ...s,
      instances: s.instances.map((i) => ({ ...i, status: 'active' as const })),
    };
    const spatial = computeSpatial(catalog, future);
    let coldNeed = 0;
    let coldSupply = 0;
      const localNeed = new Map<string, number>();
      const localSupply = new Map<string, number>();
    for (const i of future.instances) {
      const p = getPlans(catalog, state.site).bySystem.get(i.systemId)!;
      for (const f of p.inputs)
          if (f.resource === 'Heat') {
            const request =
            dailyAmount(f, coldest, climate.days[coldest]!, climate) *
            (i.scale ?? 1) *
            (spatial.get(i.id)?.inMult.Heat ?? 1);
            coldNeed += request;
            localNeed.set(i.id, (localNeed.get(i.id) ?? 0) + request);
          }
      for (const f of p.outputs)
        if (f.resource === 'Heat' && !spatial.get(i.id)?.undelivered.Heat)
          coldSupply +=
            dailyAmount(f, coldest, climate.days[coldest]!, climate) *
            (i.scale ?? 1) *
              (spatial.get(i.id)?.outMult.Heat ?? 1);
      }
      if (state.settings.shelterOccupancy) {
        for (const i of future.instances)
          for (const f of getPlans(catalog, state.site).bySystem.get(i.systemId)!.outputs) {
            if (f.resource !== 'Heat') continue;
            const targets = thermalDestinations(catalog, future, i, 'Heat');
            const need = targets.reduce((sum, id) => sum + (localNeed.get(id) ?? 0), 0);
            const amount =
              dailyAmount(f, coldest, climate.days[coldest]!, climate) *
              (i.scale ?? 1) *
              (spatial.get(i.id)?.outMult.Heat ?? 1);
            if (need > 0)
              for (const id of targets)
                localSupply.set(id, (localSupply.get(id) ?? 0) + (amount * (localNeed.get(id) ?? 0)) / need);
          }
        coldSupply = [...localNeed].reduce(
          (sum, [id, need]) => sum + Math.min(need, localSupply.get(id) ?? 0),
          0,
        );
    }
    return { coldNeed, coldSupply };
    };
    const { coldNeed, coldSupply } = coldGap(candidate.state);
    const was = coldGap(state);
    const gapBefore = Math.max(0, was.coldNeed - was.coldSupply);
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
      // LL-19: what a heater does for winter, at the sample position (placement checks reach).
      closes: explained(
        Math.max(0, gapBefore - Math.max(0, coldNeed - coldSupply)),
        'cold-day gap before − cold-day gap after, at the sample position with full inputs',
        { refs: { gapBefore, gapAfter: Math.max(0, coldNeed - coldSupply) } },
      ),
      gapBefore: explained(gapBefore, 'household cold-day heat gap before this project'),
    };
  })();
  // LL-19: each recurring supply — what this system uses, how much on-site systems cover once it is
  // built, what is on hand, and what buying the uncovered part costs.
  const price = (r: string) => {
    const m = catalog.resources.find((x) => x.name === r)!;
    return m.marketAvailable && m.marketPrice !== null ? m.marketPrice : null;
  };
  const supplies = plan.inputs
    .filter(
      (f) =>
        !f.isCapacity &&
        !f.isOneTime &&
        f.weekly > 0 &&
        f.resource !== 'Labor' &&
        f.resource !== 'Capital' &&
        f.role !== 'ambient',
    )
    .map((f) => {
      const meta = catalog.resources.find((x) => x.name === f.resource)!;
      const r = (after ?? before).potential.resources[f.resource];
      const need = r?.consumed.value ?? f.weekly;
      const made = r?.produced.value ?? 0;
      const covered = need > 1e-9 ? Math.min(1, made / need) : 1;
      const uncovered = Math.max(0, need - made);
      const stock = meta.storable ? (state.stocks[f.resource] ?? 0) : null;
      const unit = price(f.resource);
      // This system's share of what the design must bring in from outside.
      const mineUncovered = need > 1e-9 ? (f.weekly / need) * uncovered : 0;
      return {
        resource: f.resource,
        unit: meta.unit,
        role: f.role,
        perWeek: explained(f.weekly, 'catalog weekly use at full operation'),
        covered: explained(
          covered,
          'on-site production ÷ planned demand after this project (annual balance)',
          { refs: { produced: made, demand: need } },
        ),
        onHand: stock === null ? null : explained(stock, 'stock on hand now'),
        days:
          stock === null || uncovered <= 1e-9
            ? null
            : explained(stock / (uncovered / 7), 'stock ÷ daily demand on-site systems do not cover', {
                refs: { stock, uncoveredPerWeek: uncovered },
              }),
        costPerWeek:
          unit === null
            ? null
            : explained(
                mineUncovered * unit,
                'this system’s share of uncovered weekly demand × market price',
                { refs: { perWeek: mineUncovered, price: unit } },
              ),
      };
    });
  const suppliesCost = supplies.reduce(
    (a, x) => a + (x.role === 'required' ? (x.costPerWeek?.value ?? 0) : 0),
    0,
  );
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
    materials: plan.materials.map((m) => {
      const missing = Math.max(0, m.qty - (state.stocks[m.resource] ?? 0));
      const p = price(m.resource);
      return {
        resource: m.resource,
        unit: catalog.resources.find((r) => r.name === m.resource)!.unit,
        needed: explained(m.qty, 'one-time catalog material quantity'),
        missing: explained(missing, 'max(0, required − stock on hand)'),
        // LL-19: brought in free by the current construction rule; this is what it would cost.
        worth:
          p === null
            ? null
            : explained(missing * p, 'missing quantity × market price (not charged)', {
                refs: { missing, price: p },
              }),
      };
    }),
    supplies,
    suppliesCost: explained(suppliesCost, 'Σ required supplies’ uncovered weekly demand × market price, this system’s share', {
        refs: Object.fromEntries(
          supplies.filter((x) => x.costPerWeek).map((x) => [x.resource, x.costPerWeek!.value]),
        ),
      },
    ),
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
