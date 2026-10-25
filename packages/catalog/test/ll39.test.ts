import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { TransportAccessRuleSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-39 access policy', () => {
  it('rejects invalid fares and trips and unknown delivery or local-market systems', () => {
    const r = catalog.transportAccess!;
    for (const patch of [
      { marketMiles: 0 },
      { deliveryFare: -1 },
      { commuteFarePerMile: 0 },
      { townFare: NaN },
      { townMilesPerPerson: -1 },
    ])
      expect(TransportAccessRuleSchema.safeParse({ ...r, ...patch }).success).toBe(false);
    expect(
      tryExport(realXlsx, {
        ...(realOverrides as Overrides),
        transportAccess: { ...r, deliveryIds: ['S999'] },
      }).error?.message,
    ).toMatch(/Transport access rule: unknown system S999/);
  });
  it('leaves workbook human and employment transport flows intact for legacy parity', () => {
    const id = catalog.systems.find((s) => s.name === 'Human Being')!.id;
    expect(
      catalog.flows.find((f) => f.systemId === id && f.direction === 'in' && f.resource === 'Transportation')!
        .qty,
    ).toEqual({ kind: 'const', value: 150 });
    expect(TransportAccessRuleSchema.safeParse(catalog.transportAccess).success).toBe(true);
  });
});
