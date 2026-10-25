import { describe, expect, it } from 'vitest';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';
import type { Overrides } from '../src/schema.ts';

const overrides = realOverrides as Overrides;
const rule = overrides.householdRoles!;

describe('LL-36 household rules', () => {
  it('keeps adults equal to the catalog Human Being', () => {
    const bad = { ...overrides, householdRoles: { ...rule, roles: { ...rule.roles, adult: { needs: 1, labor: 0.8 } } } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/adults must keep the catalog Human Being/);
  });

  it('rejects unknown growing systems and dangerous tools', () => {
    expect(tryExport(realXlsx, { ...overrides, householdRoles: { ...rule, growingSystemIds: ['S999'] } }).error?.message).toMatch(/unknown system S999/);
    expect(tryExport(realXlsx, { ...overrides, householdRoles: { ...rule, injury: { ...rule.injury, toolPerHour: { S998: 0.1 } } } }).error?.message).toMatch(/unknown system S998/);
  });
});
