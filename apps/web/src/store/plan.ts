import { create } from 'zustand';
import { catalog } from '@homestead/catalog';
import { designFromGame, type DesignFile, type MonteCarloResult, type MonteCarloSpec } from '@homestead/engine';
import { startMonteCarlo, type McJob } from '../lib/montecarlo.ts';
import { loadPref, savePref } from './persist.ts';
import { useGame } from './game.ts';

export const MAX_SCENARIOS = 3;

export interface Scenario {
  id: string;
  design: DesignFile;
  siteId: string;
}

export type PlanTab = 'scenarios' | 'montecarlo' | 'sensitivity' | 'export';

export interface McState {
  /** What was run (kept so the CLI command can be shown). */
  spec: MonteCarloSpec;
  done: number;
  total: number;
  running: boolean;
  result: MonteCarloResult | null;
  error: string | null;
}

export const MC_PRESETS = {
  quick: { years: 3, seeds: 40, label: 'Quick (3 years × 40 seeds)' },
  full: { years: 10, seeds: 200, label: 'Full (10 years × 200 seeds)' },
} as const;

interface PlanStore {
  open: boolean;
  tab: PlanTab;
  scenarios: Scenario[];
  /** Monte Carlo per scenario id ('current' = the layout on the map when it was run). */
  mc: Record<string, McState>;
  setOpen(open: boolean, tab?: PlanTab): void;
  setTab(tab: PlanTab): void;
  duplicateAsScenario(name?: string): { ok: boolean; reason?: string };
  addScenario(design: DesignFile): { ok: boolean; reason?: string };
  removeScenario(id: string): void;
  renameScenario(id: string, name: string): void;
  setScenarioSite(id: string, siteId: string): void;
  runMonteCarlo(key: string, spec: MonteCarloSpec): void;
  cancelMonteCarlo(key: string): void;
}

const jobs = new Map<string, McJob>();
let nextId = Date.now() % 100000;

function persist(scenarios: Scenario[]) {
  savePref('scenarios', scenarios);
}

export const usePlan = create<PlanStore>((set, get) => ({
  open: false,
  tab: 'scenarios',
  scenarios: loadPref<Scenario[]>('scenarios', []),
  mc: {},
  setOpen(open, tab) {
    set({ open, ...(tab ? { tab } : {}) });
    if (open) useGame.getState().setPanel(null);
  },
  setTab(tab) {
    set({ tab });
  },
  duplicateAsScenario(name) {
    const g = useGame.getState().game;
    const n = get().scenarios.length + 1;
    const design = designFromGame(catalog, g, name ?? `Scenario ${n}`);
    return get().addScenario(design);
  },
  addScenario(design) {
    const list = get().scenarios;
    if (list.length >= MAX_SCENARIOS)
      return { ok: false, reason: `You can pin up to ${MAX_SCENARIOS} scenarios. Remove one first.` };
    const siteId = design.site ?? useGame.getState().game.site.id;
    const scenarios = [...list, { id: `sc${nextId++}`, design, siteId }];
    persist(scenarios);
    set({ scenarios });
    return { ok: true };
  },
  removeScenario(id) {
    get().cancelMonteCarlo(id);
    const scenarios = get().scenarios.filter((s) => s.id !== id);
    const mc = { ...get().mc };
    delete mc[id];
    persist(scenarios);
    set({ scenarios, mc });
  },
  renameScenario(id, name) {
    const scenarios = get().scenarios.map((s) => (s.id === id ? { ...s, design: { ...s.design, name } } : s));
    persist(scenarios);
    set({ scenarios });
  },
  setScenarioSite(id, siteId) {
    get().cancelMonteCarlo(id);
    const scenarios = get().scenarios.map((s) => (s.id === id ? { ...s, siteId } : s));
    const mc = { ...get().mc };
    delete mc[id];
    persist(scenarios);
    set({ scenarios, mc });
  },
  runMonteCarlo(key, spec) {
    get().cancelMonteCarlo(key);
    const update = (p: Partial<McState>) =>
      set((st) => ({ mc: { ...st.mc, [key]: { ...st.mc[key]!, ...p } } }));
    set((st) => ({
      mc: {
        ...st.mc,
        [key]: { spec, done: 0, total: spec.seeds, running: true, result: null, error: null },
      },
    }));
    const job = startMonteCarlo(spec, (done, total) => update({ done, total }));
    jobs.set(key, job);
    job.promise.then(
      (result) => {
        if (jobs.get(key) !== job) return;
        jobs.delete(key);
        update({ running: false, result });
      },
      (err: Error) => {
        if (jobs.get(key) !== job) return;
        jobs.delete(key);
        update({ running: false, error: err.message === 'cancelled' ? null : err.message });
      },
    );
  },
  cancelMonteCarlo(key) {
    const job = jobs.get(key);
    if (!job) return;
    jobs.delete(key);
    job.cancel();
    set((st) => (st.mc[key] ? { mc: { ...st.mc, [key]: { ...st.mc[key]!, running: false } } } : {}));
  },
}));

// Opening another panel or the checklist closes the plan (one dialog at a time).
useGame.subscribe((s, prev) => {
  if ((s.panel && s.panel !== prev.panel) || (s.checklistOpen && !prev.checklistOpen)) {
    if (usePlan.getState().open) usePlan.setState({ open: false });
  }
});
