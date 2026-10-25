import { accessView } from '../time/access.ts';
import { riskView } from '../time/risks.ts';
import type { Catalog } from '@homestead/catalog';
import type { BuildMode, GameState } from '../time/types.ts';
import { contractorRate, contractorQuote, returnCheckItems, returnChecks, SURVIVAL_RESOURCE } from '../time/recovery.ts';
import { costFor, setupHoursFor } from '../time/game.ts';
import { findSpot } from '../kits.ts';
import { homeOf } from '../time/gather.ts';
import { stepDay } from '../time/step.ts';
import { dailyAmount, getPlans } from '../time/plans.ts';
import { plantingReserve } from '../time/food.ts';
import { climateTable } from '../time/climate.ts';
import {
  SURVIVAL,
  COOL_CDD_MIN,
  HEAT_HDD_MIN,
  FOOD_SEVERE_GRACE,
  WB_AWAY_MIN_DAYS,
  SURVIVAL_NEEDS,
  type SurvivalNeed,
} from '../time/wellbeing.ts';
import { peopleView } from './people.ts';
import type { transitionForecast } from './planning.ts';
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
  const climate = climateTable(state.site);
  const coldIn = climate.days.findIndex((_, k) => climate.days[(state.calendar.day + k) % 365]!.hdd > HEAT_HDD_MIN);
  return building.map((i) => ({
    id: i.id,
    name: catalog.systems.find((s) => s.id === i.systemId)!.name,
    remaining: Math.max(0, i.setupHoursNeeded - i.setupHoursDone),
    eta: finish.get(i.id) ?? null,
    coldIn: getPlans(catalog, state.site).bySystem.get(i.systemId)!.outputs.some((o) => o.resource === 'Heat') && coldIn >= 0 ? coldIn : null,
    daysGained: finish.has(i.id) ? Math.max(0, finish.get(i.id)! - contractorQuote(state, i).days) : null,
    contractor: !!i.contractor,
    quote: contractorQuote(state, i),
  }));
}

export function townRecoveryView(state: GameState, catalog: Catalog) {
  const away = peopleView(state, catalog).filter((p) => p.away);
  const waits = state.instances
    .filter((i) => i.person?.away)
    .map((i) => Math.max(0, WB_AWAY_MIN_DAYS - (state.calendar.absDay - 1 - i.person!.away!.since)));
  // Survival needs only: comfort gaps (cooling, transport, hot water) don't send people to town.
  const survival = new Map(SURVIVAL_NEEDS.map((k) => [SURVIVAL[k].label, SURVIVAL_RESOURCE[k]]));
  const items = away.length ? returnCheckItems(state, catalog) : [];
  const causes = [
    ...new Set(away.flatMap((p) => p.why.filter((t) => t.points < 0).map((t) => t.label.split(':')[0]!))),
  ].filter((c) => survival.has(c));
  return {
    people: away.map((p) => `${p.label} (${p.id})`),
    causes,
    /** What to look for first: the first failing check's resource, else the first cause. */
    resource: items.find((c) => c.resource)?.resource ?? (causes[0] ? survival.get(causes[0])! : null),
    checks: items.map((c) => c.text),
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
  /** Days until the problem bites: 0 when it already does (today's shortages, residents in town). */
  days?: number;
  /** LL-14 section: act now (survival within a week), coming up, supplies for production, comfort. */
  group?: AlertGroup;
  /** Wellbeing weight of what is at stake, to break ties between equal deadlines. */
  weight?: number;
  /** A shortage already happening; `days` then counts down to wellbeing penalties. */
  current?: boolean;
}

export type AlertGroup = 'now' | 'soon' | 'supplies' | 'comfort';
export const ALERT_GROUPS: { id: AlertGroup; label: string }[] = [
  { id: 'now', label: 'Act now' },
  { id: 'soon', label: 'Coming up' },
  { id: 'supplies', label: 'Supplies for production' },
  { id: 'comfort', label: 'Comfort' },
];

/** Warn this many days before cash reaches zero at the recent rate of spending. */
export const CASH_WARN_DAYS = 30;

/** Days of cash at the last four weeks' net spending (running costs, market, backstops, fees; not purchases). */
export function cashRunway(state: GameState, catalog?: Catalog) {
  const recent = state.ledgers.slice(-28);
  if (recent.length < 7) return { days: Infinity, burn: 0, lines: [] as [string, number][] };
  const burn = recent.reduce((a, l) => a + l.cash.out - l.cash.in - (l.cash.repaid ?? 0) + (l.cash.borrowed ?? 0) + (l.finance?.claim ?? 0), 0) / recent.length;
  const lines = new Map<string, number>();
  const add = (k: string, v: number) => v > 0 && lines.set(k, (lines.get(k) ?? 0) + v);
  for (const l of recent) {
    for (const [r, v] of Object.entries(l.spend.market)) add(r, v);
    for (const [r, v] of Object.entries(l.spend.backstop)) add(r, v);
    for (const [id, v] of Object.entries(l.spend.running ?? {})) add(catalog?.systems.find((x) => x.id === id)?.name ?? id, v);
    if (l.finance) {
      add('Credit interest', l.finance.interest - l.finance.capitalized);
      add('Property tax', l.finance.taxPaid);
      add('Failure insurance', l.finance.premium);
    }
    add('Travel fares', l.spend.access ?? 0);
    add('Delivery fees', l.spend.delivery);
    add('Connection fees', l.spend.fees);
  }
  return {
    days: burn > 1e-9 ? Math.max(0, state.cash) / burn : Infinity,
    burn,
    lines: [...lines].sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, (v / recent.length) * 7] as [string, number]),
  };
}

