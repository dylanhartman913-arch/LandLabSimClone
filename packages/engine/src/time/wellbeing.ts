import type { PersonState } from './types.ts';

/**
 * Wellbeing v2 (G15). Each person has wellbeing 0–100 (start 75). Survival needs have a grace
 * period before they cost anything; comfort needs only drift. Labor output follows wellbeing,
 * and a person at 0 goes to stay in town until home can take them back. No deaths.
 * Every constant here is data the G16 tuning loop may change (record it in docs/BALANCE_LOG.md).
 */

export const WB_START = 75;
export const WB_MAX = 100;
/** Recovery a day when every survival need is met, plus up to WB_COMFORT_RECOVERY more with full comfort. */
export const WB_RECOVERY = 0.6;
export const WB_COMFORT_RECOVERY = 0.4;
/** No single day costs more than this. */
export const WB_MAX_LOSS = 8;
/** Wellbeing points (Service) per person a week → extra recovery a day: × 0.05, at most 0.5. */
export const WB_SERVICE_PER_POINT = 0.05;
export const WB_SERVICE_MAX = 0.5;
/** Days away before someone who went to town may come back, and the wellbeing they come back with. */
export const WB_AWAY_MIN_DAYS = 14;
export const WB_RETURN_AT = 50;

export type SurvivalNeed = 'drinkingWater' | 'food' | 'shelter' | 'heat' | 'sanitation';
export type ComfortNeed = 'electricity' | 'cooling' | 'transportation' | 'hotWater' | 'cookingFuel';

export interface SurvivalRule {
  label: string;
  /** Below this share met, the day counts toward the grace period. */
  short: number;
  /** Days short before any penalty (the penalty starts the day after). */
  graceDays: number;
  /** Points a day at zero met, past the grace period (× (1 − share met) × difficulty). */
  weight: number;
  /** Between `short` and fully met: points a day × (1 − share met), with no grace (crowding, a cool tent). */
  drift: number;
}

export const SURVIVAL: Record<SurvivalNeed, SurvivalRule> = {
  drinkingWater: { label: 'Drinking water', short: 0.8, graceDays: 1, weight: 10, drift: 0.5 },
  food: { label: 'Food', short: 0.5, graceDays: 4, weight: 4, drift: 0.4 },
  shelter: { label: 'Shelter', short: 0.5, graceDays: 2, weight: 5, drift: 0.2 },
  heat: { label: 'Heat', short: 0.5, graceDays: 1, weight: 5, drift: 0.3 },
  sanitation: { label: 'Sanitation', short: 0.5, graceDays: 7, weight: 2, drift: 0.1 },
};
/** Food below this share has its own, shorter grace (one day). */
export const FOOD_SEVERE = 0.2;
export const FOOD_SEVERE_GRACE = 1;
/** Heat counts only on days colder than this (HDD); cooling only on days hotter than this (CDD). */
export const HEAT_HDD_MIN = 10;
/**
 * Warm clothes and bedding carry a person through the first this-many heating degree-days of
 * a day (a night in the mid-40s °F indoors). Heat is measured against the rest: delivered ÷
 * (needed × (HDD − this) ÷ HDD). So a tiny stove in a canvas tent is enough in spring, not in January.
 */
export const HEAT_BEDDING_HDD = 20;
export const COOL_CDD_MIN = 5;

/** Comfort needs drift only: points a day × (1 − share met). Their weights sum to 1. */
export const COMFORT: Record<ComfortNeed, { label: string; weight: number }> = {
  electricity: { label: 'Electricity', weight: 0.25 },
  cooling: { label: 'Cooling', weight: 0.25 },
  transportation: { label: 'Transportation', weight: 0.15 },
  hotWater: { label: 'Hot water', weight: 0.15 },
  cookingFuel: { label: 'Cooked meals', weight: 0.2 },
};

export const SURVIVAL_NEEDS = Object.keys(SURVIVAL) as SurvivalNeed[];
export const COMFORT_NEEDS = Object.keys(COMFORT) as ComfortNeed[];

/** Labor output share at a given wellbeing: 0.5 at 0, 1 at 100. */
export function laborShare(wellbeing: number): number {
  return 0.5 + (0.5 * wellbeing) / WB_MAX;
}

/** One term of today's change, for the "why" (positive helps, negative hurts). */
export interface WellbeingTerm {
  label: string;
  points: number;
}

