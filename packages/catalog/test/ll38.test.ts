import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { RiskRuleSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-38 risk rules', () => {
  it('rejects missing warnings, invalid probabilities, impossible factors and unknown mitigation systems', () => {
    const r = catalog.riskEvents!;
    for (const patch of [
      { intervalDays: 0 },
      { smokePenalty: -1 },
      { protectedHarvestFactor: 0.1 },
      { wellFactor: 2 },
      { events: { ...r.events, outage: { ...r.events.outage, warningDays: 0 } } },
      { events: { ...r.events, blizzard: { ...r.events.blizzard, chance: 2 } } },
    ])
      expect(RiskRuleSchema.safeParse({ ...r, ...patch }).success).toBe(false);
    const bad = { ...(realOverrides as Overrides), riskEvents: { ...r, refugeIds: ['S999'] } };
    expect(tryExport(realXlsx, bad).error?.message).toMatch(/Risk rule: unknown system S999/);
  });

  it('keeps all seven warned hazards and explicit mitigation/source references in the exported catalog', () => {
    const r = catalog.riskEvents!;
    expect(Object.keys(r.events).sort()).toEqual([
      'blizzard',
      'breakdown',
      'disease',
      'drawdown',
      'outage',
      'pests',
      'smoke',
    ]);
    expect(RiskRuleSchema.safeParse(r).success).toBe(true);
    expect(r.wellIds).toContain(catalog.systems.find((s) => s.name === 'Hand Pump Well')!.id);
    expect(r.deliveryIds).not.toContain(r.gridIds[0]);
  });
});
