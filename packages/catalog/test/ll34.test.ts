import { describe, expect, it } from 'vitest';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';
import type { Overrides } from '../src/schema.ts';

const overrides = realOverrides as Overrides;
const saw = overrides.toolRules!.find((t) => t.systemId === 'S151')!;

describe('LL-34 tool rules', () => {
  it('rejects a tool rule for a resource the system does not make', () => {
    const bad = { ...overrides, toolRules: [{ ...saw, resource: 'Soil' }] };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/does not make Soil/);
  });

  it('rejects fuel the tool does not use in the workbook', () => {
    const bad = { ...overrides, toolRules: [{ ...saw, fuel: { resource: 'Propane', perHour: 0.1 } }] };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/does not use Propane/);
  });

  it('rejects duplicate rules and multipliers below 1', () => {
    expect(tryExport(realXlsx, { ...overrides, toolRules: [saw, saw] }).error?.message).toMatch(/duplicate/);
    expect(tryExport(realXlsx, { ...overrides, toolRules: [{ ...saw, multiplier: 0.5 }] }).error).toBeTruthy();
  });
});
