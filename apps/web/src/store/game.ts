import { catalog as bundledCatalog, DEFAULT_SITE_ID, type Catalog } from '@homestead/catalog';
import {
  applyAction,
  buildReport,
  canPlace,
  MILESTONES,
  QUESTS,
  displayDate,
  parcelSideFt,
  refundFor,
  startGame,
  stepDay,
  type Action,
  type ActionBody,
  type BuildMode,
  type Explained,
  type FlowGroup,
  type GameEvent,
  type GameInit,
  type GameSettings,
  type GameState,
  type Instance,
  type Report,
} from '@homestead/engine';
import { create } from 'zustand';
import { describeCommand, redoActions, undoActions, type Command } from './commands.ts';
import { loadPref, savePref } from './persist.ts';
import { DEFAULT_PREFS, type AutoPauseKey, type Prefs } from './prefs.ts';

export type Tool = { kind: 'select' } | { kind: 'place'; systemId: string; mode: BuildMode };
export type Speed = 0 | 1 | 3 | 10;
export type DrawerTab = 'systems' | 'inputs' | 'outputs';
export type Panel = null | 'almanac' | 'saves' | 'settings' | 'report';

export interface Camera {
  /** World point (ft) at the center of the view. */
  cx: number;
  cy: number;
  /** Screen pixels per foot. */
  zoom: number;
}

export interface WhyTarget {
  title: string;
  value: Explained;
  unit?: string;
  /** Page coordinates to anchor the popover. */
  x: number;
  y: number;
}

export interface Progress {
  quests: Record<string, number>;
  milestones: Record<string, number>;
  tutorialSkipped: boolean;
  dismissedHints: Record<string, number>;
}

export const EMPTY_PROGRESS: Progress = { quests: {}, milestones: {}, tutorialSkipped: false, dismissedHints: {} };

export interface Toast {
  id: number;
  text: string;
  tone: 'info' | 'warn';
  /** Instance to show on the map, if the toast is about one. */
  instanceId?: string;
}

export interface GameStore {
  catalog: Catalog;
  game: GameState;
  /** How this game began and every edit since: the replayable save. */
  init: GameInit;
  actions: Action[];
  /** Viewing a shared design: no edits. */
  readOnly: boolean;
  events: GameEvent[];
  reports: Report[];
  tool: Tool;
  selection: string[];
  camera: Camera;
  viewport: { width: number; height: number };
  speed: Speed;
  lastSpeed: Exclude<Speed, 0>;
  /** Wall-clock ms of the last day tick (for dawn/dusk tint at 1×). */
  lastTickAt: number;
  undoStack: Command[];
  redoStack: Command[];
  clipboard: { systemId: string; buildMode: BuildMode; dx: number; dy: number }[];
  drawerOpen: boolean;
  drawerTab: DrawerTab;
  cardSystemId: string | null;
  cardInstanceId: string | null;
  highlightResource: string | null;
  toasts: Toast[];
  why: WhyTarget | null;
  checklistOpen: boolean;
  panel: Panel;
  overlay: { on: boolean; groups: FlowGroup[] };
  prefs: Prefs;
  /** Tutorial and badges (saved with the game, not part of the engine state). */
  progress: Progress;
  skipTutorial(): void;
  dismissHint(resource: string): void;
  /** Keyboard placement cursor (world ft), when the player places with arrows and Enter. */
  kbCursor: { x: number; y: number } | null;
  setKbCursor(p: { x: number; y: number } | null): void;
  /** Days since the last autosave (the app autosaves weekly). */
  daysSinceAutosave: number;
  storageWarning: string | null;
  /** A save that could not be loaded, and why (shown with the last good autosave to fall back to). */
  saveProblem: { source: string; problems: string[]; file?: unknown } | null;
  setSaveProblem(p: GameStore['saveProblem']): void;