/** Today's survival first; then supplies, cash and the forecast by deadline; comfort last. Annual design advice is elsewhere. */
export function survivalAlerts(
  state: GameState,
  catalog: Catalog,
  forecast?: Pick<ReturnType<typeof transitionForecast>, 'firstHarm' | 'departureDay' | 'cashZeroDay' | 'days'>,
): SurvivalAlert[] {
  const out: SurvivalAlert[] = riskView(state, catalog).map((r) => ({
    id: `risk:${r.id}`, title: r.title, detail: r.detail, resource: r.resource,
    work: true, days: r.days.value, weight: 2, current: r.active,
  }));
  const access = accessView(state);
  if (access?.blockedToday.length) out.push({ id: 'transport-access', title: 'Travel access is blocked', detail: access.blockedToday.map((t) => `${t.purpose}: ${t.reason}`).join(' ') + ' Fund paid travel, provide operating mileage, or wait for roads to reopen. No flat household travel requirement applies.', resource: 'Transportation', work: true, days: 0, weight: 2 });
  const recovery = townRecoveryView(state, catalog);
  if (recovery.people.length)
    out.push({
      id: 'town-recovery',
      title: 'Household recovery comes first',
      resource: recovery.resource,
      work: true,
      detail: `${recovery.people.join(', ')} are in town after wellbeing reached zero. Causes at departure: ${recovery.causes.join(', ') || 'see each person’s wellbeing history'}. Residents in town supply no labor. ${recovery.checks.join(' ')} Minimum stay remaining: ${recovery.days} days. Work shows a priced recovery route home.`,
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
        days: grace,
        weight: SURVIVAL[need].weight,
        current: true,
        detail: `${affected.map((p) => `${p.label} (${p.id})`).join(', ')}: ${Math.round((n.delivered / n.needed) * 100)}% met yesterday. ${grace ? `${grace} day${grace === 1 ? '' : 's'} until wellbeing penalties if the shortage persists` : 'Wellbeing penalties apply now'}; ${eta.length ? `about ${Math.min(...eta)} days to town at yesterday’s net wellbeing loss` : 'departure timing depends on wellbeing'}. Restore supply and required inputs; building projects do not supply anything yet.`,
      });
    }
  const comfort: SurvivalAlert[] = [];
  if (
    last &&
    last.weather.cdd > COOL_CDD_MIN &&
    last.needs['Cooled shelter'].needed > 1e-9 &&
    last.needs['Cooled shelter'].delivered / last.needs['Cooled shelter'].needed < 0.5 &&
    peopleView(state).some((p) => !p.away)
  ) {
    comfort.push({
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
  const cash = cashRunway(state, catalog);
  // A standing order the household can keep paying for already answers a low reserve.
  const ordered = (resource: string) =>
    (state.market?.standing ?? []).some((o) => o.resource === resource && o.keepAbove > 0) && cash.days > CONSUMABLE_WARN_DAYS;
  const consumables: (SurvivalAlert & { days: number; survival?: boolean })[] = [];
  const home = peopleView(state).filter((p) => !p.away).length > 0;
  if (last && home) {
    // Prepared Food plus edible harvest in stock, against yesterday's need net of home-grown supply.
    const n = last.needs.Food;
    const grown = Math.max(0, n.provided - n.bought);
    const net = n.needed - grown;
    // Seed potatoes and grain kept for planting are not meals (the engine reserves them too).
    const seed = plantingReserve(state.instances, plans);
    let kcal = 0;
    for (const r of plans.foodFamily)
      kcal += Math.max(0, (state.stocks[r] ?? 0) - (seed[r] ?? 0)) * (catalog.resources.find((x) => x.name === r)!.factorToNeed ?? 1);
    const days = net > 1e-9 ? kcal / net : Infinity;
    if (days <= CONSUMABLE_WARN_DAYS && !ordered('Food'))
      consumables.push({
        id: 'food-runway',
        title: `Food runs out in about ${Math.floor(days)} day${Math.floor(days) === 1 ? '' : 's'}`,
        resource: 'Food',
        work: true,
        days,
        detail: `${Math.round(kcal).toLocaleString('en-US')} kcal of prepared and stored food against ${Math.round(net).toLocaleString('en-US')} kcal/day not covered by yesterday's home-grown supply. Meals are still met; after that, hunger costs wellbeing within days. Buy groceries or set a standing order in Market, or add food production.`,
      });
    const w = last.needs['Drinking water'];
    const wNet = w.needed - (last.resources['Drinking water']?.produced ?? 0);
    const safe = state.stocks['Drinking water'] ?? 0;
    const wDays = wNet > 1e-9 ? safe / wNet : Infinity;
    if (wDays <= CONSUMABLE_WARN_DAYS && !ordered('Drinking water'))
      consumables.push({
        id: 'water-runway',
        title: `Safe drinking water runs out in about ${Math.floor(wDays)} day${Math.floor(wDays) === 1 ? '' : 's'}`,
        resource: 'Drinking water',
        work: true,
        days: wDays,
        detail: `${safe.toFixed(1)} gal of safe water against ${wNet.toFixed(1)} gal/day more than filtering and boiling made yesterday. Untreated water does not count. Supply the filter with water, boil on the cooking fire, or set a standing order in Market.`,
      });
  }
  if (cash.days <= CASH_WARN_DAYS)
    consumables.push({
      id: 'cash-runway',
      title: `Cash reaches $0 in about ${Math.floor(cash.days)} day${Math.floor(cash.days) === 1 ? '' : 's'}`,
      resource: null,
      days: cash.days,
      detail: `$${Math.max(0, state.cash).toFixed(0)} at $${(cash.burn * 7).toFixed(0)}/week net spending over the last ${Math.min(28, state.ledgers.length)} days. Largest: ${cash.lines.slice(0, 3).map(([k, v]) => `${k} $${v.toFixed(0)}/wk`).join(', ') || 'none'}. Market orders, backstops and running costs stop when cash runs out. Cut spending, add income, or grow what you buy.`,
    });
  for (const r of catalog.resources) {
    if (!isConsumable(r) || ordered(r.name)) continue;
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
      survival: feedsSurvival(r.name, plans, state),
      detail: `${onHand.toFixed(1)} days on hand${startsIn > 0 ? ` once demand starts in ${startsIn} day${startsIn === 1 ? '' : 's'}` : ''} at full demand from completed systems${made > 1e-9 ? ', net of yesterday’s on-site production' : ''}; future gathering, substitutions and orders are not counted. Without it, the systems that use it ${consumerConsequence(r.name, plans, state)}. Open sources to buy or set a standing order; gathering needs a work cap or rule and resident labor.`,
    });
  }
  // Supplies that keep people alive (meals, safe water, cash for orders, sawdust, fuel) rank first by
  // deadline; the forecast next; inputs whose loss only slows production (feed, seed) after it.
  consumables.sort((a, b) => a.days - b.days);
  const vital = consumables.filter((a) => a.survival !== false).map(({ survival: _, ...a }) => a);
  const other = consumables.filter((a) => a.survival === false).map(({ survival: _, ...a }) => a);
  const ahead: SurvivalAlert[] = [];
  if (forecast && home) {
    const inDays = (n: number) => `in about ${n} day${n === 1 ? '' : 's'}`;
    // Shortages already listed for today aren't news from the forecast.
    const now = new Set(out.map((a) => a.resource));
    const events = [
      forecast.departureDay !== null && { days: forecast.departureDay, text: `residents leave for town ${inDays(forecast.departureDay)}` },
      forecast.firstHarm && !now.has(forecast.firstHarm.need) && { days: forecast.firstHarm.days, text: `${forecast.firstHarm.need} falls short ${inDays(forecast.firstHarm.days)}` },
      forecast.cashZeroDay !== null && { days: forecast.cashZeroDay, text: `cash reaches $0 ${inDays(forecast.cashZeroDay)}` },
    ].filter((e): e is { days: number; text: string } => !!e);
    if (events.length) {
      const head = forecast.departureDay !== null ? events[0]! : [...events].sort((a, b) => a.days - b.days)[0]!;
      ahead.push({
        id: 'forecast',
        title: `Forecast: ${head.text}`,
        resource: forecast.firstHarm ? (forecast.firstHarm.need === 'Heat' ? 'Heat' : forecast.firstHarm.need) : null,
        work: true,
        days: Math.min(...events.map((e) => e.days)),
        detail: `If nothing changes over the next ${forecast.days} days: ${events.sort((a, b) => a.days - b.days).map((e) => e.text).join('; ')}. The projection keeps current stocks, orders, work and weather; it is not a promise. Plan → Next 90 days shows the details.`,
      });
    }
  }
  // LL-14: every alert is shown; sections first, then the soonest deadline, then what is at stake.
  const order = new Map(ALERT_GROUPS.map((g, k) => [g.id, k]));
  // A shortage already happening replaces the runway warning about the same supply.
  const current = new Set(out.map((a) => a.id));
  const redundant = (id: string) => (id === 'food-runway' && current.has('food')) || (id === 'water-runway' && current.has('drinkingWater'));
  const ranked: SurvivalAlert[] = [
    ...out.map((a) => ({ ...a, group: 'now' as const, days: a.days ?? 0, weight: a.weight ?? 100 })),
    ...vital.filter((a) => !redundant(a.id)).map((a) => ({ ...a, group: (a.days ?? 0) <= CONSUMABLE_WARN_DAYS ? ('now' as const) : ('soon' as const), weight: a.weight ?? VITAL_WEIGHT[a.id] ?? 2 })),
    ...ahead.map((a) => ({ ...a, group: 'soon' as const, weight: 1 })),
    ...other.map((a) => ({ ...a, group: 'supplies' as const, weight: 1 })),
    ...comfort.map((a) => ({ ...a, group: 'comfort' as const, days: 0, weight: 1 })),
  ];
  return ranked
    .map((a, k) => ({ a, k }))
    .sort(
      (x, y) =>
        order.get(x.a.group!)! - order.get(y.a.group!)! ||
        (x.a.id === 'town-recovery' ? -1 : y.a.id === 'town-recovery' ? 1 : 0) ||
        x.a.days! - y.a.days! ||
        y.a.weight! - x.a.weight! ||
        x.k - y.k,
    )
    .map(({ a }) => a);
}

