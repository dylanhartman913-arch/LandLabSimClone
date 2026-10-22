import type { Catalog } from '@homestead/catalog';
import type { GameState } from '../time/types.ts';
import { contractorQuote, returnChecks } from '../time/recovery.ts';
import { stepDay } from '../time/step.ts';
import { dailyAmount, getPlans } from '../time/plans.ts';
import { climateTable } from '../time/climate.ts';
import {
  SURVIVAL,
  COOL_CDD_MIN,
  FOOD_SEVERE_GRACE,
  WB_AWAY_MIN_DAYS,
  type SurvivalNeed,
} from '../time/wellbeing.ts';
import { peopleView } from './people.ts';
import { JOBS, jobPriority, type JobId } from '../time/gather.ts';
import { applyAction, type Action, type ActionBody } from '../replay.ts';

/** Project finish simulation includes current work priorities, weekly caps, jobs and wellbeing.
 * A bounded forecast, never a promise: input purchases/weather/household can change it. */
export function constructionView(state: GameState, catalog: Catalog) {
  const building = state.instances.filter((i) => i.status === 'building');
  const finish = new Map<string, number>();
  const buildingIds = new Set(building.map((i) => i.id));
  let forecast = state;
  for (let day = 1; day <= 365 && finish.size < building.length; day++) {
    forecast = stepDay(forecast, catalog).state;
    for (const i of forecast.instances)
      if (i.status === 'active' && buildingIds.has(i.id) && !finish.has(i.id)) finish.set(i.id, day);
    if (
      !forecast.instances.some((i) => i.status === 'building' && i.contractor) &&
      !forecast.instances.some((i) => i.person && !i.person.away) &&
      !forecast.instances.some((i) => i.person?.away)
    )
      break;
  }
  return building.map((i) => ({
    id: i.id,
    name: catalog.systems.find((s) => s.id === i.systemId)!.name,
    remaining: Math.max(0, i.setupHoursNeeded - i.setupHoursDone),
    eta: finish.get(i.id) ?? null,
    contractor: !!i.contractor,
    quote: contractorQuote(state, i),
  }));
}

export function townRecoveryView(state: GameState, catalog: Catalog) {
  const away = peopleView(state, catalog).filter((p) => p.away);
  const waits = state.instances
    .filter((i) => i.person?.away)
    .map((i) => Math.max(0, WB_AWAY_MIN_DAYS - (state.calendar.absDay - 1 - i.person!.away!.since)));
  return {
    people: away.map((p) => `${p.label} (${p.id})`),
    causes: [
      ...new Set(away.flatMap((p) => p.why.filter((t) => t.points < 0).map((t) => t.label.split(':')[0]))),
    ],
    checks: away.length ? returnChecks(state, catalog) : [],
    minimumStay: WB_AWAY_MIN_DAYS,
    days: waits.length ? Math.max(...waits) : 0,
  };
}

export interface SurvivalAlert {
  id: string;
  title: string;
  detail: string;
  resource: string | null;
  work?: boolean;
}

