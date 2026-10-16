import type { Catalog } from '@homestead/catalog';
import type { DesignFile } from '../design.ts';
import { digest } from '../digest.ts';
import { explained } from '../provenance.ts';
import { designFromGame, gameFromDesign } from '../scenario.ts';
import { stepDay } from '../time/step.ts';
import type { GameState } from '../time/types.ts';
import { HEAT_HDD_MIN } from '../time/wellbeing.ts';
import { designForBalance, scenarioSummary } from './scenario.ts';

export function planningBaseline(state: GameState, catalog: Catalog) {
  const file = designFromGame(catalog, state, 'Current layout');
  return {
    file,
    ...designForBalance(catalog, file, state.site.id),
    summary: scenarioSummary(catalog, file, state.site.id),
  };
}

/** Names can change without invalidating a geometry/policy comparison. */
export function planningFingerprint(file: DesignFile, siteId: string): string {
  return digest({ ...file, name: '', description: '', site: siteId });
}

/** Policies actually used by mature-layout Monte Carlo, deliberately distinct from the live save. */
export function weatherRiskPolicy(catalog: Catalog, file: DesignFile, siteId: string): string {
  const game = gameFromDesign(catalog, file, { siteId, weatherMode: 'real', seed: 1 });
  const stocks = Object.entries(game.settings.startingStocks)
    .map(([r, v]) => `${v.toLocaleString('en-US')} ${catalog.resources.find((x) => x.name === r)!.unit} ${r}`)
    .join('; ');
  return `All placed systems start completed and mature on Jan 1. Reserves reset to ${stocks}; cash resets to $${game.settings.startingCash.toLocaleString('en-US')}. Default work priorities, no weekly caps, no auto-gather, market orders or tutorial rewards. Placed employment and usage-priced backstops run with actual inputs and labor. Wellbeing changes, but residents remain on site at zero wellbeing. Current stocks, cash, construction progress and work policies are not carried over. Annual balance and Sensitivity use a steady weekly supply model; weather risk steps daily, so their coverage scores can differ.`;
}

/** A short actual-state forecast; maturity, reserves, labor contention, assistance and town rules remain live. */
export function transitionForecast(state: GameState, catalog: Catalog, days = 90) {
  let forecast = state;
  let minCash = state.cash;
  let minWellbeing = state.instances.some((i) => i.person)
    ? Math.min(...state.instances.filter((i) => i.person).map((i) => i.person!.wellbeing))
    : null;
  const completions: { id: string; name: string; days: number }[] = [];
  let firstShortage: { need: string; days: number } | null = null;
  for (let day = 1; day <= days; day++) {
    const result = stepDay(forecast, catalog);
    forecast = result.state;
    minCash = Math.min(minCash, forecast.cash);
    for (const i of forecast.instances)
      if (i.person) minWellbeing = Math.min(minWellbeing ?? i.person.wellbeing, i.person.wellbeing);
    for (const e of result.events)
      if (e.kind === 'built')
        completions.push({
          id: e.instanceId,
          name: catalog.systems.find((s) => s.id === e.systemId)!.name,
          days: day,
        });
    if (!firstShortage)
      for (const need of ['Drinking water', 'Food', 'Shelter', 'Heated shelter', 'Sanitation'] as const) {
        if (need === 'Heated shelter' && result.ledger.weather.hdd <= HEAT_HDD_MIN) continue;
        const n = result.ledger.needs[need];
        if (n.needed > 1e-9 && n.delivered < n.needed - 1e-9) {
          firstShortage = { need, days: day };
          break;
        }
      }
  }
  return {
    days,
    firstShortage,
    completions,
    cashEnd: explained(
      forecast.cash,
      `live simulation cash after ${days} days; current policies and known weather seed`,
    ),
    minCash: explained(minCash, 'minimum cash over the projection, including the current day'),
    minWellbeing:
      minWellbeing === null
        ? null
        : explained(
            minWellbeing,
            'minimum individual wellbeing, including residents in town and the current day',
          ),
    awayEnd: forecast.instances.filter((i) => i.person?.away).map((i) => i.id),
  };
}
