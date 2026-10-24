import { describe, expect, it } from 'vitest';
import {
  applyAction,
  gameDigest,
  replay,
  startGame,
  stepDays,
  validateSave,
  saveProblems,
  SaveError,
  type Action,
  type ActionBody,
  type GameInit,
  type GameState,
} from '../src/index.ts';
import { catalog, sysId } from './time-helpers.ts';
import winter from './fixtures/playtest/winter.json';

/** Play a scripted two years, logging every operation the way the app does. */
function scriptedPlay(): { init: GameInit; actions: Action[]; final: GameState } {
  const init: GameInit = { siteId: 'laramie-wy', seed: 99, settings: { startDay: 90 } };
  let s = startGame(catalog, init);
  const actions: Action[] = [];
  const act = (a: ActionBody) => {
    const full = { ...a, at: s.calendar.absDay } as Action;
    s = applyAction(catalog, s, full);
    actions.push(full);
  };
  const place = (name: string, x: number, y: number, mode: 'buy' | 'diy' | 'prebuilt') =>
    act({ kind: 'place', systemId: sysId(name), x, y, mode, id: `i${s.nextInstanceId}` });
  place('Human Being', 100, 100, 'prebuilt');
  place('Human Being', 104, 100, 'prebuilt');
  place('Yurt', 60, 60, 'diy');
  place('Well', 140, 40, 'buy');
  place('Rooftop Solar Array (6 kW)', 40, 150, 'buy');
  s = stepDays(s, catalog, 45).state;
  place('LiFePO4 Battery Bank (10 kWh)', 80, 150, 'buy');
  place('Raised Beds (24 sq ft)', 150, 150, 'diy');
  act({ kind: 'priority', id: 'i4', priority: 0 });
  s = stepDays(s, catalog, 200).state;
  act({ kind: 'move', id: 'i7', x: 160, y: 170 });
  place('Chicken Coop (12 hens)', 30, 60, 'buy');
  s = stepDays(s, catalog, 100).state;
  act({ kind: 'remove', id: 'i8' });
  act({ kind: 'settings', settings: { constructionShare: 0.4 } });
  s = stepDays(s, catalog, 385).state;
  return { init, actions, final: s };
}

describe('saves replay exactly', () => {
  it('two years of scripted play replay from the action log to the same digest', () => {
    const { init, actions, final } = scriptedPlay();
    expect(final.calendar.absDay).toBe(730);
    const again = replay(catalog, init, actions, final.calendar.absDay);
    expect(gameDigest(again)).toBe(gameDigest(final));
  });

  it('a save survives JSON round-tripping', () => {
    const { init, actions, final } = scriptedPlay();
    const file = JSON.parse(
      JSON.stringify({
        schema: 'homestead.save.v1',
        engineVersion: '0',
        catalogSha256: catalog.source.sha256,
        name: 'test',
        savedAt: 'now',
        init,
        actions,
        absDay: final.calendar.absDay,
        digest: gameDigest(final),
        state: final,
      }),
    );
    const save = validateSave(file);
    expect(gameDigest(save.state)).toBe(save.digest);
    expect(gameDigest(replay(catalog, save.init, save.actions, save.absDay))).toBe(save.digest);
  });

  it('rejects a file that is not a save', () => {
    expect(() => validateSave({ schema: 'something-else' })).toThrow(/not a homestead\.save\.v1 file/);
    expect(() => validateSave({ schema: 'homestead.save.v1' })).toThrow(/missing "init"/);
    expect(saveProblems(null)).toEqual(['The file is not a save (it has no fields).']);
  });

  it('a damaged save lists every problem, including systems the catalog no longer has', () => {
    const init: GameInit = { siteId: 'front-range', seed: 5, settings: {} };
    const g = applyAction(catalog, startGame(catalog, init), {
      at: 0,
      kind: 'place',
      systemId: sysId('Yurt'),
      x: 50,
      y: 50,
      mode: 'prebuilt',
      id: 'i1',
    });
    const damaged = {
      schema: 'homestead.save.v1',
      init,
      actions: [],
      absDay: 0,
      digest: 'x',
      state: { ...g, ledgers: 'oops', instances: [{ ...g.instances[0], systemId: 'S999' }] },
    };
    const problems = saveProblems(damaged, catalog);
    expect(problems).toContain('Its game snapshot has no daily ledgers.');
    expect(problems).toContain("It places systems this catalog doesn't have: S999.");
    expect(() => validateSave(damaged, catalog)).toThrow(SaveError);
  });
});

