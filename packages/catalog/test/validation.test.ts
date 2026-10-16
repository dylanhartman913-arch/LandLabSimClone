import { describe, expect, it } from 'vitest';
import { CatalogExportError } from '../src/exporter/index.ts';
import { flowRow, mutatedXlsx, realOverrides, realXlsx, setCell, tryExport } from './helpers.ts';

function expectFailure(xlsx: Uint8Array, pattern: RegExp, overrides?: unknown) {
  const { error } = tryExport(xlsx, overrides);
  expect(error).toBeInstanceOf(CatalogExportError);
  expect(error?.message).toMatch(pattern);
}

describe('a broken spreadsheet fails the export with a readable message', () => {
  it('rejects a flow with an unknown resource', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Flows', `D${flowRow(wb, 'F0002')}`, 'Unobtainium'));
    expectFailure(xlsx, /Flows row \d+ \(F0002\): unknown resource "Unobtainium"/);
  });

  it('rejects a formula that matches no template, naming the flow and the formula', () => {
    const xlsx = mutatedXlsx((wb) =>
      setCell(wb, 'Flows', `E${flowRow(wb, 'F0007')}`, 99, '0.5*Assumptions!$C$6*9*Assumptions!$C$7'),
    );
    expectFailure(xlsx, /F0007\): formula "=0\.5\*Assumptions!\$C\$6\*9\*Assumptions!\$C\$7" does not match/);
  });

  it('rejects a template formula that points at the wrong assumption', () => {
    const xlsx = mutatedXlsx((wb) =>
      setCell(wb, 'Flows', `E${flowRow(wb, 'F0006')}`, 35, 'Assumptions!$C$8*7'),
    );
    expectFailure(xlsx, /F0006\): formula .* matches the sun template but references precipIn/);
  });

  it('rejects a capacity resource used with a weekly period', () => {
    const xlsx = mutatedXlsx((wb) => {
      const ws = wb.Sheets['Flows']!;
      for (let r = 2; r < 900; r++) {
        if (ws[`D${r}`]?.v === 'Shelter' && ws[`G${r}`]?.v === 'Capacity') {
          setCell(wb, 'Flows', `G${r}`, 'Weekly');
          return;
        }
      }
    });
    expectFailure(xlsx, /Capacity resource "Shelter" must use period Capacity, not Weekly/);
  });

  it('rejects a flow resource used as a capacity', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Flows', `G${flowRow(wb, 'F0002')}`, 'Capacity'));
    expectFailure(xlsx, /F0002\): Flow resource "Electricity" cannot use period Capacity/);
  });

  it('rejects duplicate system names', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Systems', 'B3', '2kwh Lead Acid Battery'));
    expectFailure(xlsx, /duplicate system name/);
  });

  it('rejects a category that is not on the Categories sheet', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Systems', 'C2', 'Energy; Wizardry'));
    expectFailure(
      xlsx,
      /S001 "2kwh Lead Acid Battery"\): category "Wizardry" is not in the Categories sheet/,
    );
  });

  it('rejects negative quantities', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Flows', `E${flowRow(wb, 'F0002')}`, -3));
    expectFailure(xlsx, /F0002\): negative quantity -3/);
  });

  it('rejects weekly upkeep that is missing from the Labor inputs', () => {
    const xlsx = mutatedXlsx((wb) => setCell(wb, 'Systems', 'K2', 5));
    expectFailure(
      xlsx,
      /S001 "2kwh Lead Acid Battery": weekly upkeep is 5 h .* Labor inputs total 0\.1 h\/week/,
    );
  });

  it('collects several problems into one report', () => {
    const xlsx = mutatedXlsx((wb) => {
      setCell(wb, 'Flows', `D${flowRow(wb, 'F0002')}`, 'Unobtainium');
      setCell(wb, 'Systems', 'C2', 'Energy; Wizardry');
    });
    const { error } = tryExport(xlsx);
    expect((error as CatalogExportError).problems.length).toBeGreaterThanOrEqual(2);
  });
});

describe('overrides', () => {
  it('rejects an override for a system that does not exist', () => {
    expectFailure(realXlsx, /systems\.S999 is not a system ID/, {
      version: 1,
      systems: { S999: {} },
      resources: {},
    });
  });

  it('refuses to override catalog numbers from the spreadsheet', () => {
    expectFailure(realXlsx, /Unrecognized key/, {
      version: 1,
      systems: { S001: { costBuy: 1 } },
      resources: {},
    });
  });

  it('applies an override and marks its provenance', () => {
    const { result } = tryExport(realXlsx, {
      version: 1,
      systems: { S078: { yearsToFullOutput: 1 } },
      resources: { Eggs: { spoilPerWeek: 0.05 } },
      flows: { F0390: { inputRole: 'required' } },
    });
    const beds = result!.catalog.systems.find((s) => s.id === 'S078')!;
    expect(beds.yearsToFullOutput).toBe(1);
    expect(beds.provenance.yearsToFullOutput).toBe('override');
    expect(result!.catalog.resources.find((r) => r.name === 'Eggs')!.spoilPerWeek).toBe(0.05);
    const f = result!.catalog.flows.find((x) => x.id === 'F0390')!;
    expect(f.inputRole).toBe('required');
    expect(f.provenance.inputRole).toBe('override');
  });

  it('accepts the committed overrides file', () => {
    expect(tryExport(realXlsx, realOverrides).error).toBeUndefined();
  });
});
