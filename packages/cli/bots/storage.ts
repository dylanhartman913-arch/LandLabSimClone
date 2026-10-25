import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import {
  HEAT_HDD_MIN,
  SURVIVAL,
  applyAction,
  initGame,
  placeDesign,
  setWinterProtection,
  stepDays,
  type GameState,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;

/** First-year routes with the same policy, legacy pools vs LL-33 pools. */
function firstYear(): string[] {
  const out = [
    '## First-year routes', '',
    'Two adults, greenfield remote-job tutorial policy, 365 days from the game start. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site. Quest progress can change later action dates.', '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Drinking water spilled (gal) | Raw water spilled (gal) | Tank-days frozen | Most locked (gal) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of COMPARE_SITES) for (const difficulty of ['standard', 'real'] as const) for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
    for (const variant of ['legacy', 'pools'] as const) {
      const bot = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!.bot(null);
      const run = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings: { ...NEW_GAME_SETTINGS, storagePools: variant === 'pools' } });
      const m = measure(run, catalog);
      const short = run.ledgers.filter((l) => l.wellbeing !== null && ([
        ['drinkingWater', 'Drinking water'], ['food', 'Food'], ['shelter', 'Shelter'], ['heat', 'Heated shelter'], ['sanitation', 'Sanitation'],
      ] as const).some(([key, row]) => {
        if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
        const n = l.needs[row];
        return (n.needed > 1e-9 ? n.delivered / n.needed : 1) < SURVIVAL[key].short - 1e-9;
      })).length;
      const frozenDays = sum(run.ledgers, (l) => (l.winter ?? []).filter((w) => w.frozen !== null).length);
      const locked = Math.max(0, ...run.ledgers.flatMap((l) => (l.winter ?? []).map((w) => w.frozen ?? 0)));
      out.push(`| ${site} | ${difficulty}/${seed} | ${variant} | ${short} | ${m.minWellbeing?.toFixed(1)} | ${run.state.cash.toFixed(0)} | ${sum(run.ledgers, (l) => l.resources['Drinking water']?.spilled ?? 0).toFixed(1)} | ${sum(run.ledgers, (l) => l.resources.Water?.spilled ?? 0).toFixed(1)} | ${frozenDays} | ${locked.toFixed(1)} |`);
    }
  }
  return out;
}

/** One adult, a tent, and one outdoor tank from January 1: bare, insulated, or heated. */
function winterChecks(): string[] {
  const out = [
    '', '## Winter tank checks', '',
    'One adult, a Bell Tent and an outdoor tank holding 80 gal of raw water to start, January 1 to April 30 (120 days), Standard weather. The heated variant adds a 1.5 kW wind turbine and a 10 kWh battery bank; the heater only draws electricity left after household use. Protection is bought on day 0 and installed with the household’s spare labor.', '',
    '| Site | Tank | Protection | First freeze (day) | Days frozen | Most locked (gal) | Heater kWh | Heater kWh needed | Install hours |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of ['laramie-wy', 'front-range', 'asheville-nc']) for (const tank of ['Rain Barrel (55 gal)', 'IBC Tank (food grade)']) {
    for (const protection of [null, 'insulated', 'heated'] as const) {
      const counts: Record<string, number> = { [id('Human Being')]: 1, [id('Bell Tent')]: 1, [id(tank)]: 1 };
      if (protection === 'heated') Object.assign(counts, { [id('Small Wind Turbine (1.5 kW)')]: 1, [id('LiFePO4 Battery Bank (10 kWh)')]: 1 });
      let s: GameState = placeDesign(catalog, initGame(catalog, getSite(site), {
        ...NEW_GAME_SETTINGS, storagePools: true, startDay: 0,
        startingStocks: { Food: 1e7, 'Woody biomass': 1e5, Water: 80, 'Drinking water': 40 },
      }, 1), counts, 'prebuilt');
      const t = s.instances.find((i) => i.systemId === id(tank))!;
      if (protection) s = setWinterProtection(catalog, s, t.id, protection);
      const r = stepDays(s, catalog, 120);
      const rows = r.ledgers.map((l) => l.winter?.find((w) => w.instanceId === t.id));
      const first = rows.findIndex((w) => w && w.frozen !== null);
      const final = r.state.instances.find((i) => i.id === t.id)!;
      out.push(`| ${site} | ${tank} | ${protection ?? 'none'} | ${first < 0 ? '—' : first} | ${rows.filter((w) => w && w.frozen !== null).length} | ${Math.max(0, ...rows.map((w) => w?.frozen ?? 0)).toFixed(1)} | ${sum(rows, (w) => w?.heaterKWh ?? 0).toFixed(1)} | ${sum(rows, (w) => w?.heaterNeedKWh ?? 0).toFixed(1)} | ${(final.winter?.setupHours ?? 0).toFixed(1)} |`);
    }
  }
  return out;
}

/** A 500 lb hay order with household bins only vs a toolshed. */
function feedChecks(): string[] {
  const out = [
    '', '## Feed storage checks', '',
    'An order for 500 lb of hay and 100 lb of chicken feed on day 0, Front Range, no animals. Legacy pools store everything; LL-33 stores what fits in free Storage space plus 10 cu ft of household bins.', '',
    '| Variant | Hay delivered (lb) | Chicken feed delivered (lb) | Spent ($) |',
    '|---|---:|---:|---:|',
  ];
  for (const variant of ['legacy', 'bins', 'shed'] as const) {
    let s = initGame(catalog, getSite('front-range'), { ...NEW_GAME_SETTINGS, storagePools: variant !== 'legacy', startingCash: 5000 }, 1);
    if (variant === 'shed') s = placeDesign(catalog, s, { [id('Toolshed Workshop')]: 1 }, 'prebuilt');
    s = applyAction(catalog, s, { at: 0, kind: 'buy', resource: 'Hay', amount: 500 });
    s = applyAction(catalog, s, { at: 0, kind: 'buy', resource: 'Chicken feed', amount: 100 });
    const r = stepDays(s, catalog, 1);
    const l = r.ledgers[0]!;
    out.push(`| ${variant} | ${(l.resources.Hay?.purchased ?? 0).toFixed(1)} | ${(l.resources['Chicken feed']?.purchased ?? 0).toFixed(1)} | ${sum(Object.values(l.spend?.market ?? {}), (x) => x).toFixed(2)} |`);
  }
  return out;
}

export function storageComparisons(): string {
  return [
    '# LL-33 storage pools and winter water comparisons', '',
    'Reproduce with `node --import tsx packages/cli/bots/storage.ts`. LL-33 remains an opt-in experimental setting; nothing here changes defaults. Quantities are game balance assumptions (see `docs/LL_33.md`), not household engineering forecasts.', '',
    ...firstYear(), ...winterChecks(), ...feedChecks(),
  ].join('\n') + '\n';
}
writeFileSync('docs/LL_33_COMPARISONS.md', storageComparisons());
