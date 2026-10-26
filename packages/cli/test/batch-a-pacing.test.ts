import { describe, expect, it } from 'vitest';
import { SITES } from '@homestead/catalog';
import { survivalAlerts } from '@homestead/engine';
import { NEW_GAME_SETTINGS, playBot } from '../bots/run.ts';
import { noviceBot } from '../bots/novice.ts';
import type { Bot } from '../bots/types.ts';

describe('Batch A: enlarged households with occupancy across all six sites', () => {
  for (const site of Object.keys(SITES)) {
    it(`${site}: four-adult greenfield survives its first winter with the supplied homes`, () => {
      const r = playBot(noviceBot(), { start: 'greenfield', site, household: 4, days: 365,
        settings: { ...NEW_GAME_SETTINGS, shelterOccupancy: true } });
      expect(r.events.filter((e) => e.kind === 'went-to-town')).toEqual([]);
      expect(r.state.instances.filter((i) => i.person?.away)).toEqual([]);
      const shelter = r.ledgers[2]!.needs.Shelter;
      expect(shelter.delivered / shelter.needed).toBeCloseTo(0.56);
      expect(r.state.cash).toBeGreaterThan(0);
    });

    it(`${site}: a four-adult, three-child farm stays fed without false hunger warnings`, () => {
      const hunger: number[] = [];
      const observer: Bot = { name: 'farm food observer', act(catalog, state) {
        if (survivalAlerts(state, catalog).some((a) => a.id === 'food-runway')) hunger.push(state.calendar.absDay);
        return state;
      } };
      const r = playBot(observer, { start: 'farm', site, household: 4, children: 3, days: 365,
        settings: { ...NEW_GAME_SETTINGS, shelterOccupancy: true } });
      expect(hunger).toEqual([]);
      expect(r.events.filter((e) => e.kind === 'went-to-town')).toEqual([]);
      for (const l of r.ledgers) expect(l.needs.Food.delivered).toBeCloseTo(l.needs.Food.needed);
      expect(r.ledgers[2]!.needs.Shelter.delivered).toBeCloseTo(1200);
      expect(r.state.finance!.mortgage!.arrears).toBe(0);
    });
  }
});