/** What a runway protects, in wellbeing weight (SURVIVAL weights; cash keeps every order running). */
const VITAL_WEIGHT: Record<string, number> = {
  'water-runway': SURVIVAL.drinkingWater.weight,
  'food-runway': SURVIVAL.food.weight,
  'cash-runway': SURVIVAL.food.weight,
};

/** Warn this many days ahead of running out of a consumable input. */
export const CONSUMABLE_WARN_DAYS = 7;

/** Buyable stock that systems burn or use up: fuel, seed, feed, bedding, amendments. Survival needs have their own alerts. */
function isConsumable(r: Catalog['resources'][number]): boolean {
  return r.storable && r.class === 'Flow' && !r.needsRow && r.marketAvailable;
}

/** Survival services an input keeps running: sanitation, heat, cooking fuel and safe water. */
const VITAL_OUTPUTS = new Set(['Sanitation', 'Heat', 'Cooking fuel', 'Drinking water']);

function feedsSurvival(resource: string, plans: ReturnType<typeof getPlans>, state: GameState): boolean {
  return state.instances.some((i) => {
    const p = plans.bySystem.get(i.systemId)!;
    return i.status === 'active' && p.inputs.some((f) => f.resource === resource && f.role !== 'boost') && p.outputs.some((o) => VITAL_OUTPUTS.has(o.resource));
  });
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
  let route = routeFrom(state, catalog);
  // Existing projects and orders cannot bring people home: propose the cheapest new system for each
  // failing need, proven by the same simulation, one need at a time.
  const proposals: RecoveryStep[] = [];
  let base = state;
  let unbuildable: string | null = null;
  for (let k = 0; k < ROUTE_MAX_PROPOSALS && route.returnDay === null; k++) {
    const need = route.failing.find((c) => c.resource && c.resource !== 'Food')?.resource;
    if (!need) break;
    const next = proposeFor(base, catalog, need);
    if (!next) {
      unbuildable = need;
      break;
    }
    proposals.push(next.step);
    base = next.state;
    route = next.route;
  }
  return {
    ...route,
    steps: [...proposals, ...route.steps],
    actions: [...proposals.map((p) => p.action), ...route.actions],
    upfront: proposals.reduce((a, p) => a + p.cost, 0) + route.upfront,
    cash: state.cash,
    unbuildable: unbuildable
      ? `No affordable catalog system fixes ${unbuildable} in the simulation from here; cash after the steps above is $${Math.max(0, base.cash - route.upfront).toFixed(2)}.`
      : null,
  };
}

