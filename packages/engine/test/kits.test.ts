import { describe, expect, it } from 'vitest';
import { gameDigest, newGameFromOptions, replay, designBalance } from '../src/index.ts';
import { catalog } from './time-helpers.ts';

describe('the new-game wizard', () => {
  for (const kit of ['empty', 'tent', 'suburban'] as const) {
    for (const acres of [0.25, 1, 5]) {
      it(`lays out the ${kit} kit on ${acres} acres and replays from its actions`, () => {
        const r = newGameFromOptions(catalog, {
          siteId: 'asheville-nc',
          parcelAcres: acres,
          startingCash: 50000,
          adults: 2,
          children: 2,
          weatherMode: 'average',
          kit,
          seed: 5,
        });
        expect(r.game.instances.filter((i) => i.scale === 0.6)).toHaveLength(2);
        expect(gameDigest(replay(catalog, r.init, r.actions, 0))).toBe(gameDigest(r.game));
      });
    }
  }

  it('a suburban start covers most needs on day one', () => {
    const r = newGameFromOptions(catalog, {
      siteId: 'front-range',
      parcelAcres: 1,
      startingCash: 50000,
      adults: 2,
      children: 1,
      weatherMode: 'average',
      kit: 'suburban',
      seed: 1,
    });
    expect(designBalance(r.game, catalog).overallScore.value).toBeGreaterThan(0.6);
  });
});
