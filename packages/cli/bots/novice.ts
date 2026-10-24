import { getPlans, recoveryRoute, survivalAlerts, transitionForecast, currentQuest, applyAction, type Action, type ActionBody, type GameState } from '@homestead/engine';
import type { Catalog } from '@homestead/catalog';
import { doStep } from './steps.ts';
import type { Bot } from './types.ts';

/** Days of use a novice asks a standing order to keep, as the alerts suggest. */
const ORDER_DAYS = 7;

/**
 * The October 22 playtest's novice (LL-48): does what each quest's visible text asks — its own
 * steps, minus standing orders whose resource the text never names — and reacts only to what the Needs
 * and bottlenecks list puts under Act now: a standing order for a supply about to run out, and the
 * recovery route when residents are in town. The forecast refreshes weekly, as in the hint card.
 */
export function noviceBot(o: { react?: boolean } = {}): Bot {
  const react = o.react ?? true;
  const seen: { day: number; id: string }[] = [];
  const quests = new Set<string>();
  const ordered = new Set<string>();
  let forecast: ReturnType<typeof transitionForecast> | undefined;
  let start: number | null = null;
  let bookedOn = -Infinity;
  return {
    name: react ? 'novice' : 'novice (ignores alerts)',
    seen,
    act(catalog, state, log) {
      const apply = (body: ActionBody): boolean => {
        try {
          const a = { ...body, at: state.calendar.absDay } as Action;
          state = applyAction(catalog, state, a);
          log.push(a);
          return true;
        } catch {
          return false;
        }
      };
      start ??= state.calendar.absDay;
      const q = currentQuest(state);
      if (q && !quests.has(q.id)) {
        quests.add(q.id);
        // A standing order counts as asked for only when the quest's text names its resource.
        for (const step of q.steps)
          if (step.do !== 'standing' || q.reason.toLowerCase().includes(step.resource.toLowerCase())) state = doStep(catalog, state, step, log, []);
        if (q.goal.kind === 'ui') state = doStep(catalog, state, { do: 'open', panel: q.goal.panel }, log, []);
      }
      if ((state.calendar.absDay - start) % 7 === 0) forecast = transitionForecast(state, catalog);
      const alerts = survivalAlerts(state, catalog, forecast);
      const day = state.calendar.absDay - start;
      for (const a of alerts) if (a.group === 'now' || a.id === 'forecast') seen.push({ day, id: a.id });
      if (!react) return state;
      for (const alert of alerts.filter((a) => a.group === 'now')) {
        if (alert.id === 'town-recovery') {
          // Book a route the game says works, once per stay.
          if (state.calendar.absDay - bookedOn < 14) continue;
          const route = recoveryRoute(state, catalog);
          if (route && route.returnDay !== null && route.upfront <= state.cash) {
            for (const body of route.actions) if (!apply(body)) break;
            bookedOn = state.calendar.absDay;
          }
          continue;
        }
        const resource = alert.id === 'food-runway' || alert.id === 'food' ? 'Food' : alert.id === 'water-runway' || alert.id === 'drinkingWater' ? 'Drinking water' : alert.resource;
        if (!resource || ordered.has(resource) || !sold(catalog, resource)) continue;
        const daily = dailyUse(state, catalog, resource);
        if (daily <= 1e-9) continue;
        const keepAbove = Math.ceil(daily * ORDER_DAYS);
        if (apply({ kind: 'standing', resource, keepAbove, orderUpTo: keepAbove * 3 })) ordered.add(resource);
      }
      return state;
    },
  };
}

const sold = (catalog: Catalog, resource: string) => {
  const r = catalog.resources.find((x) => x.name === resource);
  return !!r && r.marketPrice !== null && r.marketAvailable;
};

/** What the household and its systems asked for over the last week, per day. */
function dailyUse(state: GameState, catalog: Catalog, resource: string): number {
  const week = state.ledgers.slice(-7);
  if (resource === 'Food' || resource === 'Drinking water') return week.reduce((a, l) => a + l.needs[resource].needed, 0) / Math.max(1, week.length);
  const requested = week.reduce((a, l) => a + (l.resources[resource]?.requested ?? 0), 0) / Math.max(1, week.length);
  if (requested > 1e-9) return requested;
  // Not requested yet (seasonal): the plan's nominal weekly use.
  const plans = getPlans(catalog, state.site);
  let weekly = 0;
  for (const i of state.instances) if (i.status === 'active') for (const f of plans.bySystem.get(i.systemId)!.inputs) if (f.resource === resource && f.role !== 'boost') weekly += f.weekly * (i.scale ?? 1);
  return weekly / 7;
}
