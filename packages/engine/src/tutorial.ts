import { getQuestLine, type Catalog, type QuestDef, type QuestGoal, type QuestLine, type QuestStep } from '@homestead/catalog';
import { computeSpatial, instanceGroupKey } from './time/spatial.ts';
import { climateTable } from './time/climate.ts';
import { SURVIVAL } from './time/wellbeing.ts';
import type { DayLedger, GameState } from './time/types.ts';

/** Where a game's tutorial stands (G16). Lives in the game state, so rewards replay exactly. */
export interface TutorialState {
  line: string;
  /** Index of the current quest (= quests.length when the line is finished). */
  current: number;
  /** Absolute day the current quest began. */
  since: number;
  /** Quest id → absolute day it was completed. */
  done: Record<string, number>;
  /** Interface goals the player has met ("opened the Market panel"). */
  ui: string[];
  skipped: boolean;
}

export interface GoalStatus {
  done: boolean;
  /** 0–1. */
  progress: number;
  detail: string;
}

export function newTutorial(line: string, absDay: number): TutorialState {
  return { line, current: 0, since: absDay, done: {}, ui: [], skipped: false };
}

const byName = (catalog: Catalog, name: string) => {
  const s = catalog.systems.find((x) => x.name === name);
  if (!s) throw new Error(`Quest names an unknown system "${name}"`);
  return s.id;
};

const active = (state: GameState, id: string) => state.instances.filter((i) => i.systemId === id && i.status === 'active');

/** Share of the shelter's heat need met that day: the checklist's Heated shelter row (bedding included as a modifier). */
export function heatShare(l: DayLedger): number {
  if (l.residentShares) return l.residentShares.heat;
  const n = l.needs['Heated shelter'];
  return n.needed > 1e-9 ? Math.min(1, n.delivered / n.needed) : 1;
}

/** Home-grown food eaten over the last `days` days, as a share of the household's need. */
export function homegrownShare(state: GameState, catalog: Catalog, days: number): number {
  const window = state.ledgers.slice(-days);
  const needed = window.reduce((a, l) => a + l.needs.Food.needed, 0);
  let grown = 0;
  for (const r of catalog.resources) {
    if (r.needsRow !== 'Food' || r.name === 'Food') continue;
    for (const l of window) grown += (l.resources[r.name]?.consumed ?? 0) * (r.factorToNeed ?? 1);
  }
  return needed > 1e-9 ? grown / needed : 0;
}

const fmt = (n: number) => (Math.abs(n) >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));

