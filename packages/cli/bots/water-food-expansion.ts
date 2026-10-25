import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import {
  initGame,
  nodePosition,
  placeDesign,
  setPreservation,
  stepDays,
  type GameState,
} from '@homestead/engine';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const sites = ['front-range', 'laramie-wy', 'asheville-nc'];
function camp(site: string, counts: Record<string, number>, stocks: Record<string, number>, startDay = 0) {
  return placeDesign(
    catalog,
    initGame(
      catalog,
      getSite(site),
      {
        storagePools: true,
        foodPreservation: true,
        wellbeingMult: 0,
        startDay,
        startingCash: 100000,
        startingStocks: { Food: 400000, 'Drinking water': 40, ...stocks },
      },
      1,
    ),
    Object.fromEntries(Object.entries({ 'Human Being': 1, ...counts }).map(([name, n]) => [id(name), n])),
    'prebuilt',
  );
}
const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const water = [
  '# LL-40 controlled water comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/water-food-expansion.ts`. Standard weather, seed 1. These fixtures isolate equipment; ample food/cash and zero wellbeing drift are test controls, not survival-route claims. Storage pools enabled. All rates are game abstractions; see LL_40.md.',
  '',
  '## Safe-water storage',
  '',
  'Start with 200 gal drinking water and no raw water. One day, no treatment system.',
  '',
  '| Site | Tank | Drinking water spilled (gal) | Drinking water left (gal) |',
  '|---|---|---:|---:|',
];
for (const site of sites)
  for (const tank of [false, true]) {
    const s = camp(site, tank ? { 'Potable Water Tank (100 gal)': 1 } : {}, { 'Drinking water': 200 });
    const r = stepDays(s, catalog, 1);
    water.push(
      `| ${site} | ${tank ? '100 gal potable' : 'household containers'} | ${r.ledgers[0]!.resources['Drinking water']!.spilled.toFixed(1)} | ${r.state.stocks['Drinking water']!.toFixed(1)} |`,
    );
  }
water.push(
  '',
  '## Spring connection',
  '',
  'Seven days; one box moved to a spring node, compared with no box. No auto-fetching; output is untreated water. Missing springs are left missing.',
  '',
  '| Site | Box | Piped raw water (gal) | Box upkeep (h) |',
  '|---|---|---:|---:|',
);
for (const site of sites)
  for (const box of [false, true]) {
    let s = camp(site, box ? { 'Spring Box with Gravity Line': 1 } : {}, {});
    const node = s.site.nodes.find((n) => n.type === 'spring');
    if (box && node)
      s = {
        ...s,
        instances: s.instances.map((i) =>
          i.systemId === id('Spring Box with Gravity Line') ? { ...i, ...nodePosition(s, node) } : i,
        ),
      };
    const r = stepDays(s, catalog, 7);
    water.push(
      `| ${site} | ${box ? (node ? 'connected' : 'no site spring') : 'none'} | ${sum(r.ledgers, (l) => l.resources.Water!.produced).toFixed(1)} | ${sum(r.ledgers, (l) => l.laborBySystem?.[id('Spring Box with Gravity Line')] ?? 0).toFixed(2)} |`,
    );
  }
water.push(
  '',
  '## Winter heat trace',
  '',
  'January 1–April 30, 120 days. Same 100-gal tank with/without wind turbine and battery; starts with 80 gal raw water. Heating uses spare electricity.',
  '',
  '| Site | Power | Frozen tank-days | Heater kWh |',
  '|---|---|---:|---:|',
);
for (const site of sites)
  for (const power of [false, true]) {
    const s = camp(
      site,
      {
        'Heat-Traced Water Tank (100 gal)': 1,
        ...(power ? { 'Small Wind Turbine (1.5 kW)': 1, 'LiFePO4 Battery Bank (10 kWh)': 1 } : {}),
      },
      { Water: 80 },
    );
    const r = stepDays(s, catalog, 120);
    water.push(
      `| ${site} | ${power ? 'wind + battery' : 'none'} | ${sum(r.ledgers, (l) => (l.winter ?? []).filter((w) => w.frozen !== null).length)} | ${sum(r.ledgers, (l) => sum(l.winter ?? [], (w) => w.heaterKWh)).toFixed(1)} |`,
    );
  }
