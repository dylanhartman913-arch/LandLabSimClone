import { getQuestLine, type Catalog, type QuestDef, type QuestGoal, type QuestLine } from '@homestead/catalog';
import { computeSpatial } from './time/spatial.ts';
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
      const n = active(state, byName(catalog, goal.system)).length;
      return { done: n >= goal.count, progress: Math.min(1, n / goal.count), detail: `${Math.min(n, goal.count)} of ${goal.count} ${goal.system} built` };
    }
    case 'made': {
      const id = byName(catalog, goal.system);
      let made = 0;
      for (const [key, g] of Object.entries(state.lastDay)) {
        if (!key.startsWith(`${id}|`)) continue;
        made = Math.max(made, (g.outputs[goal.resource] ?? 0) * active(state, id).length);
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
      return { done: v >= goal.atLeast, progress: Math.min(1, v / goal.atLeast), detail: `auto-gather keeps ${v} ${what} (goal ${goal.atLeast})` };
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
  }
}

export function tutorialLine(state: GameState): QuestLine | null {
  return state.tutorial ? getQuestLine(state.tutorial.line) : null;
}

export function currentQuest(state: GameState): QuestDef | null {
  const t = state.tutorial;
  if (!t || t.skipped) return null;
  return getQuestLine(t.line).quests[t.current] ?? null;
}

export interface QuestView {
  quest: QuestDef;
  index: number;
  count: number;
  status: GoalStatus;
  neighbor: string;
}

/** The pinned quest card's content. */
export function questView(state: GameState, catalog: Catalog): QuestView | null {
  const q = currentQuest(state);
  if (!q) return null;
  const line = tutorialLine(state)!;
  const t = state.tutorial!;
  return { quest: q, index: t.current, count: line.quests.length, status: goalStatus(state, catalog, q.goal, t.since, t.ui), neighbor: line.neighbor };
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
