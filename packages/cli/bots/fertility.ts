import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import { HEAT_HDD_MIN, SURVIVAL, initGame, placeDesign, stepDays, type GameState } from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const CROPS = ['Vegetables fruit fiber herbs', 'Root crops', 'Grain'];
const gardenIds = new Set(catalog.soilFertility!.gardens.map((g) => g.systemId));

/** The matched first-year route, legacy compost switch vs fertility. */
function firstYear(): string[] {
  const out = [
    '## First-year routes', '',
    'Two adults, greenfield remote-job tutorial policy (which builds beds and a compost pile through the quests), 365 days. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3. Crops are vegetables, root crops and grain produced on the homestead (gathering excluded).', '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Crops grown (lb) | Garden-days stopped by compost | Compost used (lb) | Manure used (lb) | Mean garden fertility at year end |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of COMPARE_SITES) for (const difficulty of ['standard', 'real'] as const) for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
    for (const variant of ['legacy', 'fertility'] as const) {
      const bot = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!.bot(null);
      const run = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings: { ...NEW_GAME_SETTINGS, soilFertility: variant === 'fertility' } });
      const m = measure(run, catalog);
      const short = run.ledgers.filter((l) => l.wellbeing !== null && ([
        ['drinkingWater', 'Drinking water'], ['food', 'Food'], ['shelter', 'Shelter'], ['heat', 'Heated shelter'], ['sanitation', 'Sanitation'],
      ] as const).some(([key, row]) => {
        if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
        const n = l.needs[row];
        return (n.needed > 1e-9 ? n.delivered / n.needed : 1) < SURVIVAL[key].short - 1e-9;
      })).length;
      const gathered = (r: string) => sum(run.ledgers, (l) => sum((l.gathered ?? []).filter((g) => g.resource === r), (g) => g.amount));
      const crops = sum(CROPS, (r) => sum(run.ledgers, (l) => l.resources[r]?.produced ?? 0) - gathered(r));
      const stopped = sum(run.ledgers, (l) => sum(l.curtailed.filter((c) => gardenIds.has(c.systemId) && c.limitedBy === 'Compost'), (c) => c.count));
      const gardens = run.state.instances.filter((i) => i.status === 'active' && gardenIds.has(i.systemId));
      const fert = variant === 'fertility' && gardens.length ? (sum(gardens, (g) => g.fertility ?? catalog.soilFertility!.gardens.find((x) => x.systemId === g.systemId)!.initial) / gardens.length).toFixed(2) : '—';
      out.push(`| ${site} | ${difficulty}/${seed} | ${variant} | ${short} | ${m.minWellbeing?.toFixed(1)} | ${run.state.cash.toFixed(0)} | ${crops.toFixed(0)} | ${stopped} | ${sum(run.ledgers, (l) => l.resources.Compost?.consumed ?? 0).toFixed(0)} | ${sum(run.ledgers, (l) => sum(l.fertility ?? [], (f) => f.manure)).toFixed(0)} | ${fert} |`);
    }
  }
  return out;
}

/** One raised bed and one potato patch over three years under different soil care. */
function threeYears(): string[] {
  const out = [
    '', '## Three-year garden checks', '',
    'One adult, a Bell Tent, city water, one Raised Bed and one Potato Patch on the Front Range, Standard weather, three years each starting April 11 with 30 lb of seed potatoes added each spring and seed on hand. Soil care varies: none; compost at the catalog rate (stock on hand); manure only (stock on hand); and a Clover Cover Crop beside the gardens with no compost. Legacy rules are shown for comparison: there a garden without compost does not crop at all.', '',
    '| Care | Rules | Crops year 1 (lb) | Crops year 2 (lb) | Crops year 3 (lb) | Bed fertility end yr 1 / 2 / 3 | Patch fertility end yr 1 / 2 / 3 |',
    '|---|---|---:|---:|---:|---|---|',
  ];
  const cases: { care: string; stocks: Record<string, number>; clover?: boolean; legacy?: boolean }[] = [
    { care: 'none', stocks: {}, legacy: true },
    { care: 'none', stocks: {} },
    { care: 'compost', stocks: { Compost: 5000 }, legacy: true },
    { care: 'compost', stocks: { Compost: 5000 } },
    { care: 'manure', stocks: { Manure: 10000 } },
    { care: 'clover cover crop', stocks: {}, clover: true },
  ];
  for (const c of cases) {
    const counts: Record<string, number> = { [id('Human Being')]: 1, [id('Bell Tent')]: 1, [id('Municipal Water Hookup')]: 1, [id('Raised Beds (24 sq ft)')]: 1, [id('Potato Patch (400 sq ft)')]: 1 };
    if (c.clover) counts[id('Clover Cover Crop')] = 1;
    let s: GameState = placeDesign(catalog, initGame(catalog, getSite('front-range'), {
      ...NEW_GAME_SETTINGS, soilFertility: !c.legacy, startDay: 100,
      startingStocks: { Food: 1e7, 'Drinking water': 50, Seeds: 100, ...c.stocks },
    }, 1), counts, 'prebuilt');
    s = { ...s, instances: s.instances.map((i) => ({ ...i, x: 80, y: 80 })) };
    const crops: string[] = [];
    const bedF: string[] = [];
    const patchF: string[] = [];
    for (let y = 0; y < 3; y++) {
      // Seed potatoes each spring, so only soil care differs.
      s = { ...s, stocks: { ...s.stocks, 'Root crops': (s.stocks['Root crops'] ?? 0) + 30 } };
      const r = stepDays(s, catalog, 365);
      s = r.state;
      crops.push(sum(CROPS, (res) => sum(r.ledgers, (l) => l.resources[res]?.produced ?? 0)).toFixed(0));
      const f = (name: string) => s.instances.find((i) => i.systemId === id(name))!.fertility;
      bedF.push(c.legacy ? '—' : (f('Raised Beds (24 sq ft)') ?? 1).toFixed(2));
      patchF.push(c.legacy ? '—' : (f('Potato Patch (400 sq ft)') ?? 0.7).toFixed(2));
    }
    out.push(`| ${c.care} | ${c.legacy ? 'legacy' : 'fertility'} | ${crops.join(' | ')} | ${bedF.join(' / ')} | ${patchF.join(' / ')} |`);
  }
  return out;
}

export function fertilityComparisons(): string {
  return [
    '# LL-35 soil fertility comparisons', '',
    'Reproduce with `node --import tsx packages/cli/bots/fertility.ts`. LL-35 remains an opt-in experimental setting; nothing here changes defaults. Rates are game balance (see `docs/LL_35.md`), not agronomic forecasts.', '',
    ...firstYear(), ...threeYears(),
  ].join('\n') + '\n';
}
writeFileSync('docs/LL_35_COMPARISONS.md', fertilityComparisons());
