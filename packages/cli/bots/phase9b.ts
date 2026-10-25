import { writeFileSync } from 'node:fs';
import { catalog, getSite, type Catalog } from '@homestead/catalog';
import {
  applyAction,
  canPlace,
  initGame,
  manageLivestock,
  placeDesign,
  setPreservation,
  stepDays,
  type Action,
  type GameState,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';
import type { Bot } from './types.ts';

const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
const foodKcal = (s: GameState) =>
  catalog.resources
    .filter((r) => r.needsRow === 'Food')
    .reduce((sum, r) => sum + (s.stocks[r.name] ?? 0) * (r.factorToNeed ?? 1), 0);
const adults = (s: GameState) =>
  s.instances.filter((i) => i.systemId === id('Chicken')).reduce((n, i) => n + (i.scale ?? 1), 0);

/** Paired mechanics gates under one common policy, plus focused tests of harvest, growth and defense. */
export function phase9bComparisons(): string {
  const out = [
    '# LL-30 and LL-31 controlled comparisons',
    '',
    'Reproduce with `node --import tsx packages/cli/bots/phase9b.ts`. Experimental flags remain off by default. Recipe, lifecycle and risk rates are game balance assumptions.',
    '',
    '## First-year policy comparison',
    '',
    'Two adults, greenfield, remote-job tutorial policy, 365 days. Every variant buys the same Solar Dehydrator on day 120 and uses the same tutorial policy. Preservation variants process mixed garden produce above a seven-household-day reserve. The only other difference is the preservation/lifecycle gate. Standard seed 1 and Real seeds 1–3 at each site; no unlimited supply. The tutorial policy reacts to quest progress, so resulting action dates may differ.',
    '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | Cash end | Food kcal left | Preserved kcal made | Processing hours | Predator losses |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|---:|',
  ];
  const route = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!;
  for (const site of COMPARE_SITES)
    for (const difficulty of ['standard', 'real'] as const)
      for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
        for (const variant of ['baseline', 'preservation', 'lifecycle', 'both']) {
          const preserve = variant === 'preservation' || variant === 'both';
          const settings = {
            ...NEW_GAME_SETTINGS,
            foodPreservation: preserve,
            livestockLifecycle: variant === 'lifecycle' || variant === 'both',
          };
          const base = route.bot(null);
          const bot: Bot = {
            name: `phase9b-${variant}`,
            act(cat, state, log) {
              let s = base.act(cat, state, log);
              const act = (a: Action) => {
                s = applyAction(cat, s, a);
                log.push(a);
              };
              if (s.calendar.absDay === 120) {
                const sys = cat.systems.find((x) => x.name === 'Solar Dehydrator')!;
                if (s.cash < sys.costBuy)
                  throw new Error('Comparison policy cannot fund its matched dehydrator');
                let placed = false;
                for (let y = 15; y < 200 && !placed; y += 10)
                  for (let x = 15; x < 200 && !placed; x += 10)
                    if (canPlace(cat, s, sys.id, x, y).ok) {
                      const instanceId = `i${s.nextInstanceId}`;
                      act({
                        at: s.calendar.absDay,
                        kind: 'place',
                        systemId: sys.id,
                        x,
                        y,
                        mode: 'buy',
                        id: instanceId,
                      });
                      if (preserve)
                        act({
                          at: s.calendar.absDay,
                          kind: 'preserve',
                          id: instanceId,
                          resource: 'Vegetables fruit fiber herbs',
                          keep:
                            (2 * 2000 * 7) /
                            cat.resources.find((r) => r.name === 'Vegetables fruit fiber herbs')!
                              .factorToNeed!,
                        });
                      placed = true;
                    }
                if (!placed) throw new Error('No valid spot for matched comparison dehydrator');
              }
              return s;
            },
          };
          const r = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings });
          const m = measure(r, catalog);
          const batches = r.ledgers.flatMap((l) => l.preserved ?? []);
          const losses = r.events
            .filter((e) => e.kind === 'livestock' && e.event === 'predator-loss')
            .reduce((n, e) => n + (e.kind === 'livestock' ? e.amount : 0), 0);
          out.push(
            `| ${site} | ${difficulty}/${seed} | ${variant} | ${m.essentialShortDays} | ${m.minWellbeing.toFixed(1)} | ${m.cashEnd.toFixed(2)} | ${foodKcal(r.state).toFixed(0)} | ${batches.reduce((n, b) => n + b.outputKcal, 0).toFixed(0)} | ${batches.reduce((n, b) => n + b.labor, 0).toFixed(1)} | ${losses} |`,
          );
        }
      }
  out.push(
    '',
    '## A harvest carried into winter',
    '',
    'Matched existing solar dryer, one adult, 500 lb harvested meat (450,000 kcal), no prepared food, 120 days starting day 240; average climate, wellbeing penalties off to isolate food accounting. Both variants have preservation enabled and identical storage. One holds food fresh; the other processes surplus with no fresh reserve. Ordinary labor, sunlight, spoilage and storage limits apply. This is an isolated food-stock experiment, not an all-needs survival claim.',
    '',
    '| Site | Policy | Days food below 60% | Food kcal left | Fresh spoiled kcal | Preserved kcal made | Processing hours |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  for (const site of COMPARE_SITES)
    for (const process of [false, true]) {
      let s = placeDesign(
        catalog,
        initGame(catalog, getSite(site), {
          foodPreservation: true,
          wellbeingMult: 0,
          startDay: 240,
          startingStocks: { Meat: 500, 'Drinking water': 1000 },
        }),
        { [id('Human Being')]: 1, [id('Solar Dehydrator')]: 1 },
      );
      if (process)
        s = setPreservation(
          catalog,
          s,
          s.instances.find((i) => i.systemId === id('Solar Dehydrator'))!.id,
          'Meat',
          0,
        );
      const r = stepDays(s, catalog, 120);
      const batches = r.ledgers.flatMap((l) => l.preserved ?? []);
      out.push(
        `| ${site} | ${process ? 'Dry surplus' : 'Hold fresh'} | ${r.ledgers.filter((l) => l.needs.Food.delivered < l.needs.Food.needed * 0.6).length} | ${foodKcal(r.state).toFixed(0)} | ${(r.ledgers.reduce((n, l) => n + l.resources.Meat!.spoiled, 0) * 900).toFixed(0)} | ${batches.reduce((n, b) => n + b.outputKcal, 0).toFixed(0)} | ${batches.reduce((n, b) => n + b.labor, 0).toFixed(1)} |`,
      );
    }
  out.push(
    '',
    '## Chick growth and predator protection',
    '',
    'Growth: one twelve-chick batch for 60 days, ordinary labor, stocks and a prefilled 5,000-gallon cistern; matched supplied/absent chicken feed, predator events disabled to isolate growth. Protection: seed 3, one hen and the same guardian, four days; guardian near vs beyond 100 ft. The protection-only fixture uses validation supply to isolate the defense rule from feeding. No meat is obtained from predator losses.',
    '',
    '| Site | Check | Result |',
    '|---|---|---|',
  );
  const growthCatalog: Catalog = { ...catalog, predatorRule: undefined };
  for (const site of COMPARE_SITES) {
    for (const fed of [false, true]) {
      const s = placeDesign(
        growthCatalog,
        initGame(growthCatalog, getSite(site), {
          livestockLifecycle: true,
          wellbeingMult: 0,
          startingStocks: {
            Food: 100000,
            Water: 1000,
            'Drinking water': 1000,
            'Chicken feed': fed ? 1000 : 0,
            'Green biomass': 100,
            Grubs: 100,
            'Food waste': 100,
          },
        }),
        { [id('Human Being')]: 1, [id('Baby Chicks')]: 1, [id('5,000 Gallon Cistern')]: 1 },
      );
      const r = stepDays(s, growthCatalog, 60);
      out.push(
        `| ${site} | Chicks ${fed ? 'fed' : 'without feed'} | ${adults(r.state)} mature hens; ${r.state.instances.find((i) => i.systemId === id('Baby Chicks'))?.animal?.growthDays.toFixed(1) ?? 'complete'} growth days |`,
      );
    }
    for (const near of [false, true]) {
      let s = placeDesign(
        catalog,
        initGame(catalog, getSite(site), { livestockLifecycle: true, unlimitedSupply: true }, 3),
        {
          [id('Human Being')]: 1,
          [id('Chicken')]: 1,
          [id('Livestock Guardian Dog')]: 1,
        },
      );
      const hen = s.instances.find((i) => i.systemId === id('Chicken'))!;
      if (near)
        s = {
          ...s,
          instances: s.instances.map((i) =>
            i.systemId === id('Livestock Guardian Dog') ? { ...i, x: hen.x + 10, y: hen.y } : i,
          ),
        };
      const r = stepDays(s, catalog, 4);
      out.push(
        `| ${site} | Guardian ${near ? 'nearby' : 'out of range'} | ${adults(r.state)} hen remaining; ${r.events.filter((e) => e.kind === 'livestock' && e.event === 'protected').length} attacks prevented |`,
      );
    }
  }
  out.push(
    '',
    '## Breeding and culling timing',
    '',
    'One adult rabbit trio, one adult human, validation supply and predators disabled to isolate the lifecycle. Breeding books the $15 service once; birth needs 31 fed days and two work hours. Culling consumes two work hours, removes the cohort, and produces 12 lb once. No steady meat is produced under the lifecycle gate.',
    '',
    '| Operation | Day | Rabbit cohorts | Meat produced (lb) | Cash spent |',
    '|---|---:|---:|---:|---:|',
  );
  const s = placeDesign(
    growthCatalog,
    initGame(growthCatalog, getSite('front-range'), { livestockLifecycle: true, unlimitedSupply: true }),
    { [id('Human Being')]: 1, [id('Meat Rabbits (trio)')]: 1 },
  );
  const rabbit = s.instances.find((i) => i.systemId === id('Meat Rabbits (trio)'))!;
  for (const [operation, days] of [
    ['breed', 30],
    ['breed', 31],
    ['cull', 1],
  ] as const) {
    const r = stepDays(manageLivestock(growthCatalog, s, rabbit.id, operation), growthCatalog, days);
    out.push(
      `| ${operation} | ${days} | ${r.state.instances.filter((i) => i.systemId === rabbit.systemId).length} | ${r.ledgers.reduce((n, l) => n + l.resources.Meat!.produced, 0)} | ${(s.cash - r.state.cash).toFixed(2)} |`,
    );
  }
  return out.join('\n') + '\n';
}

if (process.argv[1]?.endsWith('/phase9b.ts'))
  writeFileSync('docs/PHASE_9B_COMPARISONS.md', phase9bComparisons());