/** How far along a goal is, measured from the day the quest began. */
export function goalStatus(state: GameState, catalog: Catalog, goal: QuestGoal, since: number, ui: readonly string[] = []): GoalStatus {
  switch (goal.kind) {
    case 'all': {
      const parts = goal.of.map((g) => goalStatus(state, catalog, g, since, ui));
      return {
        done: parts.every((p) => p.done),
        progress: parts.reduce((a, p) => a + p.progress, 0) / Math.max(1, parts.length),
        detail: parts.map((p) => `${p.done ? '✓' : '✗'} ${p.detail}`).join(' · '),
      };
    }
    case 'have': {
      const members = active(state, byName(catalog, goal.system));
      const n = state.settings.livestockLifecycle ? members.reduce((sum, i) => sum + (i.scale ?? 1), 0) : members.length;
      return { done: n >= goal.count, progress: Math.min(1, n / goal.count), detail: `${Math.min(n, goal.count)} of ${goal.count} ${goal.system} built` };
    }
    case 'made': {
      const id = byName(catalog, goal.system);
      let made = 0;
      for (const [key, g] of Object.entries(state.lastDay)) {
        if (!key.startsWith(`${id}|`)) continue;
        made = Math.max(made, (g.outputs[goal.resource] ?? 0) * active(state, id).length);
      }
      if (state.settings.livestockLifecycle && catalog.livestockRules?.some((r) => r.systemId === id)) {
        made = active(state, id).reduce((sum, i) => sum + (state.lastDay[instanceGroupKey(catalog, state, i)]?.outputs[goal.resource] ?? 0) * (i.scale ?? 1), 0);
      }
      return {
        done: made >= goal.atLeast,
        progress: Math.min(1, made / goal.atLeast),
        detail: `${goal.system} made ${fmt(made)} of ${fmt(goal.atLeast)} ${goal.resource} yesterday`,
      };
    }
    case 'gathered': {
      let got = 0;
      for (const l of state.ledgers) {
        if (l.absDay < since) continue;
        for (const x of l.gathered ?? []) if (x.resource === goal.resource) got += x.amount;
      }
      return { done: got >= goal.atLeast, progress: Math.min(1, got / goal.atLeast), detail: `${fmt(got)} of ${fmt(goal.atLeast)} ${goal.resource} gathered` };
    }
    case 'stock': {
      const s = state.stocks[goal.resource] ?? 0;
      return { done: s >= goal.atLeast, progress: Math.min(1, s / goal.atLeast), detail: `${fmt(s)} of ${fmt(goal.atLeast)} ${goal.resource} in stock` };
    }
    case 'setting': {
      const v = state.settings.autoGather?.[goal.rule] ?? 0;
      const what = goal.rule === 'waterDays' ? 'days of water' : goal.rule === 'woodWeeks' ? 'weeks of firewood' : 'weeks of food';
      return { done: v >= goal.atLeast, progress: Math.min(1, v / goal.atLeast), detail: `auto-gather target set to ${v} ${what} (goal ${goal.atLeast}); this does not prove a reserve exists` };
    }
    case 'warm': {
      let n = 0;
      for (const l of state.ledgers) if (l.absDay >= since && l.weather.hdd > goal.hddAbove && heatShare(l) >= goal.atLeast) n++;
      return {
        done: n >= goal.days,
        progress: Math.min(1, n / goal.days),
        detail: `${Math.min(n, goal.days)} of ${goal.days} cold days warm enough`,
      };
    }
    case 'homegrown': {
      const enough = state.ledgers.filter((l) => l.absDay >= since).length >= goal.days;
      const share = homegrownShare(state, catalog, goal.days);
      return {
        done: enough && share >= goal.share,
        progress: Math.min(1, share / goal.share),
        detail: `${Math.round(share * 100)}% of food over the last ${goal.days} days grown here (goal ${Math.round(goal.share * 100)}%)`,
      };
    }
    case 'modified': {
      const id = byName(catalog, goal.system);
      const sp = computeSpatial(catalog, state);
      const has = active(state, id).length > 0;
      const hit = has && state.instances.some((i) => (sp.get(i.id)?.inMult[goal.resource] ?? 1) < 1 - 1e-9 && i.systemId !== id);
      return { done: hit, progress: hit ? 1 : has ? 0.5 : 0, detail: hit ? `${goal.system} is working` : has ? `place ${goal.system} on the house` : `${goal.system} not built yet` };
    }
    case 'lacks': {
      const id = byName(catalog, goal.system);
      const n = state.instances.filter((i) => i.systemId === id).length;
      return { done: n === 0, progress: n === 0 ? 1 : 0, detail: n === 0 ? `no ${goal.system}` : `${goal.system} still in the design` };
    }
    case 'days': {
      const d = state.calendar.absDay - since;
      return { done: d >= goal.atLeast, progress: Math.min(1, d / goal.atLeast), detail: `${Math.min(d, goal.atLeast)} of ${goal.atLeast} days` };
    }
    case 'ui': {
      const ok = ui.includes(goal.panel);
      return { done: ok, progress: ok ? 1 : 0, detail: goal.label };
    }
    case 'standing': {
      const o = state.market?.standing.find((x) => x.resource === goal.resource && x.keepAbove > 0);
      const ok = !!o && o.keepAbove >= (goal.keepAbove ?? 0) && o.orderUpTo >= (goal.orderUpTo ?? 0);
      return { done: ok, progress: ok ? 1 : 0, detail: `Market → ${goal.resource}: ${o ? `keep above ${fmt(o.keepAbove)}, top up to ${fmt(o.orderUpTo)}` : 'no standing order'}${goal.keepAbove ? ` (goal ${fmt(goal.keepAbove)} / ${fmt(goal.orderUpTo ?? goal.keepAbove)})` : ''}` };
    }
    case 'workCap': {
      const cap = Object.entries(state.settings.work?.caps ?? {}).find(([job]) => job === goal.job)?.[1];
      const ok = cap === goal.hours;
      return { done: ok, progress: ok ? 1 : 0, detail: `${goal.job} weekly cap: ${cap ?? 'unset'} h/week (goal ${goal.hours})` };
    }
    case 'staysWarm': {
      let n = 0;
      for (const l of state.ledgers)
        if (l.absDay >= since && l.weather.hdd > goal.hddAbove && l.wellbeing !== null && heatShare(l) >= SURVIVAL.heat.short - 1e-9) n++;
      return {
        done: n >= goal.days,
        progress: Math.min(1, n / goal.days),
        detail: `${Math.min(n, goal.days)} of ${goal.days} cold days with nobody suffering from cold`,
      };
    }
  }
}

export function tutorialLine(state: GameState): QuestLine | null {
  return state.tutorial ? getQuestLine(state.tutorial.line) : null;
}

/** Local winter test for the corrected tutorial, without changing weather or survival rules. */
export function tutorialColdThreshold(state: GameState): number {
  return state.tutorial?.line === 'greenfield-instructions'
    ? Math.min(22, Math.max(...climateTable(state.site).days.map((d) => d.hdd)) * 0.9)
    : 22;
}

