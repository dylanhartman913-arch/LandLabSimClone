import { describe, expect, it } from 'vitest';
import { realOverrides, realXlsx, tryExport, mutatedXlsx, setCell } from './helpers.ts';
import type { Overrides } from '../src/schema.ts';

const overrides = realOverrides as Overrides;

describe('experimental preservation and livestock configuration', () => {
  it('rejects food-processing inputs without a calorie conversion', () => {
    const bad = {
      ...overrides,
      preservationRecipes: [{ ...overrides.preservationRecipes![0]!, inputs: ['Water'] }],
    };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/positive food conversion/);
  });

  it('rejects missing offspring rules and impossible age curves', () => {
    const rule = overrides.livestockRules!.find((r) => r.maturesInto)!;
    const bad = {
      ...overrides,
      livestockRules: [{ ...rule, maturesInto: { systemId: 'S001', scaleMultiplier: 1 } }],
    };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/no lifecycle rule/);
    expect(
      tryExport(realXlsx, { ...overrides, livestockRules: [{ ...rule, primeDays: rule.maxAgeDays + 1 }] })
        .error?.message,
    ).toMatch(/maturity/);
  });

  it('rejects a preserved-food unit change that would mix pounds and calories', () => {
    const wrongUnit = mutatedXlsx((wb) => setCell(wb, 'Resources', 'B64', 'lbs'));
    expect(tryExport(wrongUnit, overrides).error?.message).toMatch(/in kcal/);
  });

  it('rejects duplicate processor rules instead of silently picking one', () => {
    const rule = overrides.preservationRecipes![0]!;
    expect(tryExport(realXlsx, { ...overrides, preservationRecipes: [rule, rule] }).error?.message).toMatch(
      /duplicate/,
    );
  });
});
