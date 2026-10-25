import { writeFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { applyAction, canPlace, HEAT_HDD_MIN, SURVIVAL, heatShare, type Action, type GameState } from '@homestead/engine';
import { COMPARISONS, COMPARE_SITES, measure } from './compare.ts';
import { NEW_GAME_SETTINGS, playBot } from './run.ts';
import type { Bot } from './types.ts';

/** Identical first-year policy and spare-tent purchase; vary occupancy and mothballing only. */
export function occupancyComparisons(): string {
  const out = [
    '# LL-32 controlled shelter occupancy comparison', '',
    'Reproduce with `node --import tsx packages/cli/bots/occupancy.ts`. Two adults, greenfield remote-job tutorial policy, 365 days. All variants purchase the same prebuilt spare Bell Tent on day 120. Occupancy keeps the household in its initial home; the closed variant additionally mothballs the spare. Settings otherwise match the current game defaults. Standard seed 1 and Real seeds 1–3 at each site; ordinary supplies, no validation supply. Quest progress can change later action dates. Experimental occupancy remains off by default.', '',
    '| Site | Weather/seed | Variant | Survival short days | Min wellbeing | End cash | Heat requested (million BTU) | Upkeep requested (h) | Cold days meeting warmth |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|',
  ];
  for (const site of COMPARE_SITES) for (const difficulty of ['standard', 'real'] as const) for (const seed of difficulty === 'standard' ? [1] : [1, 2, 3]) {
    for (const variant of ['legacy', 'occupancy', 'closed'] as const) {
      const base = COMPARISONS.find((c) => c.id === 'job')!.variants.find((v) => v.id === 'remote')!.bot(null);
      const bot: Bot = { name: `ll32-${variant}`, act(cat, state, log) {
        let s: GameState = base.act(cat, state, log);
        const act = (a: Action) => { s = applyAction(cat, s, a); log.push(a); };
        if (s.calendar.absDay === 120) {
          const sys = cat.systems.find((x) => x.name === 'Bell Tent')!;
          if (s.cash < sys.costBuy) throw new Error('Matched spare tent is unaffordable');
          let placed = false;
          for (let y = 15; y < 200 && !placed; y += 10) for (let x = 15; x < 200 && !placed; x += 10) if (canPlace(cat, s, sys.id, x, y).ok) {
            const id = `i${s.nextInstanceId}`;
            act({ kind: 'place', at: 120, systemId: sys.id, id, x, y, mode: 'prebuilt' });
            if (variant === 'closed') act({ kind: 'closeShelter', at: 120, id, closed: true });
            placed = true;
          }
          if (!placed) throw new Error('No space for matched spare tent');
        }
        return s;
      } };
      const run = playBot(bot, { start: 'greenfield', site, difficulty, seed, days: 365, settings: { ...NEW_GAME_SETTINGS, shelterOccupancy: variant !== 'legacy' } });
      const m = measure(run, catalog);
      const short = run.ledgers.filter((l) => l.wellbeing !== null && ([
        ['drinkingWater', 'Drinking water'], ['food', 'Food'], ['shelter', 'Shelter'], ['heat', 'Heated shelter'], ['sanitation', 'Sanitation'],
      ] as const).some(([key, row]) => {
        if (key === 'heat' && l.weather.hdd <= HEAT_HDD_MIN) return false;
        const local = key === 'shelter' || key === 'heat' ? l.residentShares?.[key] : undefined;
        const n = l.needs[row];
        return (local ?? (n.needed > 1e-9 ? n.delivered / n.needed : 1)) < SURVIVAL[key].short - 1e-9;
      })).length;
      const heat = run.ledgers.reduce((n, l) => n + l.needs['Heated shelter'].needed, 0) / 1e6;
      const upkeep = run.ledgers.reduce((n, l) => n + l.labor.upkeepRequested, 0);
      const warm = run.ledgers.filter((l) => l.weather.hdd > HEAT_HDD_MIN && l.wellbeing !== null && heatShare(l) >= SURVIVAL.heat.short).length;
      out.push(`| ${site} | ${difficulty}/${seed} | ${variant} | ${short} | ${m.minWellbeing?.toFixed(1)} | ${run.state.cash.toFixed(0)} | ${heat.toFixed(3)} | ${upkeep.toFixed(2)} | ${warm} |`);
    }
  }
  return out.join('\n') + '\n';
}
writeFileSync('docs/LL_32_COMPARISONS.md', occupancyComparisons());
