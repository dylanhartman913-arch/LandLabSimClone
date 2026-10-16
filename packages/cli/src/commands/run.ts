import { writeFileSync } from 'node:fs';
import { catalog, getSite, NEED_KEYS, type NeedKey } from '@homestead/catalog';
import {
  flowRecord,
  gameFromDesign,
  ledgersCsv,
  MONTH_NAMES,
  monthOfDay,
  stepDays,
  summarizeLedgers,
  type DayLedger,
  type Design,
  type DesignFile,
  type WeatherMode,
} from '@homestead/engine';
import { pct, table } from '../table.ts';

const SHORT: Record<NeedKey, string> = {
  Water: 'Water',
  'Drinking water': 'Drink',
  Food: 'Food',
  Shelter: 'Shelter',
  Sanitation: 'Sanit.',
  Electricity: 'Power',
  Transportation: 'Travel',
  'Cooking fuel': 'Cook',
  'Heated shelter': 'Heat',
  'Cooled shelter': 'Cool',
  'Est. Required Labor': 'Labor',
};

export interface RunOptions {
  site: string;
  years: number;
  seed: number;
  weatherMode?: WeatherMode;
  /** Write one flow record per year here (JSON array). */
  flowRecordPath?: string;
  /** Write the daily ledgers here (CSV). */
  csvPath?: string;
}

/** Run a design (prebuilt) for N years and print monthly coverage and the biggest shortages. */
export function runTime(file: DesignFile, _design: Design, opts: RunOptions): string {
  const name = file.name;
  const site = getSite(opts.site);
  const start = gameFromDesign(catalog, file, {
    siteId: site.id,
    seed: opts.seed,
    weatherMode: opts.weatherMode ?? 'average',
  });
  const records = [];
  let state = start;
  const ledgers: DayLedger[] = [];
  for (let y = 0; y < opts.years; y++) {
    const r = stepDays(state, catalog, 365);
    state = r.state;
    ledgers.push(...r.ledgers);
    records.push(flowRecord(catalog, state, r.ledgers));
  }
  if (opts.flowRecordPath) writeFileSync(opts.flowRecordPath, `${JSON.stringify(records, null, 2)}\n`);
  if (opts.csvPath) writeFileSync(opts.csvPath, ledgersCsv(catalog, ledgers));
  const lines = [
    `${name} on ${site.name}, ${opts.years} year${opts.years === 1 ? '' : 's'} (seed ${opts.seed})`,
    '',
  ];

  // Monthly coverage table: delivered ÷ needed per checklist row.
  const rows: (string | number)[][] = [];
  let bucket: DayLedger[] = [];
  const flush = () => {
    if (!bucket.length) return;
    const s = summarizeLedgers(bucket, catalog);
    const first = bucket[0]!;
    rows.push([
      `Y${first.year + 1} ${MONTH_NAMES[monthOfDay(first.day)]}`,
      ...NEED_KEYS.map((k) => {
        const r = s.checklist.find((x) => x.need === k)!;
        return r.needed > 0 ? `${Math.round(r.pct * 100)}%` : '—';
      }),
      `${Math.round(s.overallScore * 100)}%`,
      s.averageHealth.toFixed(2),
    ]);
    bucket = [];
  };
  for (const l of ledgers) {
    if (bucket.length && monthOfDay(l.day) !== monthOfDay(bucket[0]!.day)) flush();
    bucket.push(l);
  }
  flush();
  lines.push(table(['Month', ...NEED_KEYS.map((k) => SHORT[k]), 'Score', 'Health'], rows));

  const last = summarizeLedgers(ledgers.slice(-365), catalog);
  lines.push(
    '',
    `Final year: overall ${pct(last.overallScore)}, average health ${last.averageHealth.toFixed(2)}, cash $${Math.round(state.cash).toLocaleString('en-US')}`,
  );
  lines.push('Three biggest shortages (share of requests unmet, final year):');
  const culprits = new Map<string, Map<string, number>>();
  for (const l of ledgers.slice(-365)) {
    for (const c of l.curtailed) {
      if (!c.limitedBy) continue;
      const m = culprits.get(c.limitedBy) ?? new Map<string, number>();
      m.set(c.systemId, (m.get(c.systemId) ?? 0) + 1);
      culprits.set(c.limitedBy, m);
    }
  }
  for (const s of last.topShortages.slice(0, 3)) {
    const who = [...(culprits.get(s.resource) ?? new Map()).entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([id]) => catalog.systems.find((x) => x.id === id)!.name);
    lines.push(
      `  ${s.resource}: ${pct(s.unmetShare)} unmet${who.length ? `; curtails ${who.join(', ')}` : ''}`,
    );
  }
  return lines.join('\n');
}
