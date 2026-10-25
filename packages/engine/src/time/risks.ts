import type { Catalog, RiskKind } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import type { DayWeather } from './climate.ts';
import { conditionOutput, wearsOut } from './maintenance.ts';
import { shelterAssignments } from './occupancy.ts';
import { getPlans } from './plans.ts';
import { roleNeeds } from './household.ts';
import { nextRandom, seedState } from './rng.ts';
import type { GameEvent, GameState, Instance, RiskThreat } from './types.ts';
import type { YearWeather } from './weather.ts';

export const RISK_KINDS: RiskKind[] = [
  'breakdown',
  'pests',
  'disease',
  'smoke',
  'blizzard',
  'outage',
  'drawdown',
];
export const RISK_NAMES: Record<RiskKind, string> = {
  breakdown: 'Equipment breakdown',
  pests: 'Garden pests',
  disease: 'Garden disease',
  smoke: 'Wildfire smoke',
  blizzard: 'Blizzard',
  outage: 'Grid outage',
  drawdown: 'Well drawdown',
};
const RESOURCE: Record<RiskKind, string | null> = {
  breakdown: 'Labor',
  pests: 'Pest control',
  disease: 'Compost',
  smoke: 'Cooling',
  blizzard: 'Food',
  outage: 'Electricity',
  drawdown: 'Water',
};

export function riskActive(state: GameState, kind: RiskKind): boolean {
  return (
    !!state.settings.riskEvents &&
    !!state.risks?.threats.some(
      (t) => t.kind === kind && state.calendar.absDay >= t.startsAt && state.calendar.absDay < t.endsAt,
    )
  );
}

function working(catalog: Catalog, state: GameState, inst: Instance): boolean {
  return (
    inst.status === 'active' &&
    !inst.shelterClosed &&
    (inst.scale ?? 1) >= 1 &&
    (state.risks?.readiness[inst.id] ?? 0) >= 0.8 &&
    (!state.settings.wearAndRepair ||
      conditionOutput(
        inst,
        catalog.systems.find((s) => s.id === inst.systemId)!,
      ) >= 0.8)
  );
}

function protectedGarden(
  catalog: Catalog,
  state: GameState,
  inst: Instance,
  kind: 'pests' | 'disease',
): boolean {
  const rule = catalog.riskEvents!;
  const ids = kind === 'pests' ? rule.pestDefenseIds : rule.diseaseDefenseIds;
  return state.instances.some(
    (defense) =>
      ids.includes(defense.systemId) &&
      working(catalog, state, defense) &&
      Math.hypot(defense.x - inst.x, defense.y - inst.y) <= rule.mitigationRangeFt,
  );
}

export function riskOutputFactor(
  catalog: Catalog,
  state: GameState,
  inst: Instance,
  resource: string,
  capacity: boolean,
): number {
  const rule = catalog.riskEvents;
  if (!state.settings.riskEvents || !rule) return 1;
  let factor = 1;
  for (const t of state.risks?.threats ?? []) {
    if (state.calendar.absDay < t.startsAt || state.calendar.absDay >= t.endsAt) continue;
    if (t.kind === 'outage' && rule.gridIds.includes(inst.systemId) && resource === 'Electricity') factor = 0;
    if (t.kind === 'blizzard' && rule.deliveryIds.includes(inst.systemId) && !capacity) factor = 0;
    if (t.kind === 'drawdown' && rule.wellIds.includes(inst.systemId) && resource === 'Water')
      factor *= rule.wellFactor;
    if (
      (t.kind === 'pests' || t.kind === 'disease') &&
      t.targetId === inst.id &&
      !capacity &&
      resource !== 'Wellbeing'
    )
      factor *= protectedGarden(catalog, state, inst, t.kind)
        ? rule.protectedHarvestFactor
        : rule.harvestFactor;
  }
  return factor;
}

/** Smoke carries both an extra cooling load and an explicit air-exposure wellbeing term. */
export function riskWeather(catalog: Catalog, state: GameState, weather: DayWeather): DayWeather {
  if (!state.settings.riskEvents || !catalog.riskEvents) return weather;
  const tags = RISK_KINDS.filter((k) => riskActive(state, k)).map((k) => RISK_NAMES[k].toLowerCase());
  return tags.length
    ? {
        ...weather,
        cdd: weather.cdd + (riskActive(state, 'smoke') ? catalog.riskEvents.smokeCdd : 0),
        tags: [...weather.tags, ...tags],
      }
    : weather;
}

