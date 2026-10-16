import { catalog } from '@homestead/catalog';
import { describe, expect, it } from 'vitest';
import { buildSearchIndex, searchSystems } from './search.ts';

const index = buildSearchIndex(catalog);
const names = (q: string) => searchSystems(index, q).map((s) => s.name);

describe('drawer quick search', () => {
  it('typing "eggs" finds chickens, ducks, and quail', () => {
    const found = names('eggs');
    expect(found).toEqual(
      expect.arrayContaining(['Chicken', 'Duck', 'Quail Hutch (10 quail)', 'Chicken Coop (12 hens)']),
    );
  });

  it('ranks name matches above things that merely use the resource', () => {
    const found = names('solar');
    expect(found[0]!.toLowerCase()).toContain('solar');
  });

  it('matches categories', () => {
    expect(names('canvas')).toEqual(expect.arrayContaining(['Bell Tent', 'Yurt', 'Teepee']));
  });

  it('forgives a loose in-order spelling of a name', () => {
    expect(names('rkt stove')).toContain('Rocket Stove');
  });

  it('returns everything for an empty query', () => {
    expect(names('')).toHaveLength(catalog.systems.length);
  });

  it('makes / uses: "wood pellets" separates the stores that sell them from the stoves that burn them', () => {
    const makes = searchSystems(index, 'wood pellets', 'makes').map((s) => s.name);
    const uses = searchSystems(index, 'wood pellets', 'uses').map((s) => s.name);
    expect(makes).toContain('Farm & Feed Store');
    expect(makes).not.toContain('Pellet Stove');
    expect(uses).toContain('Pellet Stove');
    expect(uses).not.toContain('Farm & Feed Store');
  });
});