export function currentQuest(state: GameState): QuestDef | null {
  const t = state.tutorial;
  if (!t || t.skipped) return null;
  const q = getQuestLine(t.line).quests[t.current];
  if (!q) return null;
  if (t.line !== 'greenfield-instructions') return q;
  if (q.id === 'gf-food') {
    const pairs = Math.max(1, Math.ceil(state.instances.filter((i) => i.person).length / 2));
    return { ...q, show: pairs > 1 ? { kind: 'system', name: 'Chicken Coop (12 hens)' } : q.show, reason: `${q.reason} For this household, follow the build list below; larger households need more food production because the site's forage supply does not grow with the household.`, steps: [
      ...(pairs > 1 ? [{ do: 'place' as const, system: 'Chicken Coop (12 hens)', mode: 'diy' as const, count: pairs - 1, near: 'home', on: false }] : []),
      ...q.steps.map((step) => step.do === 'place' ? { ...step, count: pairs === 1 ? 1 : pairs * 2 } : step),
    ] };
  }
  if (q.id === 'gf-cold' && q.goal.kind === 'staysWarm') {
    const threshold = tutorialColdThreshold(state);
    return { ...q, reason: `Keep everyone warm for three days above ${threshold.toFixed(1)} HDD. This site's cold-day threshold is the lower of 22 HDD and 90% of its coldest average month's daily HDD. The people bar shows who is short on heat; until those days arrive, keep supplies coming.`, goal: { ...q.goal, hddAbove: threshold } };
  }
  return q;
}

export interface QuestView {
  quest: QuestDef;
  index: number;
  count: number;
  status: GoalStatus;
  neighbor: string;
  rewardText: string;
}

/** Exact actionable instructions shared by the visible checklist and the tutorial bot. */
export function questStepText(step: QuestStep, catalog: Catalog): string {
  const unit = (resource: string) => catalog.resources.find((r) => r.name === resource)!.unit;
  switch (step.do) {
    case 'place': return `Build ${step.count} × ${step.system} (${step.mode === 'diy' ? 'DIY' : 'buy'}), ${step.on ? 'on' : 'near'} ${step.near === 'home' ? 'the home' : step.near}.`;
    case 'buy': return `Market: buy ${fmt(step.amount)} ${unit(step.resource)} ${step.resource}.`;
    case 'standing': return `Market: keep ${step.resource} above ${fmt(step.keepAbove)} ${unit(step.resource)}, top up to ${fmt(step.orderUpTo)} ${unit(step.resource)}.`;
    case 'workCap': return `Work: set ${step.job === 'gather-food' ? 'Forage greens & berries' : step.job === 'gather-wood' ? 'Gather firewood' : step.job} to ${step.hours === null ? 'unlimited' : `${fmt(step.hours)} h/week`} (weekly cap).`;
    case 'autoGather': return `Work: set auto-gather targets: ${[step.waterDays !== undefined && `${step.waterDays} days of water`, step.woodWeeks !== undefined && `${step.woodWeeks} weeks of firewood`, step.foodWeeks !== undefined && `${step.foodWeeks} weeks of food`].filter(Boolean).join('; ')}.`;
    case 'remove': return `Remove ${step.count ?? 'all'} ${step.system}.`;
    case 'priority': return `Set ${step.system} priority to ${step.tier}.`;
    case 'open': return `Open ${step.panel}.`;
  }
}

/** The pinned quest card's content. */
export function questView(state: GameState, catalog: Catalog): QuestView | null {
  const q = currentQuest(state);
  if (!q) return null;
  const line = tutorialLine(state)!;
  const t = state.tutorial!;
  return { quest: q, index: t.current, count: line.quests.length, status: goalStatus(state, catalog, q.goal, t.since, t.ui), neighbor: line.neighbor, rewardText: [`$${q.reward.cash.toFixed(0)}`, ...Object.entries(q.reward.stock).map(([r, v]) => `${v.toLocaleString("en-US")} ${catalog.resources.find((x) => x.name === r)?.unit ?? ""} ${r}`)].join(" + ") };
}

/**
 * Called at the end of each day: if the current quest is done, the neighbor's reward lands
 * (cash between days, like a refund; stock straight into the stockpile) and the next quest begins.
 */
export function advanceTutorial(state: GameState, catalog: Catalog): { state: GameState; completed: QuestDef | null } {
  const q = currentQuest(state);
  if (!q) return { state, completed: null };
  const t = state.tutorial!;
  if (!goalStatus(state, catalog, q.goal, t.since, t.ui).done) return { state, completed: null };
  const stocks = { ...state.stocks };
  for (const [r, v] of Object.entries(q.reward.stock)) stocks[r] = (stocks[r] ?? 0) + v;
  return {
    completed: q,
    state: {
      ...state,
      stocks,
      cash: state.cash + q.reward.cash,
      pendingCash: { ...state.pendingCash, refunds: state.pendingCash.refunds + q.reward.cash },
      tutorial: { ...t, current: t.current + 1, since: state.calendar.absDay, done: { ...t.done, [q.id]: state.calendar.absDay } },
    },
  };
}
