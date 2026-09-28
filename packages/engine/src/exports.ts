import { NEED_KEYS, type Catalog } from '@homestead/catalog';
import { getSystem, indexCatalog } from './catalog-index.ts';
import { MONTH_NAMES, monthOfDay } from './time/calendar.ts';
import { parcelSideFt } from './time/game.ts';
import type { DayLedger, GameState } from './time/types.ts';

export const FLOW_RECORD_SCHEMA = 'homestead.flow_record.v1';

/** Fuels tracked in the flow record (consumed per year, in each resource's own unit). */
const FUELS = ['Propane', 'Gasoline', 'Woody biomass', 'Wood pellets', 'Wood chips'] as const;

export interface FlowRecordMonth {
  month: string;
  /** Electricity bought from the grid (kWh). */
  importKwh: number;
  /** Made on site (kWh). */
  onSiteKwh: number;
  /** Surplus that had nowhere to go (kWh). No net metering is modeled, so this is spilled, not sold. */
  exportKwh: number;
  /** Largest single-day electricity demand this month (kWh/day). */
  peakDayKwh: number;
  unmetKwh: number;
}

/** One year of a homestead's physical flows, for comparison with other tools (`homestead.flow_record.v1`). */
export interface FlowRecord {
  schema: typeof FLOW_RECORD_SCHEMA;
  site: string;
  weatherMode: string;
  /** 1-based game year. */
  year: number;
  days: number;
  land: { parcelSqft: number; usedSqft: number; byUse: Record<string, number> };
  electricity: { monthly: FlowRecordMonth[]; importKwh: number; onSiteKwh: number; exportKwh: number };
  water: {
    /** All Water made or bought (well, rain, city), gal. */
    withdrawalGal: number;
    /** Water used and not returned as greywater, gal. */
    consumptiveGal: number;
    boughtGal: number;
  };
  food: { producedKcal: number; importedKcal: number; eatenKcal: number; neededKcal: number };
  /** Fuel consumed, in each fuel's unit. */
  fuel: Record<string, { amount: number; unit: string }>;
  capex: { purchases: number; refunds: number };
  cash: { in: number; out: number };
  labor: { availableHours: number; upkeepHours: number; constructionHours: number };
  /** Months in which anyone entered hardship. */
  hardshipMonths: string[];
}

const res = (l: DayLedger, r: string) => l.resources[r];

/** Build a flow record from one year's ledgers (up to 365 days) and the layout at its end. */
export function flowRecord(catalog: Catalog, state: GameState, ledgers: readonly DayLedger[]): FlowRecord {
  const idx = indexCatalog(catalog);
  const byUse: Record<string, number> = {};
  let usedSqft = 0;
  for (const inst of state.instances) {
    if (inst.status !== 'active') continue;
    const sys = getSystem(catalog, inst.systemId);
    if (sys.footprintSqft <= 0) continue;
    const use = sys.categories[0] ?? 'Other';
    byUse[use] = (byUse[use] ?? 0) + sys.footprintSqft;
    usedSqft += sys.footprintSqft;
  }
  const side = parcelSideFt(state.settings);

  const monthly: FlowRecordMonth[] = MONTH_NAMES.map((month) => ({
    month,
    importKwh: 0,
    onSiteKwh: 0,
    exportKwh: 0,
    peakDayKwh: 0,
    unmetKwh: 0,
  }));
  const water = { withdrawalGal: 0, consumptiveGal: 0, boughtGal: 0 };
  const food = { producedKcal: 0, importedKcal: 0, eatenKcal: 0, neededKcal: 0 };
  const fuel: FlowRecord['fuel'] = {};
  for (const f of FUELS) fuel[f] = { amount: 0, unit: idx.resourceByName.get(f)?.unit ?? '' };
  const capex = { purchases: 0, refunds: 0 };
  const cash = { in: 0, out: 0 };
  const labor = { availableHours: 0, upkeepHours: 0, constructionHours: 0 };
  const hardship = new Set<number>();
  const foodFamily = catalog.resources.filter((r) => r.needsRow === 'Food');

  for (const l of ledgers) {
    const m = monthly[monthOfDay(l.day)]!;
    const e = res(l, 'Electricity');
    if (e) {
      const bought = l.bought.Electricity ?? 0;
      m.importKwh += bought;
      m.onSiteKwh += e.produced - bought;
      m.exportKwh += e.spilled;
      m.unmetKwh += e.unmet;
      m.peakDayKwh = Math.max(m.peakDayKwh, e.requested);
    }
    const w = res(l, 'Water');
    if (w) {
      water.withdrawalGal += w.produced;
      water.consumptiveGal += w.consumed;
    }
    water.consumptiveGal -= res(l, 'Greywater')?.produced ?? 0;
    water.boughtGal += l.bought.Water ?? 0;
    for (const r of foodFamily) {
      const x = res(l, r.name);
      if (!x) continue;
      const kcal = (x.produced - (l.bought[r.name] ?? 0)) * (r.factorToNeed ?? 1);
      food.producedKcal += kcal;
      food.importedKcal += (l.bought[r.name] ?? 0) * (r.factorToNeed ?? 1);
    }
    food.eatenKcal += l.needs.Food.delivered;
    food.neededKcal += l.needs.Food.needed;
    for (const f of FUELS) fuel[f]!.amount += res(l, f)?.consumed ?? 0;
    capex.purchases += l.cash.purchases;
    capex.refunds += l.cash.refunds;
    cash.in += l.cash.in;
    cash.out += l.cash.out;
    labor.availableHours += l.labor.pool;
    labor.upkeepHours += l.labor.upkeepDelivered;
    labor.constructionHours += l.labor.construction;
    if (l.hardships > 0) hardship.add(monthOfDay(l.day));
  }
  water.consumptiveGal = Math.max(0, water.consumptiveGal);
  const sum = (k: keyof FlowRecordMonth) => monthly.reduce((a, m) => a + (m[k] as number), 0);
  return {
    schema: FLOW_RECORD_SCHEMA,
    site: state.site.id,
    weatherMode: state.settings.weatherMode,
    year: (ledgers[0]?.year ?? state.calendar.year) + 1,
    days: ledgers.length,
    land: { parcelSqft: side * side, usedSqft, byUse },
    electricity: {
      monthly,
      importKwh: sum('importKwh'),
      onSiteKwh: sum('onSiteKwh'),
      exportKwh: sum('exportKwh'),
    },
    water,
    food,
    fuel,
    capex,
    cash,
    labor,
    hardshipMonths: [...hardship].sort((a, b) => a - b).map((m) => MONTH_NAMES[m]!),
  };
}

