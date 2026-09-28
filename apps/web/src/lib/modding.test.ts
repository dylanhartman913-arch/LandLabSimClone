import { getSite } from '@homestead/catalog';
import { initGame, placeSystem, stepDays, systemFlows } from '@homestead/engine';
import { describe, expect, it } from 'vitest';
import { mutatedXlsx, tryExport, withNewSystem } from '../../../../packages/catalog/test/helpers.ts';
import { categoryOptions, placeableSystems } from './catalog-view.ts';
import { buildSearchIndex, searchSystems } from './search.ts';

describe('a system added in the spreadsheet reaches the drawer with no code change', () => {
  const { result } = tryExport(mutatedXlsx(withNewSystem));
  const catalog = result!.catalog;

  it('is listed, found by search, counted in its categories, and has a card', () => {
    expect(placeableSystems(catalog).some((s) => s.name === 'Solar Food Dehydrator')).toBe(true);
    const found = searchSystems(buildSearchIndex(catalog), 'dehydrator').map((s) => s.name);
    expect(found).toContain('Solar Food Dehydrator');
    const food = categoryOptions(catalog).find((c) => c.name === 'Food System')!;
    expect(food.count).toBe(catalog.systems.filter((s) => s.categories.includes('Food System')).length);
    const card = systemFlows(catalog, 'S169', catalog.assumptions);
    expect(card.outputs.map((o) => o.resource)).toContain('Vegetables fruit fiber herbs');
  });

  it('can be placed and run by the engine', () => {
    let g = initGame(catalog, getSite('front-range'), {}, 1);
    g = placeSystem(catalog, g, 'S169', 50, 50, 'buy').state;
    const r = stepDays(g, catalog, 7);
    expect(r.state.instances[0]!.systemId).toBe('S169');
  });
});
