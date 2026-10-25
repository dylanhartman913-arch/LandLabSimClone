import type { Catalog, LivestockRule } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { canPlace, footprintSideFt, parcelSideFt, placeSystem } from './game.ts';
import { nextRandom } from './rng.ts';
import { spareLabor, workProcessing, type ProcessingDay } from './processing.ts';
import type { AnimalState, DayLedger, GameEvent, GameState, Instance, NeedDay } from './types.ts';
import { instanceGroupKey } from './spatial.ts';

export function livestockRule(catalog: Catalog, inst: Instance): LivestockRule | undefined {
  return catalog.livestockRules?.find((r) => r.systemId === inst.systemId);
}

export function animalState(inst: Instance, rule: LivestockRule): AnimalState {
  const initial = rule.maturesInto ? 0 : rule.matureDays;
  return inst.animal ?? { ageDays: initial, growthDays: initial };
}

/** Approximate astronomical day length, independent of cloud/solar-panel weather. */
export function daylightHours(latitude: number, day: number): number {
  const declination = ((23.44 * Math.PI) / 180) * Math.sin((2 * Math.PI * (day - 80)) / 365);
  const hourAngle = Math.acos(
    Math.max(-1, Math.min(1, -Math.tan((latitude * Math.PI) / 180) * Math.tan(declination))),
  );
  return (24 * hourAngle) / Math.PI;
}

export function animalOutput(state: GameState, catalog: Catalog, inst: Instance, resource: string): number {
  const rule = livestockRule(catalog, inst);
  if (!state.settings.livestockLifecycle || !rule) return 1;
  if (resource === 'Meat') return 0; // meat is realized only by a culling event
  if (resource === 'Manure' || resource === 'Organic waste') return 1;
  const animal = animalState(inst, rule);
  if (animal.growthDays < rule.matureDays) return 0;
  const aging = Math.max(
    0,
    Math.min(1, (rule.maxAgeDays - animal.ageDays) / (rule.maxAgeDays - rule.primeDays)),
  );
  const laying =
    resource === 'Eggs' && rule.seasonalEggs
      ? Math.max(0.2, Math.min(1, (daylightHours(state.site.latitude, state.calendar.day) - 8) / 8))
      : 1;
  return aging * laying;
}

export function manageLivestock(
  catalog: Catalog,
  state: GameState,
  id: string,
  operation: 'breed' | 'cull' | 'cancel',
): GameState {
  if (!state.settings.livestockLifecycle) throw new Error('Livestock lifecycle is disabled');
  const inst = state.instances.find((i) => i.id === id);
  const rule = inst && livestockRule(catalog, inst);
  if (!inst || !rule || inst.status !== 'active') throw new Error('Choose an active animal cohort');
  const animal = { ...animalState(inst, rule) };
  let fee = 0;
  if (operation === 'cancel') {
    delete animal.breeding;
    delete animal.culling;
  } else {
    if (animal.breeding || animal.culling) throw new Error('This cohort already has work queued');
    if (operation === 'breed') {
      if (!rule.breeding || animal.growthDays < rule.matureDays || animal.ageDays >= rule.primeDays)
        throw new Error('This cohort is not eligible to breed');
      fee = rule.breeding.fee * (inst.scale ?? 1);
      if (state.cash < fee) throw new Error('Cash cannot cover the breeding service');
      animal.breeding = { progressDays: 0, laborDone: 0 };
    } else {
      if (!(rule.meatLbs > 0 && rule.cullHours > 0)) throw new Error('This cohort cannot be culled for meat');
      animal.culling = { laborDone: 0 };
    }
  }
  return {
    ...state,
    cash: state.cash - fee,
    pendingCash: { ...state.pendingCash, purchases: state.pendingCash.purchases + fee },
    instances: state.instances.map((i) => (i.id === id ? { ...i, animal } : i)),
  };
}

function operational(state: GameState, catalog: Catalog, inst: Instance): number {
  return state.lastDay[instanceGroupKey(catalog, state, inst)]?.sat ?? 0;
}

export function predatorProtection(
  state: GameState,
  catalog: Catalog,
  inst: Instance,
  satisfaction?: Map<string, number>,
): boolean {
  const rule = livestockRule(catalog, inst);
  const sat = (i: Instance) => satisfaction?.get(i.id) ?? operational(state, catalog, i);
  if (rule?.secureHousing && sat(inst) >= 0.8) return true;
  const defense = catalog.predatorRule;
  if (!defense) return false;
  return state.instances.some(
    (i) =>
      i.status === 'active' &&
      i.systemId === defense.guardianSystemId &&
      sat(i) >= 0.8 &&
      animalOutput(state, catalog, i, 'Pest control') > 0 &&
      Math.hypot(i.x - inst.x, i.y - inst.y) <= defense.guardianRadiusFt,
  );
}