/** At most this many new systems in one route, and candidates simulated per need. */
export const ROUTE_MAX_PROPOSALS = 3;
const PROPOSAL_CANDIDATES = 4;

/** The cheapest system (purchase + crew) that clears a failing need when placed by the home shelter. */
function proposeFor(state: GameState, catalog: Catalog, resource: string) {
  const makers = new Set(catalog.flows.filter((f) => f.direction === 'out' && f.resource === resource).map((f) => f.systemId));
  const shelters = new Set(catalog.flows.filter((f) => f.direction === 'out' && f.resource === 'Shelter').map((f) => f.systemId));
  const options: { id: string; name: string; mode: BuildMode; cost: number; total: number }[] = [];
  for (const sys of catalog.systems) {
    if (!makers.has(sys.id) || sys.backstop || sys.categories.includes('Conventional') || sys.categories.includes('Household')) continue;
    const modes: BuildMode[] = sys.costDiy !== null && sys.costDiy !== undefined ? ['diy', 'buy'] : ['buy'];
    const best = modes
      .map((mode) => {
        const cost = costFor(catalog, sys.id, mode);
        return { id: sys.id, name: sys.name, mode, cost, total: cost + setupHoursFor(catalog, sys.id, mode) * contractorRate(state) };
      })
      .sort((a, b) => a.total - b.total)[0]!;
    if (best.total <= state.cash + 1e-9) options.push(best);
  }
  options.sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
  const home = homeOf(state, shelters);
  for (const o of options.slice(0, PROPOSAL_CANDIDATES)) {
    const spot = findSpot(catalog, state, o.id, home.x + 14, home.y);
    if (!spot) continue;
    const action: ActionBody = { kind: 'place', systemId: o.id, x: spot.x, y: spot.y, mode: o.mode, id: `i${state.nextInstanceId}` };
    const next = applyAction(catalog, state, { ...action, at: state.calendar.absDay } as Action);
    const route = routeFrom(next, catalog);
    if (route.returnDay === null && route.failing.some((c) => c.resource === resource)) continue;
    return {
      state: next,
      route,
      step: {
        label: `Build ${o.name} (${o.mode === 'diy' ? 'DIY' : 'bought'})`,
        detail: `Cheapest catalog system that fixes ${resource} in this simulation: $${o.cost.toFixed(2)} now, with its crew below. Placed next to the home shelter; if you place it elsewhere yourself, check the route again.`,
        cost: o.cost,
        action,
      } satisfies RecoveryStep,
    };
  }
  return null;
}

function routeFrom(state: GameState, catalog: Catalog) {
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
    failing: returnDay === null ? returnCheckItems(s, catalog) : [],
  };
}
export type RecoveryRoute = NonNullable<ReturnType<typeof recoveryRoute>>;