/** Today's survival first; prospective consumables second. Annual design advice is elsewhere. */
export function survivalAlerts(state: GameState, catalog: Catalog): SurvivalAlert[] {
  const out: SurvivalAlert[] = [];
  const recovery = townRecoveryView(state, catalog);
  if (recovery.people.length)
    out.push({
      id: 'town-recovery',
      title: 'Household recovery comes first',
      resource: 'Heat',
      work: true,
      detail: `${recovery.people.join(', ')} are in town after wellbeing reached zero. Causes at departure: ${recovery.causes.join(', ') || 'see each person’s wellbeing history'}. Residents in town supply no labor. ${recovery.checks.join(' ')} Minimum stay remaining: ${recovery.days} days. Book a paid crew in Work to finish critical projects.`,
    });
  const last = state.ledgers.at(-1);
  const rows: [SurvivalNeed, string, string][] = [
    ['drinkingWater', 'Drinking water', 'Drinking water'],
    ['food', 'Food', 'Food'],
    ['heat', 'Heated shelter', 'Heat'],
    ['shelter', 'Shelter', 'Shelter'],
    ['sanitation', 'Sanitation', 'Sanitation'],
  ];
  if (last)
    for (const [need, row, resource] of rows) {
      const n = last.needs[row as keyof typeof last.needs];
      if (n.needed <= 1e-9 || n.delivered / n.needed >= SURVIVAL[need].short - 1e-9) continue;
      const affected = peopleView(state).filter((p) => !p.away);
      if (!affected.length) continue;
      const grace = Math.min(
        ...affected.map((p) => {
          const person = state.instances.find((i) => i.id === p.id)!.person!;
          const normal = SURVIVAL[need].graceDays - person.short[need] + 1;
          const severe =
            need === 'food' && person.severeFood > 0 ? FOOD_SEVERE_GRACE - person.severeFood + 1 : Infinity;
          return Math.max(0, Math.min(normal, severe));
        }),
      );
      const eta = affected
        .map((p) => {
          const change = p.why.reduce((a, t) => a + t.points, 0);
          return change < 0 ? Math.ceil(p.wellbeing.value / -change) : null;
        })
        .filter((n): n is number => n !== null);
      out.push({
        id: need,
        title: `${resource} needs attention now`,
        resource,
        work: true,
        detail: `${affected.map((p) => `${p.label} (${p.id})`).join(', ')}: ${Math.round((n.delivered / n.needed) * 100)}% met yesterday. ${grace ? `${grace} day${grace === 1 ? '' : 's'} until wellbeing penalties if the shortage persists` : 'Wellbeing penalties apply now'}; ${eta.length ? `about ${Math.min(...eta)} days to town at yesterday’s net wellbeing loss` : 'departure timing depends on wellbeing'}. Restore supply and required inputs; building projects do not supply anything yet.`,
      });
    }
  if (
    last &&
    last.weather.cdd > COOL_CDD_MIN &&
    last.needs['Cooled shelter'].needed > 1e-9 &&
    last.needs['Cooled shelter'].delivered / last.needs['Cooled shelter'].needed < 0.5 &&
    peopleView(state).some((p) => !p.away)
  ) {
    out.push({
      id: 'cooling',
      title: 'Cooling is short in hot weather',
      resource: 'Cooling',
      work: true,
      detail:
        'Less than half of current shelter cooling was delivered yesterday. Cooling shortages reduce wellbeing each hot day. Check delivered cooling, electricity, labor and placement within reach of the shelter.',
    });
  }
  const plans = getPlans(catalog, state.site);
  const climate = climateTable(state.site);
  const consumables: (SurvivalAlert & { days: number })[] = [];
  for (const r of catalog.resources) {
    if (!isConsumable(r)) continue;
    // A usage-priced backstop tops this up on demand while cash lasts; cash runway is reported elsewhere.
    if (
      state.instances.some(
        (i) => i.status === 'active' && plans.bySystem.get(i.systemId)!.backstop?.prices[r.name] !== undefined,
      )
    )
      continue;
    // Today's weather, then the average climate: seasonal inputs (seed, heating fuel) warn before they start.
    const demand: number[] = [];
    for (let k = 0; k < CONSUMABLE_WARN_DAYS; k++) {
      const day = (state.calendar.day + k) % 365;
      const w = k === 0 ? state.weather : climate.days[day]!;
      let daily = 0;
      for (const i of state.instances)
        if (i.status === 'active' && !i.person?.away)
          for (const f of plans.bySystem.get(i.systemId)!.inputs)
            if (f.resource === r.name && f.role !== 'boost') daily += dailyAmount(f, day, w, climate) * (i.scale ?? 1);
      demand.push(daily);
    }
    const made = last?.resources[r.name]?.produced ?? 0;
    const net = demand.map((d) => Math.max(0, d - made));
    let stock = state.stocks[r.name] ?? 0;
    let days = 0;
    while (days < net.length && stock >= net[days]! - 1e-9) stock -= net[days++]!;
    if (days >= CONSUMABLE_WARN_DAYS) continue;
    const onHand = days + stock / net[days]!;
    const startsIn = net.findIndex((d) => d > 1e-9);
    consumables.push({
      id: r.name,
      title: `${r.name} reserve is low`,
      resource: r.name,
      work: true,
      days: onHand,
      detail: `${onHand.toFixed(1)} days on hand${startsIn > 0 ? ` once demand starts in ${startsIn} day${startsIn === 1 ? '' : 's'}` : ''} at full demand from completed systems${made > 1e-9 ? ', net of yesterday’s on-site production' : ''}; future gathering, substitutions and orders are not counted. Without it, the systems that use it ${consumerConsequence(r.name, plans, state)}. Open sources to buy or set a standing order; gathering needs a work cap or rule and resident labor.`,
    });
  }
  consumables.sort((a, b) => a.days - b.days);
  return [...out, ...consumables.map(({ days: _, ...a }) => a)];
}

/** Warn this many days ahead of running out of a consumable input. */
export const CONSUMABLE_WARN_DAYS = 7;