  loadGame(
    init: GameInit,
    actions: Action[],
    game: GameState,
    opts?: { readOnly?: boolean; progress?: Progress },
  ): void;
  tick(days?: number): void;
  setSpeed(s: Speed): void;
  togglePause(): void;
  startPlacing(systemId: string, mode?: BuildMode): void;
  cancelTool(): void;
  placeAt(x: number, y: number, keepTool?: boolean): { ok: boolean; reason?: string; instanceId?: string };
  select(ids: string[], additive?: boolean): void;
  moveSelection(dx: number, dy: number): boolean;
  deleteSelection(): void;
  copySelection(): void;
  paste(x: number, y: number): void;
  undo(): void;
  redo(): void;
  setGameSettings(s: Partial<GameSettings>): void;
  setCamera(c: Partial<Camera>): void;
  setViewport(width: number, height: number): void;
  zoomToFit(): void;
  focusInstance(id: string): void;
  setSnap(s: Prefs['snap']): void;
  setDrawer(open: boolean): void;
  setDrawerTab(t: DrawerTab): void;
  openCard(systemId: string | null, instanceId?: string | null): void;
  showWhy(w: WhyTarget | null): void;
  setChecklist(open: boolean): void;
  setPanel(p: Panel): void;
  setOverlay(o: Partial<GameStore['overlay']>): void;
  setInstancePriority(instanceId: string, priority: number): void;
  setInstanceLink(instanceId: string, resource: string, providerId: string | null): void;
  wizardOpen: boolean;
  setWizard(open: boolean): void;
  setHighlight(resource: string | null): void;
  setPrefs(p: Partial<Prefs>): void;
  toast(text: string, tone?: Toast['tone'], instanceId?: string): void;
  dismissToast(id: number): void;
  setStorageWarning(w: string | null): void;
}

const MAX_EVENTS = 3000;
let toastId = 1;

/** The default start: two people and a bell tent on an acre of Front Range grass in early April. */
export const DEFAULT_INIT: GameInit = {
  siteId: DEFAULT_SITE_ID,
  seed: 2026,
  settings: { startDay: 90, startingStocks: { Food: 240_000, 'Drinking water': 40 } },
};

/** The default starting layout as actions (so it is part of the replayable log). */
export function defaultSetup(
  catalog: Catalog,
  init: GameInit = DEFAULT_INIT,
): { game: GameState; actions: Action[] } {
  let game = startGame(catalog, init);
  const side = parcelSideFt(game.settings);
  const actions: Action[] = [];
  const place = (name: string, x: number, y: number) => {
    const s = catalog.systems.find((x) => x.name === name)!;
    const a: Action = {
      at: 0,
      kind: 'place',
      systemId: s.id,
      x,
      y,
      mode: 'prebuilt',
      id: `i${game.nextInstanceId}`,
    };
    game = applyAction(catalog, game, a);
    actions.push(a);
  };
  place('Land Title ($50k)', side / 2, side / 2);
  place('Sunlight', side / 2, side / 2);
  place('Rainfall', side / 2, side / 2);
  place('Bell Tent', side / 2, side / 2 - 30);
  place('Human Being', side / 2 - 6, side / 2 - 8);
  place('Human Being', side / 2 + 6, side / 2 - 8);
  return { game, actions };
}

export function snapTo(v: number, step: number): number {
  return step > 0 ? Math.round(v / step) * step : v;
}

const AUTO_PAUSE_TEXT: Record<AutoPauseKey, string> = {
  shortage: 'a household need went short',
  hardship: 'someone is suffering a hardship',
  built: 'construction finished',
  harvest: 'a harvest is in',
  frost: 'first frost',
  cash: 'cash is below a month of running costs',
  season: 'the season ended',
};

