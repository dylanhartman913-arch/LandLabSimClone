import type { Assumptions, Catalog, Period } from '@homestead/catalog';

/**
 * Weekly factor for a period, from the catalog's period table:
 * times per year ÷ 52; one-time → 0; capacity → 1.
 */
export function weeklyFactor(catalog: Catalog, period: Period, assumptions: Assumptions): number {
  const row = catalog.periods.find((p) => p.period === period);
  if (!row) throw new Error(`Unknown period ${period}`);
  if (row.timesPerYear === null) return row.fixedWeeklyFactor ?? 0;
  const times = row.timesPerYear === 'seasonsPerYear' ? assumptions.seasonsPerYear : row.timesPerYear;
  return times / 52;
}

/** All weekly factors at once (hot paths look them up by period). */
export function weeklyFactors(catalog: Catalog, assumptions: Assumptions): Record<Period, number> {
  const out = {} as Record<Period, number>;
  for (const row of catalog.periods) out[row.period] = weeklyFactor(catalog, row.period, assumptions);
  return out;
}

/** Convert a per-period quantity into its weekly equivalent. */
export function weeklyEquivalent(
  qty: number,
  period: Period,
  catalog: Catalog,
  assumptions: Assumptions,
): number {
  return qty * weeklyFactor(catalog, period, assumptions);
}
