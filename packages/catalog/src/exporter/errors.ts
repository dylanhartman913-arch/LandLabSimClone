/** A catalog export problem. Messages name the sheet, row, and offending value. */
export class CatalogExportError extends Error {
  readonly problems: string[];
  constructor(problems: string[]) {
    super(`Catalog export failed with ${problems.length} problem(s):\n  - ${problems.join('\n  - ')}`);
    this.name = 'CatalogExportError';
    this.problems = problems;
  }
}