/** What one person got today: share met per need (null: the need doesn't count today). */
export interface PersonDay {
  survival: Record<SurvivalNeed, number | null>;
  comfort: Record<ComfortNeed, number | null>;
  /** Wellbeing points (Service) available per person this week. */
  servicePoints: number;
  /** Difficulty multiplier on survival penalties and drift. */
  mult: number;
}

export interface PersonUpdate {
  person: PersonState;
  /** Survival needs whose grace ran out today (first day of a penalty, then weekly). */
  hardships: { need: SurvivalNeed; level: number }[];
  wentToTown: boolean;
}

export function newWellbeing(): Pick<PersonState, 'wellbeing' | 'health' | 'short' | 'severeFood' | 'why'> {
  const short = {} as Record<SurvivalNeed, number>;
  for (const k of SURVIVAL_NEEDS) short[k] = 0;
  return { wellbeing: WB_START, health: laborShare(WB_START), short, severeFood: 0, why: [] };
}

/** A person's day: grace counters, penalties, drift, recovery, and the terms that explain it. */
export function updateWellbeing(old: PersonState, today: PersonDay): PersonUpdate {
  const base = old;
  const short = { ...base.short };
  let severeFood = base.severeFood;
  const terms: WellbeingTerm[] = [];
  const hardships: PersonUpdate['hardships'] = [];
  let allMet = true;
  for (const k of SURVIVAL_NEEDS) {
    const rule = SURVIVAL[k];
    const f = today.survival[k];
    if (f === null) {
      short[k] = 0;
      continue;
    }
    if (f < rule.short) {
      allMet = false;
      short[k]++;
      let past = short[k] > rule.graceDays;
      if (k === 'food') {
        severeFood = f < FOOD_SEVERE ? severeFood + 1 : 0;
        past ||= severeFood > FOOD_SEVERE_GRACE;
      }
      if (past) {
        const pts = rule.weight * (1 - f) * today.mult;
        terms.push({ label: `${rule.label}: ${Math.round(f * 100)}% met for ${short[k]} days`, points: -pts });
        // A hardship event the first day past grace, then weekly while it lasts.
        const since =
          k === 'food' ? Math.max(short[k] - rule.graceDays, severeFood - FOOD_SEVERE_GRACE) : short[k] - rule.graceDays;
        if (since >= 1 && (since - 1) % 7 === 0) hardships.push({ need: k, level: f });
      } else {
        terms.push({ label: `${rule.label}: ${Math.round(f * 100)}% met (day ${short[k]} of ${rule.graceDays} days' grace)`, points: 0 });
      }
    } else {
      short[k] = 0;
      if (k === 'food') severeFood = 0;
      if (f < 1 - 1e-9) {
        const pts = rule.drift * (1 - f) * today.mult;
        terms.push({ label: `${rule.label}: ${Math.round(f * 100)}% met`, points: -pts });
      }
    }
  }
  let comfortMet = 0;
  let comfortWeight = 0;
  for (const k of COMFORT_NEEDS) {
    const f = today.comfort[k];
    if (f === null) continue;
    const w = COMFORT[k].weight;
    comfortWeight += w;
    comfortMet += w * f;
    if (f < 1 - 1e-9) terms.push({ label: `${COMFORT[k].label}: ${Math.round(f * 100)}% met`, points: -w * (1 - f) * today.mult });
  }
  if (allMet) {
    const comfortShare = comfortWeight > 0 ? comfortMet / comfortWeight : 1;
    terms.push({ label: 'Survival needs met: recovering', points: WB_RECOVERY + WB_COMFORT_RECOVERY * comfortShare });
    const svc = Math.min(WB_SERVICE_MAX, today.servicePoints * WB_SERVICE_PER_POINT);
    if (svc > 1e-9) terms.push({ label: 'Time by the fire and small comforts', points: svc });
  }
  let change = terms.reduce((a, t) => a + t.points, 0);
  if (change < -WB_MAX_LOSS) {
    terms.push({ label: `A bad day costs at most ${WB_MAX_LOSS} points`, points: -WB_MAX_LOSS - change });
    change = -WB_MAX_LOSS;
  }
  const before = base.wellbeing;
  const wellbeing = Math.max(0, Math.min(WB_MAX, before + change));
  terms.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  const person: PersonState = {
    ...base,
    wellbeing,
    health: laborShare(wellbeing),
    short,
    severeFood,
    why: terms.filter((t) => Math.abs(t.points) > 1e-9 || t.label.includes('grace')).slice(0, 8),
  };
  return { person, hardships, wentToTown: wellbeing <= 0 && before > 0 };
}
