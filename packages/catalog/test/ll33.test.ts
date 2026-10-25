import { describe, expect, it } from 'vitest';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';
import type { Overrides } from '../src/schema.ts';

const overrides = realOverrides as Overrides;

describe('LL-33 storage and winter configuration', () => {
  it('rejects a freezing rule for a system that stores no water', () => {
    const rule = overrides.winterStorage!;
    const bad = { ...overrides, winterStorage: { ...rule, tanks: [...rule.tanks, { systemId: 'S001', freezeDegreeDays: 5 }] } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/provides no Water storage/);
  });

  it('rejects feed storage for a resource that already has a pool', () => {
    const rule = overrides.winterStorage!;
    const bad = { ...overrides, winterStorage: { ...rule, feed: { ...rule.feed, members: [{ resource: 'Water', lbsPerCuFt: 8 }] } } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/no existing pool/);
  });

  it('rejects duplicate tank rules instead of silently picking one', () => {
    const rule = overrides.winterStorage!;
    const bad = { ...overrides, winterStorage: { ...rule, tanks: [rule.tanks[0]!, rule.tanks[0]!] } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/duplicate tank/);
  });
});
