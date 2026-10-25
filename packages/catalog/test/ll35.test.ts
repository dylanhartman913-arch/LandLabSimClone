import { describe, expect, it } from 'vitest';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';
import type { Overrides } from '../src/schema.ts';

const overrides = realOverrides as Overrides;
const rule = overrides.soilFertility!;

describe('LL-35 soil fertility rules', () => {
  it('rejects a garden rule for a system with no seasonal or yearly compost', () => {
    const bad = { ...overrides, soilFertility: { ...rule, gardens: [...rule.gardens, { systemId: 'S001', initial: 1, drawPerYear: 0.3 }] } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/no seasonal or yearly Compost/);
  });

  it('rejects duplicates, a start above the maximum, and an unknown cover crop', () => {
    expect(tryExport(realXlsx, { ...overrides, soilFertility: { ...rule, gardens: [rule.gardens[0]!, rule.gardens[0]!] } }).error?.message).toMatch(/duplicate/);
    expect(tryExport(realXlsx, { ...overrides, soilFertility: { ...rule, gardens: [{ ...rule.gardens[0]!, initial: 9 }] } }).error?.message).toMatch(/above the maximum/);
    expect(tryExport(realXlsx, { ...overrides, soilFertility: { ...rule, cover: { ...rule.cover, systemId: 'S999' } } }).error?.message).toMatch(/unknown cover crop/);
  });
});