export const useGame = create<GameStore>()((set, get) => {
  const initial = defaultSetup(bundledCatalog);
  const side = parcelSideFt(initial.game.settings);
  const prefs = { ...DEFAULT_PREFS, ...loadPref<Partial<Prefs>>('prefs', {}) };

  /** Apply an engine action to the game and log it (the only way the design changes). */
  const apply = (game: GameState, body: ActionBody): { game: GameState; action: Action } => {
    const action = { ...body, at: game.calendar.absDay } as Action;
    return { game: applyAction(get().catalog, game, action), action };
  };

  const commit = (game: GameState, logged: Action[], cmd: Command, extra: Partial<GameStore> = {}) => {
    set((s) => ({
      game,
      actions: [...s.actions, ...logged],
      undoStack: [...s.undoStack.slice(-199), cmd],
      redoStack: [],
      ...extra,
    }));
  };

  const guard = (): boolean => {
    if (get().readOnly) {
      get().toast('This is a shared design, read only. Make a copy to edit it.', 'warn');
      return false;
    }
    return true;
  };

  return {
    catalog: bundledCatalog,
    game: initial.game,
    init: DEFAULT_INIT,
    actions: initial.actions,
    readOnly: false,
    events: [],
    reports: [],
    tool: { kind: 'select' },
    selection: [],
    camera: { cx: side / 2, cy: side / 2, zoom: 4 },
    viewport: { width: 1200, height: 800 },
    speed: 0,
    lastSpeed: prefs.defaultSpeed,
    lastTickAt: 0,
    undoStack: [],
    redoStack: [],
    clipboard: [],
    drawerOpen: loadPref('drawerOpen', true),
    drawerTab: loadPref<DrawerTab>('drawerTab', 'systems'),
    cardSystemId: null,
    cardInstanceId: null,
    highlightResource: null,
    toasts: [],
    why: null,
    checklistOpen: false,
    panel: null,
    overlay: { on: false, groups: ['water', 'power', 'food', 'heat', 'waste'] },
    prefs,
    daysSinceAutosave: 0,
    storageWarning: null,
    saveProblem: null,
    progress: EMPTY_PROGRESS,
    kbCursor: null,

    skipTutorial() {
      set((s) => ({ progress: { ...s.progress, tutorialSkipped: true } }));
    },

    dismissHint(resource) {
      set((s) => ({
        progress: { ...s.progress, dismissedHints: { ...s.progress.dismissedHints, [resource]: s.game.calendar.absDay } },
      }));
    },

    setKbCursor(kbCursor) {
      set({ kbCursor });
    },

    loadGame(init, actions, game, opts = {}) {
      set({
        progress: opts.progress ?? EMPTY_PROGRESS,
        init,
        actions,
        game,
        readOnly: opts.readOnly ?? false,
        events: [],
        reports: [],
        selection: [],
        undoStack: [],
        redoStack: [],
        tool: { kind: 'select' },
        speed: 0,
        cardSystemId: null,
        cardInstanceId: null,
        checklistOpen: false,
        panel: null,
        daysSinceAutosave: 0,
      });
      get().zoomToFit();
    },

    tick(days = 1) {
      const st = get();
      let game = st.game;
      const newEvents: GameEvent[] = [];
      const reports: Report[] = [];
      let pauseReason: string | null = null;
      const ap = st.prefs.autoPause;
      for (let k = 0; k < days; k++) {
        const r = stepDay(game, st.catalog);
        game = r.state;
        newEvents.push(...r.events);
        const d = displayDate(r.ledger.day, r.ledger.year);
        // Reports at the end of each display season and each year.
        if (d.lastDayOfSeason) {
          const from = game.ledgers.findIndex(
            (l) =>
              displayDate(l.day, l.year).seasonStartDay === d.seasonStartDay &&
              l.absDay > r.ledger.absDay - 100,
          );
          const ledgers = game.ledgers.slice(Math.max(0, from));
          reports.push(
            buildReport(
              game,
              st.catalog,
              'season',
              ledgers,
              `${d.label.split(' ')[0]} report, year ${d.year}`,
            ),
          );
          if (ap.season) pauseReason ??= AUTO_PAUSE_TEXT.season;
        }
        if (r.ledger.day === 364) {
          const year = game.ledgers.filter((l) => l.year === r.ledger.year);
          reports.push(buildReport(game, st.catalog, 'year', year, `Year ${r.ledger.year + 1} report`));
        }
        for (const e of r.events) {
          if (
            ap.shortage &&
            e.kind === 'shortage' &&
            isHouseholdNeed(e.resource) &&
            !st.events.some((x) => x.kind === 'shortage' && x.resource === e.resource)
          ) {
            pauseReason ??= `${AUTO_PAUSE_TEXT.shortage} (${e.resource})`;
          }
          if (ap.hardship && e.kind === 'hardship') pauseReason ??= AUTO_PAUSE_TEXT.hardship;
          if (ap.built && e.kind === 'built') pauseReason ??= AUTO_PAUSE_TEXT.built;
          if (ap.harvest && e.kind === 'harvest') pauseReason ??= AUTO_PAUSE_TEXT.harvest;
        }
        if (ap.frost && r.ledger.weather.tags.includes('first frost')) pauseReason ??= AUTO_PAUSE_TEXT.frost;
        if (ap.cash) {
          const month = game.ledgers.slice(-30);
          const costs = month.reduce((a, l) => a + l.cash.out, 0);
          if (costs > 0 && game.cash < costs && game.cash + r.ledger.cash.out - r.ledger.cash.in >= costs) {
            pauseReason ??= AUTO_PAUSE_TEXT.cash;
          }
        }
        if (pauseReason) break;
      }
      const events = newEvents.length ? [...st.events, ...newEvents].slice(-MAX_EVENTS) : st.events;
      set({
        game,
        events,
        lastTickAt: performance.now(),
        daysSinceAutosave: st.daysSinceAutosave + days,
        ...(reports.length
          ? { reports: [...st.reports, ...reports].slice(-12), panel: 'report' as Panel }
          : {}),
        ...(pauseReason ? { speed: 0 as Speed } : {}),
      });
      for (const e of newEvents) toastForEvent(e);
      if (pauseReason) get().toast(`Paused: ${pauseReason}.`, 'warn');
      updateProgress();
    },

    setSpeed(speed) {
      set((s) => ({ speed, lastSpeed: speed === 0 ? s.lastSpeed : speed }));
    },

    togglePause() {
      const s = get();
      s.setSpeed(s.speed === 0 ? s.lastSpeed : 0);
    },

    startPlacing(systemId, mode = 'buy') {
      if (!guard()) return;
      set({ tool: { kind: 'place', systemId, mode }, selection: [], kbCursor: null });
    },

    cancelTool() {
      set({ tool: { kind: 'select' } });
    },

    placeAt(x, y, keepTool = false) {
      const { tool, game, catalog, prefs } = get();
      if (tool.kind !== 'place') return { ok: false, reason: 'Nothing to place' };
      if (!guard()) return { ok: false, reason: 'Read only' };
      const px = snapTo(x, prefs.snap);
      const py = snapTo(y, prefs.snap);
      const check = canPlace(catalog, game, tool.systemId, px, py);
      if (!check.ok) return { ok: false, reason: check.reason };
      const id = `i${game.nextInstanceId}`;
      const r = apply(game, { kind: 'place', systemId: tool.systemId, x: px, y: py, mode: tool.mode, id });
      const inst = r.game.instances.find((i) => i.id === id)!;
      commit(
        r.game,
        [r.action],
        { kind: 'place', instances: [inst] },
        keepTool ? {} : { tool: { kind: 'select' }, selection: [id] },
      );
      return { ok: true, instanceId: id };
    },

    select(ids, additive = false) {
      set((s) => {
        if (!additive) return { selection: ids };
        const cur = new Set(s.selection);
        for (const id of ids) {
          if (cur.has(id)) cur.delete(id);
          else cur.add(id);
        }
        return { selection: [...cur] };
      });
    },

    moveSelection(dx, dy) {
      const { selection, game, catalog, prefs } = get();
      if (!selection.length || (dx === 0 && dy === 0)) return false;
      if (!guard()) return false;
      const moves: Extract<Command, { kind: 'move' }>['moves'] = [];
      for (const id of selection) {
        const inst = game.instances.find((i) => i.id === id);
        if (!inst) continue;
        const to = { x: snapTo(inst.x + dx, prefs.snap), y: snapTo(inst.y + dy, prefs.snap) };
        const check = canPlace(catalog, game, inst.systemId, to.x, to.y, selection);
        if (!check.ok) {
          get().toast(check.reason, 'warn');
          return false;
        }
        moves.push({ id, from: { x: inst.x, y: inst.y }, to });
      }
      const r = apply(game, { kind: 'moveMany', moves: moves.map((m) => ({ id: m.id, ...m.to })) });
      commit(r.game, [r.action], { kind: 'move', moves });
      return true;
    },

    deleteSelection() {
      const { selection, game } = get();
      if (!selection.length || !guard()) return;
      let s = game;
      const logged: Action[] = [];
      const removed: Extract<Command, { kind: 'remove' }>['removed'] = [];
      for (const id of selection) {
        const index = s.instances.findIndex((i) => i.id === id);
        if (index < 0) continue;
        const inst = s.instances[index]!;
        removed.push({ inst, index, refund: refundFor(inst) });
        const r = apply(s, { kind: 'remove', id });
        s = r.game;
        logged.push(r.action);
      }
      commit(s, logged, { kind: 'remove', removed }, { selection: [] });
    },

    copySelection() {
      const { selection, game } = get();
      const insts = game.instances.filter((i) => selection.includes(i.id));
      if (!insts.length) return;
      const cx = insts.reduce((a, i) => a + i.x, 0) / insts.length;
      const cy = insts.reduce((a, i) => a + i.y, 0) / insts.length;
      set({
        clipboard: insts.map((i) => ({
          systemId: i.systemId,
          buildMode: i.buildMode === 'prebuilt' ? 'buy' : i.buildMode,
          dx: i.x - cx,
          dy: i.y - cy,
        })),
      });
    },

    paste(x, y) {
      const { clipboard, game, catalog, prefs } = get();
      if (!clipboard.length || !guard()) return;
      let s = game;
      const placed: Instance[] = [];
      const logged: Action[] = [];
      for (const c of clipboard) {
        const px = snapTo(x + c.dx, prefs.snap);
        const py = snapTo(y + c.dy, prefs.snap);
        if (!canPlace(catalog, s, c.systemId, px, py).ok) continue;
        const id = `i${s.nextInstanceId}`;
        const r = apply(s, { kind: 'place', systemId: c.systemId, x: px, y: py, mode: c.buildMode, id });
        s = r.game;
        logged.push(r.action);
        placed.push(s.instances.find((i) => i.id === id)!);
      }
      if (!placed.length) {
        get().toast('No room to paste here', 'warn');
        return;
      }
      commit(s, logged, { kind: 'place', instances: placed }, { selection: placed.map((i) => i.id) });
    },

    undo() {
      const { undoStack, game } = get();
      const cmd = undoStack.at(-1);
      if (!cmd || !guard()) return;
      try {
        let s = game;
        const logged: Action[] = [];
        for (const body of undoActions(cmd)) {
          const r = apply(s, body);
          s = r.game;
          logged.push(r.action);
        }
        set((st) => ({
          game: s,
          actions: [...st.actions, ...logged],
          undoStack: st.undoStack.slice(0, -1),
          redoStack: [...st.redoStack, cmd],
          selection: [],
        }));
      } catch {
        get().toast(`Can't undo the ${describeCommand(cmd)}: something is in the way`, 'warn');
      }
    },

    redo() {
      const { redoStack, game } = get();
      const cmd = redoStack.at(-1);
      if (!cmd || !guard()) return;
      try {
        let s = game;
        const logged: Action[] = [];
        for (const body of redoActions(cmd)) {
          const r = apply(s, body);
          s = r.game;
          logged.push(r.action);
        }
        set((st) => ({
          game: s,
          actions: [...st.actions, ...logged],
          redoStack: st.redoStack.slice(0, -1),
          undoStack: [...st.undoStack, cmd],
        }));
      } catch {
        get().toast(`Can't redo the ${describeCommand(cmd)}: something is in the way`, 'warn');
      }
    },

    setGameSettings(settings) {
      const { game } = get();
      if (!guard()) return;
      const from: Record<string, unknown> = {};
      for (const k of Object.keys(settings) as (keyof GameSettings)[]) from[k] = game.settings[k];
      const r = apply(game, { kind: 'settings', settings });
      commit(r.game, [r.action], { kind: 'settings', from, to: settings as Record<string, unknown> });
    },

    setCamera(c) {
      set((s) => ({
        camera: { ...s.camera, ...c, zoom: Math.min(40, Math.max(0.3, c.zoom ?? s.camera.zoom)) },
      }));
    },

    setViewport(width, height) {
      set({ viewport: { width, height } });
    },

    zoomToFit() {
      const { game, viewport } = get();
      const side = parcelSideFt(game.settings);
      const zoom = Math.min(viewport.width, viewport.height) / (side * 1.1);
      get().setCamera({ cx: side / 2, cy: side / 2, zoom });
    },

    focusInstance(id) {
      const inst = get().game.instances.find((i) => i.id === id);
      if (!inst) return;
      set({ selection: [id], checklistOpen: false, panel: null });
      get().setCamera({ cx: inst.x, cy: inst.y, zoom: Math.max(get().camera.zoom, 6) });
    },

    setSnap(snap) {
      get().setPrefs({ snap });
    },

    setDrawer(open) {
      savePref('drawerOpen', open);
      set({ drawerOpen: open });
    },

    setDrawerTab(t) {
      savePref('drawerTab', t);
      set({ drawerTab: t });
    },

    openCard(systemId, instanceId = null) {
      set({ cardSystemId: systemId, cardInstanceId: systemId ? instanceId : null, why: null });
    },

    showWhy(why) {
      set({ why });
    },

    setChecklist(open) {
      set({ checklistOpen: open, why: null, ...(open ? { panel: null } : {}) });
    },

    setPanel(panel) {
      set({ panel, why: null, ...(panel ? { checklistOpen: false } : {}) });
    },

    setOverlay(o) {
      set((s) => ({ overlay: { ...s.overlay, ...o } }));
    },

    setInstancePriority(instanceId, priority) {
      const { game } = get();
      const inst = game.instances.find((i) => i.id === instanceId);
      if (!inst || inst.priority === priority || !guard()) return;
      const r = apply(game, { kind: 'priority', id: instanceId, priority });
      commit(r.game, [r.action], { kind: 'priority', id: instanceId, from: inst.priority, to: priority });
    },

    setInstanceLink(instanceId, resource, providerId) {
      const { game } = get();
      const inst = game.instances.find((i) => i.id === instanceId);
      if (!inst || !guard()) return;
      const from = inst.links?.[resource] ?? null;
      if (from === providerId) return;
      const r = apply(game, { kind: 'link', id: instanceId, resource, providerId });
      commit(r.game, [r.action], { kind: 'link', id: instanceId, resource, from, to: providerId });
    },

    wizardOpen: false,

    setWizard(open) {
      set({ wizardOpen: open, panel: null, why: null });
    },

    setHighlight(resource) {
      set({ highlightResource: resource });
    },

    setPrefs(p) {
      const prefs = { ...get().prefs, ...p };
      savePref('prefs', prefs);
      set({ prefs });
    },

    toast(text, tone = 'info', instanceId) {
      const id = toastId++;
      set((s) => ({
        toasts: [...s.toasts.slice(-4), { id, text, tone, ...(instanceId ? { instanceId } : {}) }],
      }));
      setTimeout(() => get().dismissToast(id), 6000);
    },

    dismissToast(id) {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    },

    setSaveProblem(p) {
      set({ saveProblem: p });
    },
    setStorageWarning(storageWarning) {
      set({ storageWarning });
    },
  };
});