/** Flow records for every whole or partial game year still in the state's ledgers. */
export function flowRecords(catalog: Catalog, state: GameState): FlowRecord[] {
  const years = [...new Set(state.ledgers.map((l) => l.year))];
  return years.map((y) =>
    flowRecord(
      catalog,
      state,
      state.ledgers.filter((l) => l.year === y),
    ),
  );
}

const csvCell = (v: string | number) => {
  if (typeof v === 'number') return Number.isFinite(v) ? String(Number(v.toPrecision(10))) : '';
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

/**
 * Daily ledgers as CSV: one row per day with the checklist rows (needed, delivered),
 * cash, labor, health, weather, and produced / consumed / unmet for every flow resource
 * that moved at all.
 */
export function ledgersCsv(catalog: Catalog, ledgers: readonly DayLedger[]): string {
  const moved = catalog.resources
    .filter((r) => r.class === 'Flow')
    .map((r) => r.name)
    .filter((r) =>
      ledgers.some((l) => {
        const x = l.resources[r];
        return !!x && (x.produced > 0 || x.consumed > 0 || x.unmet > 0 || x.start > 0);
      }),
    );
  const header = [
    'abs_day',
    'year',
    'day_of_year',
    'month',
    'health',
    'hardships',
    'cash_end',
    'cash_in',
    'cash_out',
    'purchases',
    'labor_pool_h',
    'labor_upkeep_h',
    'labor_construction_h',
    'hdd',
    'cdd',
    'sun_hours',
    'precip_in',
    'weather',
    ...NEED_KEYS.flatMap((k) => [`${k} needed`, `${k} delivered`]),
    ...moved.flatMap((r) => [`${r} stock`, `${r} produced`, `${r} consumed`, `${r} unmet`]),
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const l of ledgers) {
    const row: (string | number)[] = [
      l.absDay,
      l.year + 1,
      l.day + 1,
      MONTH_NAMES[monthOfDay(l.day)]!,
      l.health,
      l.hardships,
      l.cash.end,
      l.cash.in,
      l.cash.out,
      l.cash.purchases,
      l.labor.pool,
      l.labor.upkeepDelivered,
      l.labor.construction,
      l.weather.hdd,
      l.weather.cdd,
      l.weather.psh,
      l.weather.precipIn,
      l.weather.tags.join('; '),
      ...NEED_KEYS.flatMap((k) => [l.needs[k].needed, l.needs[k].delivered]),
      ...moved.flatMap((r) => {
        const x = l.resources[r];
        return x ? [x.start, x.produced, x.consumed, x.unmet] : [0, 0, 0, 0];
      }),
    ];
    lines.push(row.map(csvCell).join(','));
  }
  return `${lines.join('\n')}\n`;
}