water.push(
  '',
  '## First flush',
  '',
  'Seven days, one rain barrel, filter and 40 gal raw water. Diverter readiness uses previous-day measured upkeep.',
  '',
  '| Site | Diverter | Captured raw water (gal) | Filter labor (h) |',
  '|---|---|---:|---:|',
);
for (const site of sites)
  for (const diverter of [false, true]) {
    const s = camp(
      site,
      {
        'Rain Barrel (55 gal)': 1,
        'Drinking Water Filter': 1,
        ...(diverter ? { 'First-Flush Diverter': 1 } : {}),
      },
      { Water: 40 },
    );
    const r = stepDays(s, catalog, 7);
    water.push(
      `| ${site} | ${diverter ? 'working' : 'none'} | ${sum(r.ledgers, (l) => l.resources.Water!.produced).toFixed(2)} | ${sum(r.ledgers, (l) => l.laborBySystem?.[id('Drinking Water Filter')] ?? 0).toFixed(3)} |`,
    );
  }
writeFileSync('docs/LL_40_COMPARISONS.md', water.join('\n') + '\n');

const food = [
  '# LL-41 controlled processing comparisons',
  '',
  'Reproduce with `node --import tsx packages/cli/bots/water-food-expansion.ts`. Same isolated camp controls as LL-40; food preservation enabled. One-day batches on June 22, 100 canonical units of fresh input, 100 units energy supplied at dawn. Processing takes surplus after household use. Rates are experimental balance; see LL_41.md.',
  '',
  '| Processor | Input | Input kcal | Preserved kcal | Labor (h) | Energy resource | Energy used |',
  '|---|---|---:|---:|---:|---|---:|',
];
for (const [name, input, energy] of [
  ['Pressure Canner', 'Root crops', 'Cooking fuel'],
  ['Water-Bath Canner', 'Vegetables fruit fiber herbs', 'Cooking fuel'],
  ['Solar Dehydrator', 'Vegetables fruit fiber herbs', 'Sunlight'],
  ['Electric Dehydrator', 'Meat', 'Electricity'],
  ['Smokehouse', 'Fish', 'Woody biomass'],
]) {
  let s: GameState = camp('front-range', { [name!]: 1, 'Root Cellar': 1 }, { [input!]: 100 }, 172);
  if (energy !== 'Sunlight') s = { ...s, stocks: { ...s.stocks, [energy!]: 100 } };
  s = setPreservation(catalog, s, s.instances.find((i) => i.systemId === id(name!))!.id, input!, 5);
  const r = stepDays(s, catalog, 1);
  const b = r.ledgers[0]!.preserved![0]!;
  food.push(
    `| ${name} | ${input} | ${b.inputKcal.toFixed(0)} | ${b.outputKcal.toFixed(0)} | ${b.labor.toFixed(2)} | ${energy} | ${b.energy.toFixed(2)} |`,
  );
}
food.push(
  '',
  '## Grain storage',
  '',
  '30 days, 100 lb grain and a root cellar in both variants; the household eats grain before generic Food. The added bin protects 450 lb from rodents. Food capacity is not binding.',
  '',
  '| Storage | Grain spoiled (lb) | Grain left (lb) |',
  '|---|---:|---:|',
);
for (const storage of ['Root Cellar', 'Grain Bin']) {
  const r = stepDays(
    camp(
      'front-range',
      { 'Root Cellar': 1, ...(storage === 'Grain Bin' ? { 'Grain Bin': 1 } : {}) },
      { Grain: 100 },
    ),
    catalog,
    30,
  );
  food.push(
    `| ${storage} | ${sum(r.ledgers, (l) => l.resources.Grain!.spoiled).toFixed(3)} | ${r.state.stocks.Grain!.toFixed(3)} |`,
  );
}
food.push(
  '',
  '## Milk and seed conversions',
  '',
  'Seven days; 10 gal milk, 100 lb produce and a root cellar. Compare the same stock with or without both stations. Inputs used for processing are separate from meals; no newly grown calories are credited.',
  '',
  '| Stations | Milk processed (gal) | Cheese made (lb) | Produce saved for seed (lb) | Seeds made (oz) |',
  '|---|---:|---:|---:|---:|',
);
for (const stations of [false, true]) {
  const s = camp(
    'front-range',
    { 'Root Cellar': 1, ...(stations ? { 'Cheese Press': 1, 'Seed Saving Station': 1 } : {}) },
    { Milk: 10, 'Vegetables fruit fiber herbs': 100 },
  );
  const r = stepDays(s, catalog, 7);
  food.push(
    `| ${stations ? 'press + seed station' : 'none'} | ${sum(r.ledgers, (l) => l.resources.Milk!.processed ?? 0).toFixed(2)} | ${sum(r.ledgers, (l) => l.resources.Cheese?.produced ?? 0).toFixed(2)} | ${sum(r.ledgers, (l) => l.resources['Vegetables fruit fiber herbs']!.processed ?? 0).toFixed(2)} | ${sum(r.ledgers, (l) => l.resources.Seeds!.produced).toFixed(2)} |`,
  );
}
writeFileSync('docs/LL_41_COMPARISONS.md', food.join('\n') + '\n');
