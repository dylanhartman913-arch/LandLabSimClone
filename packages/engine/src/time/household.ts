import type { Catalog, HouseholdRule } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import { nextRandom } from './rng.ts';
import type { DayLedger, GameEvent, GameSettings, GameState, Instance, PersonState } from './types.ts';

/**
 * LL-36 (`householdRoles`): children and elders with their own needs and labor, skills that rise
 * with practice, and illness or injury from low wellbeing and dangerous work.
 */
export type Role = 'adult' | 'child' | 'elder';
export type SkillKind = 'building' | 'growing' | 'gathering';
export const SKILLS: SkillKind[] = ['building', 'growing', 'gathering'];
export type HouseholdRecord = NonNullable<DayLedger['household']>;

export const roleOf = (p: PersonState): Role => p.role ?? 'adult';

function on(catalog: Catalog, settings: GameSettings): HouseholdRule | null {
  return settings.householdRoles ? (catalog.householdRoles ?? null) : null;
}

/** Share of a catalog Human Being's needs (inputs) this person has. */
export function roleNeeds(catalog: Catalog, settings: GameSettings, p: PersonState): number {
  const rule = on(catalog, settings);
  return rule ? rule.roles[roleOf(p)].needs : 1;
}

/** Share of a catalog Human Being's labor this person gives today: role × illness or injury. */
export function laborFactor(catalog: Catalog, settings: GameSettings, p: PersonState): number {
  const rule = on(catalog, settings);
  if (!rule) return 1;
  const c = p.condition;
  const cond = !c ? 1 : c.kind === 'ill' ? rule.illness.labor : rule.injury.labor;
  return rule.roles[roleOf(p)].labor * cond;
}

/** Skill bonus from practice hours: max × (1 − 2^(−hours ÷ half-learned hours)). */
export function skillBonus(rule: HouseholdRule, kind: SkillKind, hours: number): number {
  const s = rule.skills[kind];
  return s.maxBonus * (1 - Math.pow(2, -Math.max(0, hours) / s.halfHours));
}

/** Who is working today and with what weight (their labor potential: labor factor × health). */
export function workers(catalog: Catalog, settings: GameSettings, instances: readonly Instance[]) {
  const out: { inst: Instance; weight: number }[] = [];
  for (const inst of instances) {
    const p = inst.person;
    if (!p || p.away || inst.status !== 'active') continue;
    const weight = laborFactor(catalog, settings, p) * p.health * (inst.scale ?? 1);
    if (weight > 0) out.push({ inst, weight });
  }
  return out;
}

/** Household multipliers: 1 + the labor-weighted average of each worker's skill bonus. */
export function householdSkill(catalog: Catalog, settings: GameSettings, instances: readonly Instance[]): Record<SkillKind, number> {
  const rule = on(catalog, settings);
  const out = { building: 1, growing: 1, gathering: 1 };
  if (!rule) return out;
  const w = workers(catalog, settings, instances);
  const total = w.reduce((a, x) => a + x.weight, 0);
  if (total <= 0) return out;
  for (const k of SKILLS)
    out[k] = 1 + w.reduce((a, x) => a + x.weight * skillBonus(rule, k, x.inst.person!.skills?.[k] ?? 0), 0) / total;
  return out;
}

export function setRole(catalog: Catalog, state: GameState, id: string, role: Role): GameState {
  if (!state.settings.householdRoles || !catalog.householdRoles) throw new Error('Household roles are disabled');
  const inst = state.instances.find((i) => i.id === id);
  if (!inst?.person) throw new Error('Choose a person');
  return { ...state, instances: state.instances.map((i) => (i.id === id ? { ...i, person: { ...i.person!, role } } : i)) };
}

/**
 * The day's practice, illness and injury. Practice hours go to each worker by their labor weight.
 * Illness may start for someone below the wellbeing threshold; dangerous hours (resident building,
 * chainsaw work) may injure one worker, chosen by labor weight. Draws use their own seeded stream.
 */
