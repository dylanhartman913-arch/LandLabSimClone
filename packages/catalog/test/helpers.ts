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

/**
 * The modding contract (G10 handoff): add a system to the spreadsheet, re-export,
 * and it is in the catalog with its flows; nothing in code names it. This does what
 * docs/MODDING.md tells a modder to do, with the cells Excel would have recalculated
 * filled in by hand (SheetJS does not recalculate).
 */
export function withNewSystem(wb: XLSX.WorkBook): void {
  const sys = wb.Sheets['Systems']!;
  const r = XLSX.utils.decode_range(sys['!ref']!).e.r + 2; // next 1-based row
  const name = 'Solar Food Dehydrator';
  const row: Record<string, XLSX.CellObject> = {
    A: { t: 's', v: 'S169' },
    B: { t: 's', v: name },
    C: { t: 's', v: 'Food System; Solar' },
    D: { t: 's', v: '' },
    E: { t: 's', v: 'New (modding test)' },
    F: { t: 's', v: 'A screened solar box that dries a summer glut of vegetables for winter.' },
    G: { t: 'n', v: 250 },
    H: { t: 'n', v: 60 },
    I: { t: 'n', v: 60, f: `IF(H${r}="",G${r},MIN(G${r},H${r}))` },
    J: { t: 'n', v: 6 },
    K: { t: 'n', v: 0.5 },
    L: { t: 'n', v: 12 },
    M: { t: 'n', v: 8 },
    R: { t: 'n', v: 0 },
    S: { t: 'n', v: 2 },
    T: { t: 'n', v: 1 },
    W: { t: 's', v: 'low' },
  };
  for (const [c, cell] of Object.entries(row)) sys[`${c}${r}`] = cell;
  sys['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r - 1, c: 23 } });

  const flows = wb.Sheets['Flows']!;
  let fr = XLSX.utils.decode_range(flows['!ref']!).e.r + 2;
  const addFlow = (id: string, dir: 'Input' | 'Output', resource: string, qty: number, unit: string) => {
    const at = (c: string, cell: XLSX.CellObject) => (flows[`${c}${fr}`] = cell);
    at('A', { t: 's', v: id });
    at('B', { t: 's', v: name });
    at('C', { t: 's', v: dir });
    at('D', { t: 's', v: resource });
    at('E', { t: 'n', v: qty });
    at('F', { t: 's', v: unit });
    at('G', { t: 's', v: 'Weekly' });
    at('H', { t: 'n', v: qty });
    at('I', { t: 'n', v: 0 });
    at('J', { t: 'n', v: 0 });
    at('N', { t: 's', v: '' });
    fr++;
  };
  addFlow('F0798', 'Input', 'Labor', 0.5, 'hours');
  addFlow('F0799', 'Input', 'Vegetables fruit fiber herbs', 3, 'lbs');
  addFlow('F0800', 'Output', 'Vegetables fruit fiber herbs', 2.4, 'lbs');
  flows['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: fr - 2, c: 13 } });
}
