import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import {
  HEAT_HDD_MIN,
  SURVIVAL,
  applyAction,
  canPlace,
  initGame,
  placeDesign,
  stepDays,
  type Action,
  type GameState,
  type GatherRecord,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';
import type { Bot } from './types.ts';

const sum = <T>(xs: T[], f: (x: T) => number) => xs.reduce((n, x) => n + f(x), 0);
const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const wood = (ledgers: { gathered?: GatherRecord[] }[]) => ledgers.flatMap((l) => (l.gathered ?? []).filter((g) => g.resource === 'Woody biomass'));

/** The same first-year policy plus a chainsaw and a gasoline standing order on day 1. */
function firstYear(): string[] {
  const out = [
    '## First-year routes', '',
    'Two adults, greenfield remote-job tutorial policy, 365 days. Both variants buy the same prebuilt Chainsaw on day 1 with a standing order keeping 1–3 gal of gasoline. Legacy: the chainsaw makes 150 lb of wood a week on its own. Tools: it multiplies gathering at the deadfall instead. Settings otherwise match current game defaults; ordinary supplies. Standard seed 1 and Real seeds 1–3 at each site.', '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Wood from chainsaw alone (lb) | Wood gathered at nodes (lb) | Firewood hours | Chainsaw hours at nodes | Gasoline used (gal) | Deadfall left at year end (lb) |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of COMPARE_SITES) for (const difficulty of ['standard', 'real'] as const) for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
    for (const variant of ['legacy', 'tools'] as const) {
      const base = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!.bot(null);
      const bot: Bot = { name: `ll34-${variant}`, act(cat, state, log) {
        let s: GameState = base.act(cat, state, log);
        const act = (a: Action) => { s = applyAction(cat, s, a); log.push(a); };
        if (s.calendar.absDay === 1) {
          const sys = id('Chainsaw');
          let placed = false;
          for (let y = 15; y < 200 && !placed; y += 10) for (let x = 15; x < 200 && !placed; x += 10) if (canPlace(cat, s, sys, x, y).ok) {
            act({ kind: 'place', at: 1, systemId: sys, id: `i${s.nextInstanceId}`, x, y, mode: 'prebuilt' });
            placed = true;
          }
          if (!placed) throw new Error('No space for the matched chainsaw');
          act({ kind: 'standing', at: 1, resource: 'Gasoline', keepAbove: 1, orderUpTo: 3 });
        }
        return s;
      } };
      const run = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings: { ...NEW_GAME_SETTINGS, toolGathering: variant === 'tools' } });
      const m = measure(run, catalog);
      const short = run.ledgers.filter((l) => l.wellbeing !== null && ([
        ['drinkingWater', 'Drinking water'], ['food', 'Food'], ['shelter', 'Shelter'], ['heat', 'Heated shelter'], ['sanitation', 'Sanitation'],
      ] as const).some(([key, row]) => {
        if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
        const n = l.needs[row];
        return (n.needed > 1e-9 ? n.delivered / n.needed : 1) < SURVIVAL[key].short - 1e-9;
      })).length;
      const hauls = wood(run.ledgers);
      const atNodes = sum(hauls, (g) => g.amount);
      const standalone = sum(run.ledgers, (l) => l.resources['Woody biomass']?.produced ?? 0) - atNodes;
      const deadfall = run.state.site.nodes.filter((n) => n.type === 'deadfall');
      const left = sum(deadfall, (n) => run.state.nodeStock?.[n.id] ?? n.stock ?? 0);
      out.push(`| ${site} | ${difficulty}/${seed} | ${variant} | ${short} | ${m.minWellbeing?.toFixed(1)} | ${run.state.cash.toFixed(0)} | ${Math.max(0, standalone).toFixed(0)} | ${atNodes.toFixed(0)} | ${sum(run.ledgers, (l) => l.labor.byJob?.['gather-wood'] ?? 0).toFixed(1)} | ${sum(hauls, (g) => g.toolHours ?? 0).toFixed(1)} | ${sum(run.ledgers, (l) => l.resources.Gasoline?.consumed ?? 0).toFixed(2)} | ${left.toFixed(0)} |`);
    }
  }
  return out;
}

/** A wood-hungry winter camp: how far the deadfall stretches by hand vs with a chainsaw. */
function winterWood(): string[] {
  const out = [
    '', '## Winter firewood checks', '',
    'Two adults, a Bell Tent and three Tiny Wood Stoves from January 1 for 120 days, Standard weather, a 4-week firewood target, 50 gal of gasoline on hand, tools gate on in both variants. The hand variant owns no chainsaw.', '',
    '| Site | Variant | Wood gathered (lb) | Firewood hours | Hours per 100 lb | Chainsaw hours | Gasoline (gal) | Deadfall left on day 120 (lb) | Days stoves were limited by wood |',
    '|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of COMPARE_SITES) for (const variant of ['hand', 'chainsaw'] as const) {
    const counts: Record<string, number> = { [id('Human Being')]: 2, [id('Bell Tent')]: 1, [id('Tiny Wood Stove')]: 3 };
    if (variant === 'chainsaw') counts[id('Chainsaw')] = 1;
    const s = placeDesign(catalog, initGame(catalog, getSite(site), {
      ...NEW_GAME_SETTINGS, toolGathering: true, startDay: 0, autoGather: { woodWeeks: 4 },
      startingStocks: { Food: 1e7, 'Drinking water': 1000, Gasoline: 50 },
    }, 1), counts, 'prebuilt');
    const r = stepDays(s, catalog, 120);
    const hauls = wood(r.ledgers);
    const lb = sum(hauls, (g) => g.amount);
    const hours = sum(r.ledgers, (l) => l.labor.byJob?.['gather-wood'] ?? 0);
    const left = sum(s.site.nodes.filter((n) => n.type === 'deadfall'), (n) => r.state.nodeStock?.[n.id] ?? n.stock ?? 0);
    const short = r.ledgers.filter((l) => l.curtailed.some((c) => c.limitedBy === 'Woody biomass')).length;
    out.push(`| ${site} | ${variant} | ${lb.toFixed(0)} | ${hours.toFixed(1)} | ${lb > 0 ? ((100 * hours) / lb).toFixed(2) : '—'} | ${sum(hauls, (g) => g.toolHours ?? 0).toFixed(1)} | ${sum(r.ledgers, (l) => l.resources.Gasoline?.consumed ?? 0).toFixed(2)} | ${left.toFixed(0)} | ${short} |`);
  }
  return out;
}

export function toolComparisons(): string {
  return [
    '# LL-34 tools multiply gathering comparisons', '',
    'Reproduce with `node --import tsx packages/cli/bots/tools.ts`. LL-34 remains an opt-in experimental setting; nothing here changes defaults. Multipliers and fuel rates are game balance derived from the catalog rows (see `docs/LL_34.md`).', '',
    ...firstYear(), ...winterWood(),
  ].join('\n') + '\n';
}
writeFileSync('docs/LL_34_COMPARISONS.md', toolComparisons());
