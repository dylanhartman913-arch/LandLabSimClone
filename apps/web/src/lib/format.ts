/** Display formatting only (no model arithmetic): numbers, money, percents, units. */

export function fmtNum(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(abs >= 1e7 ? 0 : 1)}M`;
  if (abs >= 10_000) return `${(n / 1000).toFixed(abs >= 1e5 ? 0 : 1)}k`;
  if (abs >= 100) return Math.round(n).toLocaleString('en-US');
  if (abs >= 10) return n.toFixed(Math.min(digits, 1));
  if (abs === 0) return '0';
  if (abs < 0.01) return n.toExponential(1);
  return n.toFixed(Math.max(digits, 2)).replace(/\.?0+$/, '');
}

export function fmtMoney(n: number): string {
  const sign = n < 0 ? '−' : '';
  return `${sign}$${Math.round(Math.abs(n)).toLocaleString('en-US')}`;
}

export function fmtPct(share: number): string {
  if (!Number.isFinite(share)) return '—';
  return `${Math.round(share * 100)}%`;
}

export type UnitSystem = 'imperial' | 'metric';

const METRIC: Record<string, { unit: string; factor: number }> = {
  gal: { unit: 'L', factor: 3.78541 },
  lbs: { unit: 'kg', factor: 0.453592 },
  'sq ft': { unit: 'm²', factor: 0.092903 },
  'cu ft': { unit: 'm³', factor: 0.0283168 },
  miles: { unit: 'km', factor: 1.60934 },
  BTU: { unit: 'kWh', factor: 0.000293071 },
  inches: { unit: 'mm', factor: 25.4 },
  ft: { unit: 'm', factor: 0.3048 },
};

/** Convert a canonical-unit amount for display. The engine never converts. */
export function displayUnit(
  value: number,
  unit: string,
  system: UnitSystem,
): { value: number; unit: string } {
  if (system === 'metric' && METRIC[unit])
    return { value: value * METRIC[unit].factor, unit: METRIC[unit].unit };
  return { value, unit };
}

export function fmtQty(value: number, unit: string, system: UnitSystem = 'imperial'): string {
  const d = displayUnit(value, unit, system);
  return `${fmtNum(d.value)} ${d.unit}`;
}