/** An enclosed, operating refuge covers only its catalog living space; tents and closed homes do not. */
export function smokeExposure(catalog: Catalog, state: GameState, person: Instance): number {
  if (!riskActive(state, 'smoke') || !catalog.riskEvents) return 0;
  const rule = catalog.riskEvents;
  const plans = getPlans(catalog, state.site);
  const assignments = state.settings.shelterOccupancy ? shelterAssignments(catalog, state) : null;
  const home = assignments?.get(person.id);
  const residents = state.instances.filter(
    (i) =>
      i.person && !i.person.away && i.status === 'active' && (!assignments || assignments.get(i.id) === home),
  );
  const needed = residents.reduce(
    (n, i) =>
      n +
      (plans.bySystem.get(i.systemId)!.inputs.find((f) => f.resource === 'Shelter')?.qty ?? 0) *
        (i.scale ?? 1) *
        roleNeeds(catalog, state.settings, i.person!),
    0,
  );
  const space = state.instances
    .filter(
      (i) =>
        rule.refugeIds.includes(i.systemId) && working(catalog, state, i) && (!assignments || i.id === home),
    )
    .reduce(
      (n, i) =>
        n +
        (plans.bySystem.get(i.systemId)!.outputs.find((f) => f.resource === 'Shelter')?.qty ?? 0) *
          (i.scale ?? 1) *
          (state.risks!.readiness[i.id] ?? 0),
      0,
    );
  const protectedShare = needed > 0 ? Math.min(1, space / needed) : 0;
  return rule.smokePenalty * (1 - protectedShare * (1 - rule.refugeExposure));
}

function mitigation(catalog: Catalog, kind: RiskKind): string {
  const r = catalog.riskEvents!;
  const names = (ids: string[]) => ids.map((id) => catalog.systems.find((s) => s.id === id)!.name).join(', ');
  switch (kind) {
    case 'breakdown':
      return 'Repair or replace the warned asset before failure; parts need cash and construction needs labor. An asset already being serviced is safe from this warning.';
    case 'pests':
      return `Within ${r.mitigationRangeFt} ft: a working ${names(r.pestDefenseIds)} softens harvest losses. Keep its required inputs supplied.`;
    case 'disease':
      return `Within ${r.mitigationRangeFt} ft: working ${names(r.diseaseDefenseIds)} soften harvest losses through soil care. Keep the pile supplied.`;
    case 'smoke':
      return 'Use an operating enclosed house or cabin as a refuge to reduce air exposure; keep cooling powered. Tents and closed shelters provide no smoke refuge.';
    case 'blizzard':
      return 'Stock food, drinking water, animal feed and fuel before roads close. Market orders wait without charging or duplicating; delivery backstops also stop. Storage systems keep reserves available.';
    case 'outage':
      return 'Use charged batteries and a fueled generator or independent renewable power; keep critical loads and their inputs supplied. Only grid electricity stops; fixed connection fees continue.';
    case 'drawdown':
      return 'Fill a cistern before the dry spell; add rainwater collection or another non-well source. Hand pumps draw from the same depleted groundwater.';
  }
}

/** Warnings remain visible until expiry, including active events; mitigation readiness uses yesterday's actual operation. */
export function riskView(state: GameState, catalog: Catalog) {
  if (!state.settings.riskEvents || !catalog.riskEvents) return [];
  const rows = (state.risks?.threats ?? [])
    .filter((t) => t.endsAt > state.calendar.absDay)
    .map((t) => {
      const active = state.calendar.absDay >= t.startsAt;
      const target = state.instances.find((i) => i.id === t.targetId);
      const name = target ? catalog.systems.find((s) => s.id === target.systemId)!.name : null;
      return {
        id: t.id,
        title: `${RISK_NAMES[t.kind]}${name ? `: ${name}` : ''}${active ? ' — active' : ' warning'}`,
        detail: `${active ? `${t.endsAt - state.calendar.absDay} day(s) remaining.` : `Starts in ${t.startsAt - state.calendar.absDay} day(s).`} ${mitigation(catalog, t.kind)} Defenses must be complete, at full scale, and at least 80% operational on the previous measured day.`,
        days: explained(
          Math.max(0, t.startsAt - state.calendar.absDay),
          'warned start day less current absolute day, floored at zero',
        ),
        resource: RESOURCE[t.kind],
        active,
        instanceId: t.targetId,
      };
    });
  if (state.settings.livestockLifecycle)
    for (const inst of state.instances) {
      const days = inst.animal?.predatorWarning?.daysLeft;
      if (days === undefined) continue;
      rows.push({
        id: `predator:${inst.id}`,
        title: 'Predator tracks near livestock',
        detail: `${days} day(s) to secure operating housing or a fed, staffed Livestock Guardian Dog within ${catalog.predatorRule?.guardianRadiusFt ?? 0} ft. The existing livestock simulation resolves this threat.`,
        days: explained(days, 'saved LL-31 predator warning countdown'),
        resource: 'Pest control',
        active: false,
        instanceId: inst.id,
      });
    }
  return rows;
}