export function livestockView(state: GameState, catalog: Catalog, id: string) {
  const inst = state.instances.find((i) => i.id === id);
  const rule = inst && livestockRule(catalog, inst);
  if (!state.settings.livestockLifecycle || !inst || !rule) return null;
  const a = animalState(inst, rule);
  return {
    age: explained(
      a.ageDays,
      'chronological days since birth; new adult cohorts begin at maturity on opt-in',
    ),
    count: explained(
      rule.animalsPerUnit * (inst.scale ?? 1),
      'animals represented by this catalog cohort × its current scale',
    ),
    maturityRemaining: explained(
      Math.max(0, rule.matureDays - a.growthDays),
      'fed growth days remaining; shortages delay maturity',
    ),
    production: explained(
      animalOutput(state, catalog, inst, rule.seasonalEggs ? 'Eggs' : 'Milk'),
      'maturity × age decline × daylight factor for laying birds',
    ),
    daylight: explained(
      daylightHours(state.site.latitude, state.calendar.day),
      'approximate astronomical daylight hours at the site latitude',
    ),
    cullMeat: explained(
      rule.meatLbs *
        (inst.scale ?? 1) *
        Math.max(0.05, Math.min(1, a.growthDays / Math.max(1, rule.matureDays))),
      rule.note,
    ),
    cullHours: explained(
      rule.cullHours * (inst.scale ?? 1),
      'culling work per cohort × scale; uses spare household labor',
    ),
    breedingFee: explained(
      (rule.breeding?.fee ?? 0) * (inst.scale ?? 1),
      'external breeding/fertile-stock service, paid on booking; no refund on cancellation',
    ),
    breedingDays: explained(
      Math.max(0, (rule.breeding?.gestationDays ?? 0) - (a.breeding?.progressDays ?? 0)),
      'fed days until birth/hatching; required breeding work and free parcel space must also be available',
    ),
    breeding: !!a.breeding,
    culling: !!a.culling,
    canBreed:
      !!rule.breeding &&
      !a.breeding &&
      !a.culling &&
      a.growthDays >= rule.matureDays &&
      a.ageDays < rule.primeDays &&
      state.cash >= rule.breeding.fee * (inst.scale ?? 1),
    canCull: rule.meatLbs > 0 && !a.breeding && !a.culling,
    guardianRadius: explained(
      catalog.predatorRule?.guardianRadiusFt ?? 0,
      'maximum guardian-to-cohort distance in feet; guardian feeding and staffing must also be met',
    ),
    protected: predatorProtection(state, catalog, inst),
    warningDays: a.predatorWarning
      ? explained(
          a.predatorWarning.daysLeft,
          'days until the warned predator returns; working guardian or secure housing prevents a loss',
        )
      : null,
  };
}

interface LifecycleDay extends ProcessingDay {
  livestockRng: number;
  nextInstanceId: number;
  events: GameEvent[];
  needs: { Food: NeedDay };
}