describe('LL-11: the full player story survives a save', () => {
  const NEW = { safeRecovery: true, reuseIdleLabor: true, survivalShelterReturn: true, safeWaterFirst: true, serviceWarmUp: true, tutorialSeasons: true };
  const asFile = (init: GameInit, actions: Action[], state: GameState) =>
    JSON.parse(JSON.stringify({ schema: 'homestead.save.v1', engineVersion: '0', catalogSha256: catalog.source.sha256, name: 't', savedAt: '', init, actions, absDay: state.calendar.absDay, digest: gameDigest(state), state }));

  /** A greenfield game driven only by logged actions, as the app records it. */
  const story = () => {
    const init: GameInit = { siteId: 'front-range', seed: 3, settings: NEW, start: { id: 'greenfield', difficulty: 'standard', household: 2 } };
    let s = startGame(catalog, init);
    const actions: Action[] = [];
    const act = (body: ActionBody) => {
      const a = { ...body, at: s.calendar.absDay } as Action;
      s = applyAction(catalog, s, a);
      actions.push(a);
    };
    s = stepDays(s, catalog, 3).state;
    act({ kind: 'place', systemId: sysId('Yurt'), x: 60, y: 60, mode: 'diy', id: `i${s.nextInstanceId}` });
    act({ kind: 'settings', settings: { work: { caps: { 'gather-wood': 6 } } } });
    act({ kind: 'standing', resource: 'Carbon', keepAbove: 40, orderUpTo: 120 });
    s = stepDays(s, catalog, 4).state;
    act({ kind: 'buy', resource: 'Woody biomass', amount: 300 }); // arrives on the next trip, after the save
    return { init, actions, state: s };
  };

  it('mid-construction, with work rules and orders pending, a save replays to the same state', () => {
    const { init, actions, state } = story();
    const yurt = state.instances.find((i) => i.systemId === sysId('Yurt'))!;
    expect(yurt.status).toBe('building');
    expect(yurt.setupHoursDone).toBeGreaterThan(0);
    expect(state.market!.orders).toHaveLength(1);
    const file = validateSave(asFile(init, actions, state), catalog);
    const again = replay(catalog, file.init, file.actions, file.absDay);
    expect(gameDigest(again)).toBe(file.digest);
    expect(again.tutorial!.line).toBe('greenfield-seasons');
    expect(again.settings).toMatchObject(NEW);
  });

  it('after loading, the game goes on exactly as if it had never been saved: orders once, no early output', () => {
    const { init, actions, state } = story();
    const file = validateSave(asFile(init, actions, state), catalog);
    const kept = stepDays(state, catalog, 20);
    const loaded = stepDays(replay(catalog, file.init, file.actions, file.absDay), catalog, 20);
    expect(gameDigest(loaded.state)).toBe(gameDigest(kept.state));
    const trips = (r: typeof kept) => r.events.filter((e) => e.kind === 'market').length;
    expect(trips(loaded)).toBe(trips(kept));
    const wood = (r: typeof kept) => r.ledgers.reduce((a, l) => a + (l.resources['Woody biomass']?.purchased ?? 0), 0);
    expect(wood(loaded)).toBeCloseTo(wood(kept), 9);
    const yurt = (g: GameState) => g.instances.find((i) => i.systemId === sysId('Yurt'))!;
    expect(yurt(loaded.state).setupHoursDone).toBeCloseTo(yurt(kept.state).setupHoursDone, 9);
  });

  it('residents in town come back to the same rules after a save (the recorded winter game)', () => {
    let s = replay(catalog, winter.init as GameInit, winter.actions as Action[], winter.absDay);
    const a = { at: s.calendar.absDay, kind: 'settings', settings: NEW } as Action;
    s = applyAction(catalog, s, a);
    expect(s.instances.some((i) => i.person?.away)).toBe(true);
    const file = validateSave(asFile(winter.init as GameInit, [...(winter.actions as Action[]), a], s), catalog);
    const loaded = replay(catalog, file.init, file.actions, file.absDay);
    expect(gameDigest(loaded)).toBe(file.digest);
    expect(gameDigest(stepDays(loaded, catalog, 30).state)).toBe(gameDigest(stepDays(s, catalog, 30).state));
  });
});
