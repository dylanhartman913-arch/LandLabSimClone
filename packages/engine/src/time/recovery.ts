import type { Catalog } from '@homestead/catalog';
import type { GameState, Instance, PersonState } from './types.ts';
import { getPlans, dailyAmount } from './plans.ts';
import { climateTable } from './climate.ts';
import { stepDay } from './step.ts';
import {
  HEAT_HDD_MIN,
  SURVIVAL,
  WB_AWAY_MIN_DAYS,
  WB_RETURN_AT,
  laborShare,
  type SurvivalNeed,
} from './wellbeing.ts';

/** The resource whose supply fixes each survival need (what a recovery proposal builds or finds). */
export const SURVIVAL_RESOURCE: Record<SurvivalNeed, string> = {
  drinkingWater: 'Drinking water',
  food: 'Food',
  shelter: 'Shelter',
  heat: 'Heat',
  sanitation: 'Sanitation',
};

/** Balance policy, not catalog system prices. Paid in full; one eight-hour crew per project. */
export const CONTRACTOR_RATE = 35;
export const CONTRACTOR_HOURS_PER_DAY = 8;
export const RETURN_TRIAL_DAYS = 3;

export function contractorRate(state: GameState): number {
  return state.settings.siteCrewRates ? (state.site.crewRate ?? CONTRACTOR_RATE) : CONTRACTOR_RATE;
}

export function contractorQuote(state: GameState, instance: Instance) {
  const hours = Math.max(0, instance.setupHoursNeeded - instance.setupHoursDone);
  const rate = contractorRate(state);
  const cost = hours * rate;
  const days = Math.max(instance.status === 'building' ? 1 : 0, Math.ceil(hours / CONTRACTOR_HOURS_PER_DAY));
  const blocked =
    instance.status !== 'building'
      ? 'Already completed.'
      : instance.contractor
        ? 'Crew already booked.'
        : state.cash < cost
          ? `Need $${cost.toFixed(2)}; cash is $${state.cash.toFixed(2)} (missing $${(cost - state.cash).toFixed(2)}).`
          : null;
  return { hours, cost, days, blocked, rate, hoursPerDay: CONTRACTOR_HOURS_PER_DAY };
}

export function hireConstruction(state: GameState, id: string): GameState {
  const inst = state.instances.find((i) => i.id === id);
  if (!inst) throw new Error(`No instance ${id}`);
  const q = contractorQuote(state, inst);
  if (q.blocked) throw new Error(q.blocked);
  return {
    ...state,
    cash: state.cash - q.cost,
    pendingCash: { ...state.pendingCash, purchases: state.pendingCash.purchases + q.cost },
    instances: state.instances.map((i) =>
      i.id === id
        ? {
            ...i,
            contractor: {
              hours: q.hours,
              worked: 0,
              ...(state.settings.siteCrewRates ? { rate: q.rate } : {}),
            },
          }
        : i,
    ),
  };
}

function returningPerson(person: PersonState): PersonState {
  const { away: _away, ...p } = person;
  return {
    ...p,
    short: { drinkingWater: 0, food: 0, shelter: 0, heat: 0, sanitation: 0 },
    severeFood: 0,
    wellbeing: WB_RETURN_AT,
    health: laborShare(WB_RETURN_AT),
    why: [],
  };
}

/** One failed return check: the resource that would fix it (null: stock or cash), and its explanation. */
export interface ReturnCheck {
  resource: string | null;
  text: string;
}

/** The same whole-household return checks drive the simulation and its explanation. */
export function returnChecks(state: GameState, catalog: Catalog): string[] {
  return returnCheckItems(state, catalog).map((c) => c.text);
}

