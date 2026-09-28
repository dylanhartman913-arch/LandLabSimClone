import { describe, expect, it } from 'vitest';
import { mutatedXlsx, tryExport, withNewSystem } from './helpers.ts';

describe('adding a system in the spreadsheet', () => {
  it('re-exports with the new system and its flows, and no code names it', () => {
    const { result, error } = tryExport(mutatedXlsx(withNewSystem));
    expect(error).toBeUndefined();
    const sys = result!.catalog.systems.find((s) => s.name === 'Solar Food Dehydrator')!;
    expect(sys).toBeDefined();
    expect(sys.id).toBe('S169');
    expect(sys.categories).toEqual(['Food System', 'Solar']);
    expect(sys.costBuy).toBe(250);
    const flows = result!.catalog.flows.filter((f) => f.systemId === 'S169');
    expect(flows.map((f) => `${f.direction}:${f.resource}`)).toEqual([
      'in:Labor',
      'in:Vegetables fruit fiber herbs',
      'out:Vegetables fruit fiber herbs',
    ]);
    // Engine-only fields come from the default rules, as for every other system.
    expect(sys.provenance.layer).toBe('default-rule');
    expect(result!.catalog.systems).toHaveLength(169);
  });
});
