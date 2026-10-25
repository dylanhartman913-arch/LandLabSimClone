import { describe, expect, it } from 'vitest';
import { GATES, GATE_SITES, runGates } from '../bots/index.ts';

describe('Phase 2 return policy preserves pacing', () => {
  for (const gate of GATES)
    for (const site of GATE_SITES)
    it(`${gate.id} on ${site}`, () => {
      const safeGate = {
        ...gate,
        makeBot: () => {
          const bot = gate.makeBot();
          return {
            ...bot,
            act: ((catalog, state, actions) => {
              if (!state.settings.safeRecovery) {
                actions.push({
                  at: state.calendar.absDay,
                  kind: 'settings',
                  settings: { safeRecovery: true },
                });
                state = { ...state, settings: { ...state.settings, safeRecovery: true } };
              }
              return bot.act(catalog, state, actions);
            }) as typeof bot.act,
          };
        },
      };
      for (const result of runGates({ gates: [safeGate], sites: [site] })) {
        expect(
          result.pass,
          `${gate.id} on ${result.site}: ${result.runs.map((r) => r.detail).join('; ')}`,
        ).toBe(true);
      }
    });
});

describe('new-game rules (safer return, idle labor reuse, survival-level shelter return, safe water first, service warm-up) preserve pacing', () => {
  const rules = { safeRecovery: true, reuseIdleLabor: true, survivalShelterReturn: true, safeWaterFirst: true, serviceWarmUp: true };
  for (const gate of GATES)
    for (const site of GATE_SITES)
    it(`${gate.id} on ${site}`, () => {
      const g = {
        ...gate,
        makeBot: () => {
          const bot = gate.makeBot();
          return {
            ...bot,
            act: ((catalog, state, actions) => {
              if (!state.settings.safeWaterFirst) {
                actions.push({ at: state.calendar.absDay, kind: 'settings', settings: rules });
                state = { ...state, settings: { ...state.settings, ...rules } };
              }
              return bot.act(catalog, state, actions);
            }) as typeof bot.act,
          };
        },
      };
      for (const result of runGates({ gates: [g], settings: rules, sites: [site] }))
        expect(result.pass, `${gate.id} on ${result.site}: ${result.runs.map((r) => r.detail).join('; ')}`).toBe(true);
    });
});
