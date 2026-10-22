import { describe, expect, it } from 'vitest';
import { GATES, runGates } from '../bots/index.ts';

describe('Phase 2 return policy preserves pacing', () => {
  for (const gate of GATES)
    it(gate.id, () => {
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
      for (const result of runGates({ gates: [safeGate] })) {
        expect(
          result.pass,
          `${gate.id} on ${result.site}: ${result.runs.map((r) => r.detail).join('; ')}`,
        ).toBe(true);
      }
    });
});

describe('new-game rules (safer return + idle labor reuse) preserve pacing', () => {
  const rules = { safeRecovery: true, reuseIdleLabor: true };
  for (const gate of GATES)
    it(gate.id, () => {
      const g = {
        ...gate,
        makeBot: () => {
          const bot = gate.makeBot();
          return {
            ...bot,
            act: ((catalog, state, actions) => {
              if (!state.settings.reuseIdleLabor) {
                actions.push({ at: state.calendar.absDay, kind: 'settings', settings: rules });
                state = { ...state, settings: { ...state.settings, ...rules } };
              }
              return bot.act(catalog, state, actions);
            }) as typeof bot.act,
          };
        },
      };
      for (const result of runGates({ gates: [g] }))
        expect(result.pass, `${gate.id} on ${result.site}: ${result.runs.map((r) => r.detail).join('; ')}`).toBe(true);
    });
});
