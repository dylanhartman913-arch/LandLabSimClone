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
  for (const resource of ['Carbon', 'Chicken feed']) {
    let daily = 0;
    for (const i of state.instances)
      if (i.status === 'active' && !i.person?.away)
        for (const f of plans.bySystem.get(i.systemId)!.inputs)
          if (f.resource === resource && f.role !== 'boost')
            daily += dailyAmount(f, state.calendar.day, state.weather, climate) * (i.scale ?? 1);
    if (daily <= 1e-9) continue;
    const days = (state.stocks[resource] ?? 0) / daily;
    if (days > 7) continue;
    out.push({
      id: resource,
      title: `${resource} reserve is low`,
      resource,
      work: true,
      detail: `${days.toFixed(1)} days on hand at current full demand, excluding future gathering, substitutions and orders. Without inputs, sanitation or food production may stop. Open sources to buy or set a standing order; gathering needs a work cap or rule and resident labor.`,
    });
  }
  return out;
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
