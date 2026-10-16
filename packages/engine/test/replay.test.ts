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
