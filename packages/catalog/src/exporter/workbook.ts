import * as XLSX from 'xlsx';
import { CatalogExportError } from './errors.ts';

export interface Cell {
  /** Cached value as last computed by the spreadsheet. */
  v: string | number | boolean | null;
  /** Formula text without the leading `=`, if the cell is a formula. */
  f?: string;
  /** A1 address, for error messages. */
  addr: string;
}

export interface TableRow {
  /** 1-based spreadsheet row number. */
  rowNumber: number;
  cells: Record<string, Cell>;
}

export interface Table {
  sheet: string;
  headers: string[];
  /** Header name → column letter. */
  columns: Record<string, string>;
  rows: TableRow[];
}

export function readWorkbook(data: Uint8Array): XLSX.WorkBook {
  return XLSX.read(data, { type: 'array', cellFormula: true, cellNF: false, cellStyles: false });
}

export function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet {
  const sheet = wb.Sheets[name];
  if (!sheet) throw new CatalogExportError([`Missing sheet "${name}" (found: ${wb.SheetNames.join(', ')})`]);
  return sheet;
}

export function cellAt(sheet: XLSX.WorkSheet, addr: string): Cell {
  const c = sheet[addr] as XLSX.CellObject | undefined;
  if (!c || c.t === 'z') return { v: null, addr };
  const v = c.v === undefined ? null : (c.v as string | number | boolean);
  return c.f ? { v, f: c.f, addr } : { v, addr };
}

/**
 * Read a sheet whose first row (or `headerRow`) is a header. Rows whose first
 * column is empty end the table.
 */
export function readTable(wb: XLSX.WorkBook, sheetName: string, headerRow = 1, firstCol = 'A'): Table {
  const sheet = getSheet(wb, sheetName);
  const ref = sheet['!ref'];
  if (!ref) throw new CatalogExportError([`Sheet "${sheetName}" is empty`]);
  const range = XLSX.utils.decode_range(ref);
  const c0 = XLSX.utils.decode_col(firstCol);
  const headers: string[] = [];
  const columns: Record<string, string> = {};
  for (let c = c0; c <= range.e.c; c++) {
    const col = XLSX.utils.encode_col(c);
    const h = cellAt(sheet, `${col}${headerRow}`).v;
    if (h === null || h === '') continue;
    const name = String(h).trim();
    headers.push(name);
    columns[name] = col;
  }
  const rows: TableRow[] = [];
  for (let r = headerRow + 1; r <= range.e.r + 1; r++) {
    const first = cellAt(sheet, `${firstCol}${r}`);
    if (first.v === null || first.v === '') break;
    const cells: Record<string, Cell> = {};
    for (const h of headers) cells[h] = cellAt(sheet, `${columns[h]}${r}`);
    rows.push({ rowNumber: r, cells });
  }
  return { sheet: sheetName, headers, columns, rows };
}

export function requireHeaders(table: Table, needed: string[]): void {
  const missing = needed.filter((h) => !(h in table.columns));
  if (missing.length) {
    throw new CatalogExportError(missing.map((h) => `Sheet "${table.sheet}" is missing column "${h}"`));
  }
}

export function str(cell: Cell | undefined): string {
  if (!cell || cell.v === null) return '';
  return String(cell.v).trim();
}

export function num(cell: Cell | undefined): number | undefined {
  if (!cell || cell.v === null || cell.v === '') return undefined;
  if (typeof cell.v === 'number') return cell.v;
  const n = Number(cell.v);
  return Number.isFinite(n) ? n : undefined;
}