/** Fixed draws per interval, independent of eligibility and mitigation. Weather and LL-31 streams stay untouched. */
export function prepareRisks(
  catalog: Catalog,
  prev: GameState,
  weather: DayWeather,
  yearWeather?: YearWeather,
) {
  if (!prev.settings.riskEvents) return null;
  const rule = catalog.riskEvents;
  if (!rule) throw new Error('Risk event rules are missing from the catalog');
  const now = prev.calendar.absDay;
  let rng = prev.riskRng ?? seedState(prev.seed + 38);
  let instances = prev.instances;
  const events: GameEvent[] = [];
  const threats: RiskThreat[] = [];
  const emit = (t: RiskThreat, phase: 'warning' | 'started' | 'ended' | 'averted') => {
    const target = instances.find((i) => i.id === t.targetId);
    const label = `${RISK_NAMES[t.kind]}${target ? `: ${catalog.systems.find((s) => s.id === target.systemId)!.name}` : ''}`;
    events.push({
      kind: 'risk',
      absDay: now,
      ...(t.targetId ? { instanceId: t.targetId } : {}),
      risk: t.kind,
      phase,
      message: `${label}: ${phase === 'warning' ? `warning, starts in ${t.startsAt - now} days` : phase === 'started' ? 'started' : phase === 'ended' ? (t.kind === 'breakdown' ? 'warning resolved; failed equipment still needs repair or replacement' : 'event ended') : 'failure averted by service or removal'}. ${mitigation(catalog, t.kind)}`,
    });
  };
  for (const t of prev.risks?.threats ?? []) {
    if (now >= t.endsAt) {
      emit(t, 'ended');
      continue;
    }
    const inst = instances.find((i) => i.id === t.targetId);
    if (t.kind === 'breakdown' && now >= t.startsAt) {
      if (
        !prev.settings.wearAndRepair ||
        !inst ||
        inst.status !== 'active' ||
        (inst.condition ?? 1) >= rule.breakdownBelow
      ) {
        emit(t, 'averted');
        continue;
      }
      if (now === t.startsAt)
        instances = instances.map((i) => (i.id === inst.id ? { ...i, condition: 0 } : i));
    }
    if (now === t.startsAt) emit(t, 'started');
    threats.push(t);
  }
  if (now % rule.intervalDays === 0) {
    for (const kind of RISK_KINDS) {
      let chance: number, choice: number;
      [chance, rng] = nextRandom(rng);
      [choice, rng] = nextRandom(rng);
      if (threats.some((t) => t.kind === kind) || chance >= rule.events[kind].chance) continue;
      let targets: Instance[] = [];
      const active = instances.filter((i) => i.status === 'active' && (i.scale ?? 1) > 0);
      if (kind === 'breakdown')
        targets = prev.settings.wearAndRepair
          ? active.filter(
              (i) =>
                (i.condition ?? 1) > 0 &&
                (i.condition ?? 1) < rule.breakdownBelow &&
                wearsOut(catalog.systems.find((s) => s.id === i.systemId)!),
            )
          : [];
      if (kind === 'pests' || kind === 'disease')
        targets = weather.growing
          ? active.filter((i) => catalog.soilFertility?.gardens.some((g) => g.systemId === i.systemId))
          : [];
      if ((kind === 'breakdown' || kind === 'pests' || kind === 'disease') && !targets.length) continue;
      if (kind === 'smoke' && (prev.calendar.day < 151 || prev.calendar.day > 242)) continue;
      if (kind === 'blizzard' && weather.hdd < rule.blizzardHdd) continue;
      if (kind === 'outage' && !active.some((i) => rule.gridIds.includes(i.systemId))) continue;
      if (
        kind === 'drawdown' &&
        (!(yearWeather && yearWeather.precipMult < rule.droughtBelow) ||
          !weather.growing ||
          !active.some((i) => rule.wellIds.includes(i.systemId)))
      )
        continue;
      const target = targets[Math.floor(choice * targets.length)];
      const startsAt = now + rule.events[kind].warningDays + 1;
      const t: RiskThreat = {
        id: `${kind}:${now}${target ? `:${target.id}` : ''}`,
        kind,
        warnedAt: now,
        startsAt,
        endsAt: startsAt + rule.events[kind].days,
        ...(target ? { targetId: target.id } : {}),
      };
      threats.push(t);
      emit(t, 'warning');
    }
  }
  return {
    state: { ...prev, instances, riskRng: rng, risks: { threats, readiness: prev.risks?.readiness ?? {} } },
    events,
  };
}
