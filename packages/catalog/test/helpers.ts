import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { DEFAULT_OVERRIDES, DEFAULT_XLSX, exportCatalog } from '../src/exporter/index.ts';

export const realXlsx = new Uint8Array(readFileSync(DEFAULT_XLSX));
export const realOverrides: unknown = JSON.parse(readFileSync(DEFAULT_OVERRIDES, 'utf8'));

/** Copy the real workbook, apply edits, and return the new bytes (a "broken fixture"). */
export function mutatedXlsx(edit: (wb: XLSX.WorkBook) => void): Uint8Array {
  const wb = XLSX.read(realXlsx, { type: 'array', cellFormula: true });
  edit(wb);
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer);
}

export function setCell(wb: XLSX.WorkBook, sheet: string, addr: string, v: string | number, f?: string) {
  const ws = wb.Sheets[sheet]!;
  ws[addr] = f ? { t: typeof v === 'number' ? 'n' : 's', v, f } : { t: typeof v === 'number' ? 'n' : 's', v };
}

/** Find the row number of a flow ID on the Flows sheet. */
export function flowRow(wb: XLSX.WorkBook, flowId: string): number {
  const ws = wb.Sheets['Flows']!;
  for (let r = 2; r < 2000; r++) if (ws[`A${r}`]?.v === flowId) return r;
  throw new Error(`no flow ${flowId}`);
}

export function tryExport(xlsx: Uint8Array, overrides: unknown = realOverrides) {
  try {
    return { result: exportCatalog({ xlsx, xlsxName: 'fixture.xlsx', overrides }), error: undefined };
  } catch (error) {
    return { result: undefined, error: error as Error };
  }
}
