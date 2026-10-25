import { writeFileSync } from 'node:fs';
import { catalog, getSite } from '@homestead/catalog';
import {
  applyAction,
  canPlace,
  initGame,
  placeDesign,
  placeSystem,
  queueTrade,
  serviceSystem,
  stepDays,
  type Action,
  type GameSettings,
} from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';
import type { Bot } from './types.ts';

/** LL-10-style paired runs: identical tutorial/remote-job route, household, seed and climate. */
export function phase9Comparisons() {
  const rows: string[] = [
    '# Phase 9 controlled comparisons',
    '',
    'Run with `node --import tsx packages/cli/bots/phase9.ts`. Two adults, greenfield, 365 days, remote-job tutorial route. Standard seed 1 and Real seeds 1–3 at each site. Wear and trade remain opt-in. Numbers below are game balance experiments.',
    '',
    'Variants: baseline; wear only; trade only (weekly surplus orders, keep 28 household-days of each food resource); same trade policy plus a purchased Farm Stand on day 30. No prepared Food resale. No barter: it requires tutorial completion and a player-selected exchange. The stand adds its purchase, construction, staffing and transport costs. Policies only place a stand when affordable and a valid spot exists.',
    '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | Cash end | Trade receipts | Sold units* | Repairable condition min |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  const route = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!;
  for (const site of COMPARE_SITES)
    for (const difficulty of ['standard', 'real'] as const)
      for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
        for (const variant of ['baseline', 'wear', 'trade', 'stand']) {
          const settings: Partial<GameSettings> = {
            ...NEW_GAME_SETTINGS,
            wearAndRepair: variant === 'wear',
            sellingAndTrade: variant === 'trade' || variant === 'stand',
          };
          const base = route.bot(null);
          const bot: Bot = {
            name: `phase9-${variant}`,
            act(cat, state, log) {
              let s = base.act(cat, state, log);
              const act = (a: Action) => {
                s = applyAction(cat, s, a);
                log.push(a);
              };
              if (variant === 'stand' && s.calendar.absDay === 30) {
                const sys = cat.systems.find((x) => x.name === 'Farm Stand')!;
                if (s.cash >= sys.costBuy) {
                  let placed = false;
                  for (let y = 15; y < 200 && !placed; y += 10)
                    for (let x = 15; x < 200 && !placed; x += 10) {
                      if (canPlace(cat, s, sys.id, x, y).ok) {
                        act({
                          at: s.calendar.absDay,
                          kind: 'place',
                          systemId: sys.id,
                          x,
                          y,
                          mode: 'buy',
                          id: `i${s.nextInstanceId}`,
                        });
                        placed = true;
                      }
                    }
                  if (!placed) throw new Error('No room for comparison Farm Stand');
                }
              }
              if (settings.sellingAndTrade && s.calendar.absDay % 7 === 0)
                for (const r of cat.resources) {
                  if (
                    r.name === 'Food' ||
                    !(r.marketPrice! > 0) ||
                    !r.storable ||
                    (r.needsRow !== 'Food' && r.name !== 'Wool')
                  )
                    continue;
                  if (s.market?.sales?.some((o) => o.resource === r.name)) continue;
                  const keep = r.needsRow === 'Food' ? (2 * 2000 * 28) / (r.factorToNeed ?? 1) : 0;
                  const amount = Math.max(0, (s.stocks[r.name] ?? 0) - keep);
                  if (amount > 0)
                    act({ at: s.calendar.absDay, kind: 'sell', resource: r.name, amount, keep });
                }
              return s;
            },
          };
          const result = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings });
          const m = measure(result, catalog);
          const trades = result.ledgers.flatMap((l) => l.trades ?? []);
          const conditions = result.state.instances.flatMap((i) =>
            i.condition === undefined ? [] : [i.condition],
          );
          rows.push(
            `| ${site} | ${difficulty}/${seed} | ${variant} | ${m.essentialShortDays} | ${m.minWellbeing.toFixed(1)} | ${m.cashEnd.toFixed(2)} | ${trades.reduce((a, t) => a + t.revenue, 0).toFixed(2)} | ${trades.reduce((a, t) => a + t.amount, 0).toFixed(2)} | ${conditions.length ? Math.min(...conditions).toFixed(4) : '—'} |`,
          );
        }
      }
  rows.push(
    '',
    '*Sold units are a diagnostic sum across canonical units, not a nutrition or economic measure. Receipts are gross; cash end includes collection and stand costs. No defaults are changed by this experiment.',
    '',
  );
  rows.push(
    '## Controlled harvest and worn-panel checks',
    '',
    'These isolate the mechanics the first-year route rarely exercises: the same 500 lb harvest stock, one adult and eight prebuilt bikes at each site; one sale of 300 lb after three warm-up days. A stand is bought for $200 and built using household labor. Separately, a panel begins at 15% condition; the repair variant pays catalog parts and uses actual construction labor. No unlimited supply. Compare each pair within its own fixture.',
    '',
    '| Site | Experiment | Trade receipts | Collection cost | Cash end | 30-day electricity (kWh) | Construction hours |',
    '|---|---|---:|---:|---:|---:|---:|',
  );
  const id = (name: string) => catalog.systems.find((s) => s.name === name)!.id;
  for (const site of COMPARE_SITES) {
    const make = () =>
      placeDesign(
        catalog,
        initGame(catalog, getSite(site), {
          startDay: 150,
          wellbeingMult: 0,
          sellingAndTrade: true,
          wearAndRepair: true,
          startingStocks: { Food: 10000, Honey: 500, 'Drinking water': 1000 },
        }),
        { [id('Human Being')]: 1, [id('Bike')]: 8 },
      );
    for (const stand of [false, true]) {
      let state = make();
      if (stand) state = placeSystem(catalog, state, id('Farm Stand'), 100, 100, 'buy').state;
      state = stepDays(state, catalog, 3).state;
      const result = stepDays(queueTrade(catalog, state, 'Honey', 300, 100), catalog, 1);
      rows.push(
        `| ${site} | ${stand ? 'Stand sale' : 'Market sale'} | ${result.ledgers[0]!.cash.in} | ${result.ledgers[0]!.spend.delivery} | ${result.state.cash.toFixed(2)} | — | ${result.state.ledgers.reduce((a, l) => a + l.labor.construction, 0).toFixed(2)} |`,
      );
    }
    for (const repair of [false, true]) {
      let state = make();
      const panel = placeSystem(catalog, state, id('500W Photovoltaic Panels'), 100, 100, 'prebuilt');
      state = {
        ...panel.state,
        instances: panel.state.instances.map((i) =>
          i.id === panel.instanceId ? { ...i, condition: 0.15 } : i,
        ),
      };
      if (repair) state = serviceSystem(catalog, state, panel.instanceId);
      const result = stepDays(state, catalog, 30);
      rows.push(
        `| ${site} | ${repair ? 'Repair panel' : 'Worn panel'} | — | — | ${result.state.cash.toFixed(2)} | ${result.ledgers.reduce((a, l) => a + l.resources.Electricity!.produced, 0).toFixed(2)} | ${result.ledgers.reduce((a, l) => a + l.labor.construction, 0).toFixed(2)} |`,
      );
    }
  }
  return rows.join('\n');
}

if (process.argv[1]?.endsWith('/phase9.ts'))
  writeFileSync('docs/PHASE_9_COMPARISONS.md', phase9Comparisons());