/** Buyable stock that systems burn or use up: fuel, seed, feed, bedding, amendments. Survival needs have their own alerts. */
function isConsumable(r: Catalog['resources'][number]): boolean {
  return r.storable && r.class === 'Flow' && !r.needsRow && r.marketAvailable;
}

function consumerConsequence(resource: string, plans: ReturnType<typeof getPlans>, state: GameState): string {
  const names = new Set<string>();
  for (const i of state.instances)
    if (i.status === 'active' && plans.bySystem.get(i.systemId)!.inputs.some((f) => f.resource === resource && f.role !== 'boost'))
      names.add(plans.bySystem.get(i.systemId)!.system.name);
  return `(${[...names].join(', ')}) slow or stop`;
}

/** Early warning independent of tutorial progress: seasonal climate, not a weather promise. */
export function winterPreparation(state: GameState) {
  const climate = climateTable(state.site);
  let days = 0;
  while (days < 365 && climate.days[(state.calendar.day + days) % 365]!.hdd <= 22) days++;
  return days === 365
    ? 'No cold snap above 22 HDD in the average climate. Real weather can differ.'
    : `First cold conditions above 22 HDD in the average climate: ${days === 0 ? 'now' : `about ${days} days away`}. Compare the construction finish forecast in Work today; finish heating within reach of the shelter, reduce heat loss, and secure recurring fuel before then. Real weather can arrive earlier.`;
}

/** Needs rows a recovery project or standing order can restore. */
const RECOVERY_ROWS = new Set(['Shelter', 'Heated shelter', 'Sanitation', 'Drinking water', 'Water', 'Food', 'Cooking fuel']);
/** The route is simulated this long for a return, then this long after it to check people stay. */
export const ROUTE_HORIZON_DAYS = 60;
export const ROUTE_STAY_DAYS = 30;
/** Days of use a standing order keeps on hand; it buys only below this. */
const ROUTE_DEMAND_DAYS = 14;

export interface RecoveryStep {
  label: string;
  detail: string;
  /** Prepaid now; standing orders are charged at each market trip and counted in `marketSpend`. */
  cost: number;
  action: ActionBody;
}

/**
 * A finite, priced route home for a household in town with no resident labor: prepaid crews for
 * unfinished survival projects, system upkeep ahead of gathering, and standing orders for what the
 * returning household would run short of. The route is simulated, never assumed: it reports the
 * forecast return day, whether everyone is still home ROUTE_STAY_DAYS later, and its cash, or the
 * exact checks that still fail. Real weather and later player actions can change the outcome.
 */