export function advanceHousehold(
  catalog: Catalog,
  prev: GameState,
  instances: Instance[],
  day: { absDay: number; rng: number; building: number; growing: number; gathering: number; toolHours: Record<string, number> },
): { rng: number; record: HouseholdRecord | null; events: GameEvent[] } {
  const rule = on(catalog, prev.settings);
  if (!rule) return { rng: day.rng, record: null, events: [] };
  let rng = day.rng;
  const events: GameEvent[] = [];
  const w = workers(catalog, prev.settings, instances);
  const total = w.reduce((a, x) => a + x.weight, 0);
  const practice: Record<SkillKind, number> = { building: day.building, growing: day.growing, gathering: day.gathering };
  const index = new Map(instances.map((i, k) => [i.id, k]));
  const update = (id: string, f: (p: PersonState) => PersonState) => {
    const k = index.get(id)!;
    instances[k] = { ...instances[k]!, person: f(instances[k]!.person!) };
  };
  // Practice: each worker learns from their share of today's hours.
  if (total > 0)
    for (const x of w)
      update(x.inst.id, (p) => {
        const skills = { building: 0, growing: 0, gathering: 0, ...p.skills };
        for (const k of SKILLS) skills[k] += (practice[k] * x.weight) / total;
        return { ...p, skills };
      });
  // Recovery counts down; a person recovered today works fully tomorrow.
  for (const inst of instances) {
    const c = inst.person?.condition;
    if (!c) continue;
    if (c.daysLeft <= 1) {
      update(inst.id, (p) => {
        const copy = { ...p };
        delete copy.condition;
        return copy;
      });
      events.push({ kind: 'person', absDay: day.absDay, instanceId: inst.id, event: 'recovered', days: 0 });
    } else update(inst.id, (p) => ({ ...p, condition: { ...c, daysLeft: c.daysLeft - 1 } }));
  }
  // Illness: below the threshold, up to the maximum daily chance at wellbeing 0.
  for (const inst of instances) {
    const p = inst.person;
    if (!p || p.away || p.condition || inst.status !== 'active' || p.wellbeing >= rule.illness.wellbeingBelow) continue;
    const chance = rule.illness.maxDailyChance * (rule.illness.wellbeingBelow - p.wellbeing) / rule.illness.wellbeingBelow;
    let draw: number;
    [draw, rng] = nextRandom(rng);
    if (draw < chance) {
      update(inst.id, (q) => ({ ...q, condition: { kind: 'ill', daysLeft: rule.illness.days } }));
      events.push({ kind: 'person', absDay: day.absDay, instanceId: inst.id, event: 'ill', days: rule.illness.days });
    }
  }
  // Injury: dangerous hours today.
  let risk = 1 - Math.pow(1 - rule.injury.constructionPerHour, day.building);
  for (const [sys, hours] of Object.entries(day.toolHours)) risk = 1 - (1 - risk) * Math.pow(1 - (rule.injury.toolPerHour[sys] ?? 0), hours);
  const healthy = w.filter((x) => !instances[index.get(x.inst.id)!]!.person!.condition);
  if (risk > 0 && healthy.length) {
    let draw: number;
    [draw, rng] = nextRandom(rng);
    if (draw < risk) {
      let pick: number;
      [pick, rng] = nextRandom(rng);
      const sum = healthy.reduce((a, x) => a + x.weight, 0);
      let acc = 0;
      const who = healthy.find((x) => (acc += x.weight) >= pick * sum) ?? healthy.at(-1)!;
      update(who.inst.id, (q) => ({ ...q, condition: { kind: 'injured', daysLeft: rule.injury.days } }));
      events.push({ kind: 'person', absDay: day.absDay, instanceId: who.inst.id, event: 'injured', days: rule.injury.days });
    }
  }
  return { rng, record: { practice, injuryRisk: risk }, events };
}

/** Person card model: every number comes from here. */
export function householdView(state: GameState, catalog: Catalog, id: string) {
  const rule = on(catalog, state.settings);
  const inst = state.instances.find((i) => i.id === id);
  const p = inst?.person;
  if (!rule || !inst || !p) return null;
  const role = roleOf(p);
  const team = householdSkill(catalog, state.settings, state.instances);
  return {
    role,
    needs: explained(rule.roles[role].needs, rule.note),
    labor: explained(laborFactor(catalog, state.settings, p), 'role labor share × illness or injury factor'),
    condition: p.condition ?? null,
    illnessChance: explained(
      p.wellbeing < rule.illness.wellbeingBelow ? (rule.illness.maxDailyChance * (rule.illness.wellbeingBelow - p.wellbeing)) / rule.illness.wellbeingBelow : 0,
      `daily chance of illness below ${rule.illness.wellbeingBelow} wellbeing`,
    ),
    skills: SKILLS.map((k) => ({
      kind: k,
      hours: explained(p.skills?.[k] ?? 0, `hours of ${k} practiced (this person's share)`),
      bonus: explained(skillBonus(rule, k, p.skills?.[k] ?? 0), `${rule.skills[k].maxBonus} × (1 − 2^(−hours ÷ ${rule.skills[k].halfHours}))`),
      household: explained(team[k] - 1, 'household bonus: labor-weighted average of everyone working'),
    })),
  };
}