export function returnCheckItems(state: GameState, catalog: Catalog): ReturnCheck[] {
  const plans = getPlans(catalog, state.site);
  const climate = climateTable(state.site);
  const household = state.instances.filter((i) => i.person);
  const need = (resource: string) =>
    household.reduce(
      (a, i) =>
        a +
        plans.bySystem
          .get(i.systemId)!
          .inputs.filter((f) => f.resource === resource)
          .reduce(
            (b, f) => b + dailyAmount(f, state.calendar.day, state.weather, climate) * (i.scale ?? 1),
            0,
          ),
      0,
    );
  const capacity = (resource: string) =>
    state.instances
      .filter(
        (i) =>
          i.status === 'active' && !i.person?.away && !(state.settings.shelterOccupancy && i.shelterClosed),
      )
      .reduce(
        (a, i) =>
          a +
          plans.bySystem
            .get(i.systemId)!
            .outputs.filter((f) => f.resource === resource)
            .reduce((b, f) => b + f.qty * (i.scale ?? 1), 0),
        0,
      );
  const out: ReturnCheck[] = [];
  // v0.5: shelter is judged by the same survival threshold as the return trial; the starter tent
  // covers about half of two adults, so demanding 100% stranded every greenfield household in town.
  const shelterNeed = need('Shelter') * (state.settings.survivalShelterReturn ? SURVIVAL.shelter.short : 1);
  if (capacity('Shelter') + 1e-9 < shelterNeed)
    out.push({
      resource: 'Shelter',
      text: state.settings.survivalShelterReturn
        ? `Complete shelter for at least ${Math.round(SURVIVAL.shelter.short * 100)}% of the whole household's need (${Math.ceil(shelterNeed)} sq ft; completed ${Math.floor(capacity('Shelter'))} sq ft).`
        : 'Complete enough shelter for the whole household.',
    });
  if ((state.stocks.Food ?? 0) + 1e-9 < 7 * need('Food'))
    out.push({
      resource: null,
      text: `Stock ${Math.ceil(7 * need('Food'))} kcal of prepared Food for a week for the whole household.`,
    });
  if ((state.stocks['Drinking water'] ?? 0) + 1e-9 < 3 * need('Drinking water'))
    out.push({
      resource: null,
      text: `Stock ${Math.ceil(3 * need('Drinking water'))} gal of safe drinking water for three days for the whole household.`,
    });
  // Trial the actual returning household, at its return wellbeing and labor. Requiring live
  // heat/sanitation while everyone is away deadlocks labor-dependent stoves and toilets.
  // No eligible away people in the trial => recoverResidents never recurses into this check.
  let trial: GameState = {
    ...state,
    instances: state.instances.map((i) => {
      if (!i.person?.away) return i;
      return { ...i, person: returningPerson(i.person) };
    }),
  };
  const failed = new Set<SurvivalNeed>();
  for (let day = 0; day <= RETURN_TRIAL_DAYS; day++) {
    const result = stepDay({ ...trial, settings: { ...trial.settings, peopleLeave: false } }, catalog);
    trial = result.state;
    // Daily services use yesterday's output: the arrival day is a warm-up within
    // heat/sanitation grace, followed by three fully checked operating days.
    if (day === 0) continue;
    for (const [key, row] of [
      ['drinkingWater', 'Drinking water'],
      ['food', 'Food'],
      ['shelter', 'Shelter'],
      ['heat', 'Heated shelter'],
      ['sanitation', 'Sanitation'],
    ] as const) {
      if (key === 'heat' && result.ledger.weather.hdd <= HEAT_HDD_MIN) continue;
      const n = result.ledger.needs[row];
      const local = key === 'heat' || key === 'shelter' ? result.ledger.residentShares?.[key] : undefined;
      if (
        (local !== undefined ? local : n.needed > 1e-9 ? n.delivered / n.needed : 1) <
        SURVIVAL[key].short - 1e-9
      )
        failed.add(key);
    }
  }
  for (const key of failed)
    out.push({
      resource: SURVIVAL_RESOURCE[key],
      text: `${SURVIVAL[key].label} fails the three-day return trial after one arrival day, with the whole household at ${WB_RETURN_AT} wellbeing, current work commitments and available inputs. Complete, connect and supply systems, or lower competing work priorities, before return.`,
    });
  if (household.some((i) => !i.person!.away && Object.values(i.person!.short).some((n) => n > 0)))
    out.push({ resource: null, text: 'Resolve survival shortages for residents already at home.' });
  return out;
}

export function recoverResidents(
  state: GameState,
  catalog: Catalog,
): { state: GameState; returned: string[] } {
  if (!state.settings.safeRecovery && !state.settings.shelterOccupancy && !state.settings.transportAccess) return { state, returned: [] };
  const eligible = state.instances.filter(
    (i) => i.person?.away && state.calendar.absDay - 1 - i.person.away.since >= WB_AWAY_MIN_DAYS,
  );
  // The trial includes everyone away, so wait until that whole returning group is eligible.
  if (
    !eligible.length ||
    eligible.length !== state.instances.filter((i) => i.person?.away).length ||
    returnChecks(state, catalog).length
  )
    return { state, returned: [] };
  const ids = new Set(eligible.map((i) => i.id));
  return {
    state: {
      ...state,
      instances: state.instances.map((i) => {
        if (!ids.has(i.id)) return i;
        return { ...i, person: returningPerson(i.person!) };
      }),
    },
    returned: [...ids],
  };
}