/** Deferred removal preserves the day's allocation indices until ledger/event construction finishes. */
export function advanceLivestock(
  d: LifecycleDay,
  catalog: Catalog,
  satisfaction: Map<string, number>,
): { removed: Set<string>; records: NonNullable<DayLedger['livestock']> } {
  const removed = new Set<string>();
  const records: NonNullable<DayLedger['livestock']> = [];
  if (!d.prev.settings.livestockLifecycle) return { removed, records };
  const emit = (
    inst: Instance,
    kind: NonNullable<DayLedger['livestock']>[number]['kind'],
    amount: number,
  ) => {
    records.push({ instanceId: inst.id, kind, amount });
    d.events.push({
      kind: 'livestock',
      absDay: d.prev.calendar.absDay,
      instanceId: inst.id,
      event: kind,
      amount,
    });
  };
  const original = d.instances.length;
  for (let index = 0; index < original; index++) {
    const before = d.instances[index]!;
    const rule = livestockRule(catalog, before);
    if (!rule || before.status !== 'active' || !satisfaction.has(before.id)) continue;
    const old = animalState(before, rule);
    const sat = satisfaction.get(before.id)!;
    const animal: AnimalState = {
      ...old,
      ageDays: old.ageDays + 1,
      growthDays: old.growthDays + Math.max(0, Math.min(1, sat)),
    };
    let inst = { ...before, animal };
    d.instances[index] = inst;
    if (animal.ageDays >= rule.maxAgeDays) {
      removed.add(inst.id);
      emit(inst, 'died', rule.animalsPerUnit * (inst.scale ?? 1));
      continue;
    }
    if (animal.growthDays >= rule.matureDays && old.growthDays < rule.matureDays) {
      if (rule.maturesInto) {
        const target = catalog.livestockRules!.find((r) => r.systemId === rule.maturesInto!.systemId)!;
        inst = {
          ...inst,
          systemId: target.systemId,
          scale: (inst.scale ?? 1) * rule.maturesInto.scaleMultiplier,
          animal: { ...animal, ageDays: target.matureDays, growthDays: target.matureDays },
        };
        d.instances[index] = inst;
      }
      emit(inst, 'matured', rule.animalsPerUnit * (before.scale ?? 1));
      if (rule.maturesInto) continue;
    }
    if (animal.culling) {
      const required = rule.cullHours * (inst.scale ?? 1);
      const hours = Math.min(spareLabor(d), Math.max(0, required - animal.culling.laborDone));
      workProcessing(d, inst.systemId, hours);
      animal.culling = { laborDone: animal.culling.laborDone + hours };
      if (animal.culling.laborDone >= required - 1e-9) {
        const meat =
          rule.meatLbs *
          (inst.scale ?? 1) *
          Math.max(0.05, Math.min(1, animal.growthDays / Math.max(1, rule.matureDays)));
        d.produced.Meat = (d.produced.Meat ?? 0) + meat;
        const kcal = meat * catalog.resources.find((r) => r.name === 'Meat')!.factorToNeed!;
        d.needs.Food.provided += kcal;
        d.needs.Food.potential += kcal;
        removed.add(inst.id);
        emit(inst, 'culled', meat);
        continue;
      }
    }
    if (animal.breeding && rule.breeding) {
      const b = rule.breeding;
      const required = b.laborHours * (inst.scale ?? 1);
      const hours = Math.min(spareLabor(d), Math.max(0, required - animal.breeding.laborDone));
      workProcessing(d, inst.systemId, hours);
      animal.breeding = {
        progressDays: animal.breeding.progressDays + (sat >= 0.8 ? 1 : 0),
        laborDone: animal.breeding.laborDone + hours,
      };
      if (animal.breeding.progressDays >= b.gestationDays && animal.breeding.laborDone >= required - 1e-9) {
        const target = catalog.systems.find((s) => s.id === b.offspringSystemId)!;
        const state = {
          ...d.prev,
          instances: d.instances.filter((i) => !removed.has(i.id)),
          nextInstanceId: d.nextInstanceId,
        };
        const width = footprintSideFt(target.footprintSqft);
        const side = parcelSideFt(state.settings);
        let spot: { x: number; y: number } | null = target.layer === 'none' ? { x: inst.x, y: inst.y } : null;
        for (let y = width / 2; y <= side - width / 2 && !spot; y += Math.max(4, width + 2))
          for (let x = width / 2; x <= side - width / 2 && !spot; x += Math.max(4, width + 2))
            if (canPlace(catalog, state, target.id, x, y).ok) spot = { x, y };
        if (spot) {
          const birth = placeSystem(catalog, state, target.id, spot.x, spot.y, 'prebuilt', {
            scale: b.offspringScale * (inst.scale ?? 1),
          });
          const child = birth.state.instances.find((i) => i.id === birth.instanceId)!;
          child.animal = { ageDays: 0, growthDays: 0 };
          d.instances.push(child);
          d.nextInstanceId = birth.state.nextInstanceId;
          delete animal.breeding;
          emit(child, 'born', (livestockRule(catalog, child)?.animalsPerUnit ?? 1) * (child.scale ?? 1));
        }
      }
    }
    const threat = catalog.predatorRule;
    if (!threat || !rule.predatorRisk) continue;
    if (animal.predatorWarning) {
      animal.predatorWarning = { daysLeft: animal.predatorWarning.daysLeft - 1 };
      if (animal.predatorWarning.daysLeft <= 0) {
        const state = {
          ...d.prev,
          instances: d.instances.filter((i) => !removed.has(i.id)),
          lastDay: d.prev.lastDay,
        };
        if (predatorProtection(state, catalog, inst, satisfaction)) emit(inst, 'protected', 0);
        else {
          const lossScale = Math.min(inst.scale ?? 1, 1 / rule.animalsPerUnit);
          const remaining = (inst.scale ?? 1) - lossScale;
          if (remaining <= 1e-9) removed.add(inst.id);
          else d.instances[index] = { ...inst, scale: remaining };
          emit(inst, 'predator-loss', lossScale * rule.animalsPerUnit);
        }
        delete animal.predatorWarning;
      }
    } else if (d.prev.calendar.absDay % threat.intervalDays === 0) {
      let draw: number;
      [draw, d.livestockRng] = nextRandom(d.livestockRng);
      if (draw < rule.predatorRisk) {
        animal.predatorWarning = { daysLeft: threat.warningDays };
        emit(inst, 'predator-warning', threat.warningDays);
      }
    }
  }
  return { removed, records };
}
