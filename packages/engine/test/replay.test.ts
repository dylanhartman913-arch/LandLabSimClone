import { describe, expect, it } from 'vitest';
import {
  applyAction,
  gameDigest,
  replay,
  startGame,
  stepDays,
  validateSave,
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
    expect(() => validateSave({ schema: 'something-else' })).toThrow(/Unsupported save schema/);
    expect(() => validateSave({ schema: 'homestead.save.v1' })).toThrow(/missing "init"/);
  });
});