export function recoveryRoute(state: GameState, catalog: Catalog) {
  if (!state.instances.some((i) => i.person?.away)) return null;
  const plans = getPlans(catalog, state.site);
  const climate = climateTable(state.site);
  const steps: RecoveryStep[] = [];
  const meta = (name: string) => catalog.resources.find((r) => r.name === name);
  const building = state.instances.filter(
    (i) =>
      i.status === 'building' &&
      !i.contractor &&
      plans.bySystem.get(i.systemId)!.outputs.some((f) => RECOVERY_ROWS.has(meta(f.resource)?.needsRow ?? '')),
  );
  // Cheapest crews first, while cash lasts: a quick fix can bring people home while a slow one waits.
  const unfunded: string[] = [];
  const funded = new Set<string>();
  let budget = state.cash;
  for (const { i, q } of building
    .map((i) => ({ i, q: contractorQuote(state, i) }))
    .sort((a, b) => a.q.cost - b.q.cost)) {
    const name = `${plans.bySystem.get(i.systemId)!.system.name} (${i.id})`;
    if (q.cost > budget + 1e-9) {
      unfunded.push(
        `${name}: crew needs $${q.cost.toFixed(2)}; $${Math.max(0, budget).toFixed(2)} is left after cheaper crews (missing $${(q.cost - budget).toFixed(2)}). Without a crew it waits for resident labor.`,
      );
      continue;
    }
    budget -= q.cost;
    funded.add(i.id);
    steps.push({
      label: `Book a crew for ${name}`,
      detail: `${q.hours.toFixed(1)} h at $${q.rate}/h, ${q.hoursPerDay} h/day: about ${q.days} day${q.days === 1 ? '' : 's'}. Uses no resident labor.`,
      cost: q.cost,
      action: { kind: 'hireConstruction', id: i.id },
    });
  }
  const upkeep = jobPriority(state.settings, 'upkeep');
  const gathering: JobId[] = ['gather-water', 'gather-wood', 'gather-food'];
  if (gathering.some((j) => jobPriority(state.settings, j) <= upkeep)) {
    const priorities: Partial<Record<JobId, number>> = { ...state.settings.work?.priorities };
    for (const j of JOBS) priorities[j.id] = jobPriority(state.settings, j.id);
    priorities.upkeep = 1;
    for (const j of gathering) priorities[j] = Math.max(2, priorities[j]!);
    steps.push({
      label: 'Look after systems before gathering',
      detail: 'Returning residents arrive at reduced wellbeing and labor. Stoves, filters and toilets need upkeep first; standing orders below replace most fetching.',
      cost: 0,
      action: { kind: 'settings', settings: { work: { ...state.settings.work, priorities } } },
    });
  }
  // Demand from the whole household and every system the route completes, over the next two weeks. Stock on
  // hand runs down without residents to fetch, so every bought input gets a standing order.
  const running = funded;
  const backstopped = (name: string) =>
    state.instances.some((i) => i.status === 'active' && plans.bySystem.get(i.systemId)!.backstop?.prices[name] !== undefined);
  const standing = state.market?.standing ?? [];
  for (const r of catalog.resources) {
    if (!(r.name === 'Food' || r.name === 'Drinking water' || isConsumable(r)) || !r.marketAvailable || backstopped(r.name)) continue;
    let total = 0;
    for (let k = 0; k < ROUTE_DEMAND_DAYS; k++) {
      const day = (state.calendar.day + k) % 365;
      const w = k === 0 ? state.weather : climate.days[day]!;
      for (const i of state.instances)
        if (i.person || i.status === 'active' || running.has(i.id))
          for (const f of plans.bySystem.get(i.systemId)!.inputs)
            if (f.resource === r.name && f.role !== 'boost') total += dailyAmount(f, day, w, climate) * (i.scale ?? 1);
    }
    const daily = total / ROUTE_DEMAND_DAYS;
    if (daily <= 1e-9) continue;
    const keepDays = r.name === 'Drinking water' ? 3 : 7;
    const keepAbove = Math.ceil(daily * keepDays);
    if (standing.some((o) => o.resource === r.name && o.keepAbove >= keepAbove)) continue;
    const orderUpTo = keepAbove * 3;
    steps.push({
      label: `Standing order: keep ${r.name} above ${keepAbove} ${r.unit}`,
      detail: `About ${keepDays} days of the returning household's and systems' use, topped up to ${orderUpTo} ${r.unit} at $${r.marketPrice}/${r.unit} plus any delivery fee. It buys only below that level, and keeps buying after return until you change it in Market.`,
      cost: 0,
      action: { kind: 'standing', resource: r.name, keepAbove, orderUpTo },
    });
  }
  const upfront = steps.reduce((a, st) => a + st.cost, 0);
  const actions: ActionBody[] = steps.map((st) => st.action);
  const base = {
    steps,
    actions,
    upfront,
    cash: state.cash,
    minimumStay: townRecoveryView(state, catalog).days,
    horizon: ROUTE_HORIZON_DAYS,
    stayDays: ROUTE_STAY_DAYS,
    unfunded,
  };
  let s = state;
  for (const body of actions) s = applyAction(catalog, s, { ...body, at: s.calendar.absDay } as Action);
  let returnDay: number | null = null;
  let staysHome = false;
  let marketSpend = 0;
  let cashAtReturn: number | null = null;
  let leftAgain: number | null = null;
  for (let day = 1; day <= ROUTE_HORIZON_DAYS + ROUTE_STAY_DAYS; day++) {
    const r = stepDay(s, catalog);
    s = r.state;
    if (returnDay === null) {
      marketSpend += Object.values(r.ledger.spend.market).reduce((a, v) => a + v, 0) + r.ledger.spend.delivery;
      if (!s.instances.some((i) => i.person?.away)) {
        returnDay = day;
        cashAtReturn = s.cash;
      } else if (day >= ROUTE_HORIZON_DAYS) break;
    } else if (r.events.some((e) => e.kind === 'went-to-town')) {
      leftAgain = day;
      break;
    }
    if (returnDay !== null && day >= returnDay + ROUTE_STAY_DAYS) {
      staysHome = true;
      break;
    }
  }
  return {
    ...base,
    returnDay,
    staysHome,
    marketSpend,
    cashAtReturn,
    leftAgain,
    remaining: returnDay === null ? returnChecks(s, catalog) : [],
  };
}
export type RecoveryRoute = NonNullable<ReturnType<typeof recoveryRoute>>;
