import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { riskActive } from './risks.ts';
import type { AccessDay, AccessTrip, DaySpend, GameEvent, GameState, NeedDay, ResourceDay } from './types.ts';

export interface AccessContext {
  prev: GameState;
  access?: AccessDay;
  cash: number;
  stocks: Record<string, number>;
  res: Record<string, ResourceDay>;
  needs: Record<string, NeedDay>;
  spend: DaySpend;
  events: GameEvent[];
}

/** Arrears are only for emergency town journeys, and remain an explicit liability until paid. */
export function beginAccess(d: AccessContext): void {
  if (!d.prev.settings.transportAccess) return;
  const due = d.prev.access?.fareDue ?? 0;
  const repaid = Math.min(Math.max(0, d.cash), due);
  d.access = { trips: [], repaid, fareDue: due - repaid };
  d.cash -= repaid;
  if (repaid > 0) d.spend.access = (d.spend.access ?? 0) + repaid;
}

interface TripRequest {
  key: string;
  purpose: AccessTrip['purpose'];
  systemId?: string;
  miles: number;
  fare: number;
  emergency?: boolean;
  /** Keep enough cash to buy something after paying delivery. */
  reserveCash?: number;
}

/** One atomic trip: full measured own mileage, otherwise a paid alternative. Shared keys batch errands. */
export function requestAccess(d: AccessContext, catalog: Catalog, trip: TripRequest): boolean {
  if (!d.access) throw new Error('Transportation access is disabled');
  if (!catalog.transportAccess) throw new Error('Transportation access rules are missing');
  const prior = d.access.trips.find((t) => t.key === trip.key);
  if (prior) return prior.completed;
  if (!Number.isFinite(trip.miles) || trip.miles <= 0 || !Number.isFinite(trip.fare) || trip.fare < 0)
    throw new Error('A trip requires positive finite miles and a nonnegative finite fare');
  const roadsClosed = riskActive(d.prev, 'blizzard') && trip.purpose !== 'town-out';
  const own = (d.stocks.Transportation ?? 0) >= trip.miles;
  const affordable = d.cash >= trip.fare + (trip.reserveCash ?? 0);
  const deferred = !roadsClosed && !own && !affordable && trip.emergency ? trip.fare : 0;
  const completed = !roadsClosed && (own || affordable || deferred > 0);
  const fare = completed && !own && deferred === 0 ? trip.fare : 0;
  const ownMiles = completed && own ? trip.miles : 0;
  const reason = roadsClosed
    ? 'Roads are closed by a blizzard.'
    : !completed
      ? 'No measured mileage or cash for paid travel.'
      : undefined;
  const record: AccessTrip = {
    key: trip.key,
    purpose: trip.purpose,
    ...(trip.systemId ? { systemId: trip.systemId } : {}),
    miles: trip.miles,
    ownMiles,
    fare,
    deferred,
    completed,
    ...(reason ? { reason } : {}),
  };
  d.access.trips.push(record);
  if (ownMiles > 0) {
    d.stocks.Transportation! -= ownMiles;
    d.res.Transportation!.consumed += ownMiles;
  }
  if (fare > 0) {
    d.cash -= fare;
    if (trip.purpose === 'market') d.spend.delivery += fare;
    else d.spend.access = (d.spend.access ?? 0) + fare;
  }
  d.access.fareDue += deferred;
  d.res.Transportation!.requested += trip.miles;
  if (!completed) d.res.Transportation!.unmet += trip.miles;
  const n = d.needs.Transportation!;
  n.needed += trip.miles;
  n.potential += trip.miles;
  if (completed) {
    n.provided += trip.miles;
    n.delivered += trip.miles;
    if (ownMiles === 0) n.bought += trip.miles;
  }
  if (!completed || deferred > 0 || trip.purpose.startsWith('town')) {
    const name = trip.systemId ? catalog.systems.find((s) => s.id === trip.systemId)!.name : trip.purpose;
    d.events.push({
      kind: 'access',
      absDay: d.prev.calendar.absDay,
      blocked: !completed,
      message: !completed
        ? `${name} access blocked: ${reason} Add operating transport, fund the fare, or wait for roads to reopen.`
        : deferred > 0
          ? `${name}: emergency ride completed; $${deferred.toFixed(2)} fare remains payable. Future cash settles it before other trips.`
          : `${name}: journey completed using ${ownMiles > 0 ? `${ownMiles.toFixed(1)} measured miles` : `$${fare.toFixed(2)} paid travel`}.`,
    });
  }
  return completed;
}

export function accessView(state: GameState) {
  if (!state.settings.transportAccess) return null;
  const days = state.ledgers.slice(-7);
  const trips = days.flatMap((l) => l.access?.trips ?? []);
  return {
    fareDue: explained(
      state.access?.fareDue ?? 0,
      'unpaid emergency town fares; assessed only when no mileage or cash could cover a necessary ride',
    ),
    miles: explained(
      trips.reduce((a, t) => a + t.miles, 0),
      'sum of attempted trip miles over the last 7 measured days; no flat household travel need',
    ),
    completed: explained(
      trips.filter((t) => t.completed).length,
      'completed trips over the last 7 measured days',
    ),
    blocked: explained(
      trips.filter((t) => !t.completed).length,
      'blocked trips over the last 7 measured days',
    ),
    paid: explained(
      trips.reduce((a, t) => a + t.fare, 0) + days.reduce((a, l) => a + (l.access?.repaid ?? 0), 0),
      'paid trip fares plus settlement of old emergency fares over the last 7 measured days',
    ),
    ownMiles: explained(
      trips.reduce((a, t) => a + t.ownMiles, 0),
      'actual measured mileage consumed by completed trips, excluding paid travel',
    ),
    blockedToday: state.ledgers.at(-1)?.access?.trips.filter((t) => !t.completed) ?? [],
    detail:
      'Transportation is access, outside the household coverage score. Market orders, physical supply deliveries and sale collection share one daily trip. Commuting follows hours allocated to an on-site job; remote work needs no trip. Vehicles offer yesterday’s actual output for one day, not a multi-day mileage bank. Annual design forecasts omit trip fares; measured history includes them. Emergency town rides can leave a labeled fare payable so zero-cash residents can leave safely; blizzards delay return journeys.',
  };
}
