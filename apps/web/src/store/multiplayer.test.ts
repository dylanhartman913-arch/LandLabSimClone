import { afterEach, describe, expect, it, vi } from 'vitest';
import { gameDigest } from '@homestead/engine';
import { useGame } from './game.ts';

vi.mock('./persist.ts', () => ({
  loadPref: (_key: string, fallback: unknown) => fallback,
  savePref: () => undefined,
}));
const initial = useGame.getState();
afterEach(() => useGame.setState(initial, true));

describe('multiplayer store authority boundary', () => {
  it('routes gameplay intentions without applying a local edit, price, identifier or day', () => {
    const send = vi.fn();
    const control = vi.fn();
    useGame.setState({ multiplayer: { send, control } });
    const s = useGame.getState();
    const before = gameDigest(s.game);
    const system = s.catalog.systems.find((sys) => sys.name === 'Rain Barrel (55 gal)')!;
    s.startPlacing(system.id, 'buy');
    s.placeAt(25, 25);
    s.select([s.game.instances.at(-1)!.id]);
    s.moveSelection(5, 0);
    s.deleteSelection();
    s.marketBuy('Food', 1000);
    s.marketStanding('Food', 2000);
    s.setInstancePriority(s.game.instances[0]!.id, 3);
    s.setInstanceLink(s.game.instances[0]!.id, 'Water', null);
    s.hireConstruction(s.game.instances[0]!.id);
    s.phase9Action({ kind: 'service', id: s.game.instances[0]!.id, replace: false });
    s.setGameSettings({ work: { priorities: { construction: 5 } }, autoGather: { waterDays: 7 } });
    s.bookRecoveryRoute([{ kind: 'settings', settings: { startingCash: 1e9 } }]);
    s.tick(100);
    s.setSpeed(10);
    expect(gameDigest(useGame.getState().game)).toBe(before);
    expect(useGame.getState().actions).toBe(initial.actions);
    expect(send.mock.calls.flatMap(([commands]) => commands).map((c) => c.kind)).toEqual([
      'place',
      'moveMany',
      'remove',
      'buy',
      'standing',
      'priority',
      'link',
      'hireConstruction',
      'service',
      'workPriority',
      'autoGather',
      'recoveryRoute',
    ]);
    expect(send.mock.calls[0]![0][0]).toEqual({
      kind: 'place',
      systemId: system.id,
      x: 25,
      y: 25,
      mode: 'buy',
    });
    expect(control).toHaveBeenCalledWith(true);
    expect(useGame.getState().speed).toBe(0);
  });
  it('blocks local replacement, undo, rewind, tutorial skip, rules and saves while preserving local view controls', () => {
    const send = vi.fn();
    useGame.setState({ multiplayer: { send, control: vi.fn() } });
    const s = useGame.getState();
    s.loadGame(s.init, [], { ...s.game, cash: 1e9 });
    s.undo();
    s.redo();
    s.skipTutorial();
    s.setGameSettings({ unlimitedSupply: true });
    s.setPanel('saves');
    s.setWizard(true);
    s.setCamera({ cx: 20, zoom: 2 });
    s.select([s.game.instances[0]!.id]);
    expect(useGame.getState().game).toBe(initial.game);
    expect(useGame.getState().panel).toBeNull();
    expect(useGame.getState().wizardOpen).toBe(false);
    expect(useGame.getState().camera.cx).toBe(20);
    expect(useGame.getState().selection).toEqual([s.game.instances[0]!.id]);
    expect(send).not.toHaveBeenCalled();
  });
});