/** Check the current quest and every unearned milestone; celebrate quietly. */
function updateProgress(): void {
  const s = useGame.getState();
  const p = s.progress;
  const day = s.game.calendar.absDay;
  const quests = { ...p.quests };
  const milestones = { ...p.milestones };
  let changed = false;
  const current = QUESTS.find((q) => quests[q.id] === undefined);
  if (current && !p.tutorialSkipped && current.check(s.game, s.catalog).done) {
    quests[current.id] = day;
    changed = true;
    s.toast(`Quest complete: ${current.title}.`);
  }
  if (day % 7 === 0 || s.game.ledgers.length < 8) {
    for (const m of MILESTONES) {
      if (milestones[m.id] !== undefined || !m.check(s.game, s.catalog)) continue;
      milestones[m.id] = day;
      changed = true;
      s.toast(`Milestone: ${m.title}.`);
    }
  }
  if (changed) useGame.setState({ progress: { ...p, quests, milestones } });
}

const HOUSEHOLD = new Set([
  'Food',
  'Drinking water',
  'Water',
  'Heat',
  'Shelter',
  'Electricity',
  'Sanitation',
]);
function isHouseholdNeed(resource: string): boolean {
  return HOUSEHOLD.has(resource);
}

/** Turn notable engine events into toasts (with "show on map" when they concern an instance). */
function toastForEvent(e: GameEvent): void {
  const s = useGame.getState();
  const name = (systemId: string) => s.catalog.systems.find((x) => x.id === systemId)?.name ?? systemId;
  switch (e.kind) {
    case 'built': {
      const inst = s.game.instances.find((i) => i.id === e.instanceId);
      if (inst) s.toast(`${name(inst.systemId)} is built.`, 'info', e.instanceId);
      break;
    }
    case 'harvest':
      s.toast(`Harvest: ${name(e.systemId)} → ${e.resource}.`, 'info', e.instanceIds[0]);
      break;
    case 'hardship':
      s.toast(
        `Hardship: not enough ${e.need === 'drinkingWater' ? 'drinking water' : e.need}.`,
        'warn',
        e.instanceId,
      );
      break;
    case 'shortage':
      if (isHouseholdNeed(e.resource) || e.curtailed.length) {
        s.toast(
          `Short on ${e.resource}${e.curtailed.length ? `: ${e.curtailed.length} system${e.curtailed.length === 1 ? '' : 's'} slowed` : ''}.`,
          'warn',
          e.curtailed[0],
        );
      }
      break;
    default:
      break;
  }
}

/** Screen ↔ world conversion for the current camera. */
export function worldToScreen(c: Camera, v: { width: number; height: number }, x: number, y: number) {
  return { x: (x - c.cx) * c.zoom + v.width / 2, y: (y - c.cy) * c.zoom + v.height / 2 };
}

export function screenToWorld(c: Camera, v: { width: number; height: number }, sx: number, sy: number) {
  return { x: (sx - v.width / 2) / c.zoom + c.cx, y: (sy - v.height / 2) / c.zoom + c.cy };
}
