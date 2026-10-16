import type { Catalog, System } from '@homestead/catalog';

/** Dropdown categories (hidden ones like Household excluded), alphabetical, with system counts. */
export function categoryOptions(catalog: Catalog): { name: string; count: number }[] {
  return catalog.categories
    .filter((c) => c.inDropdown)
    .map((c) => ({
      name: c.name,
      count: catalog.systems.filter((s) => s.categories.includes(c.name)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Systems the player can place from the drawer (people and site facts included). */
export function placeableSystems(catalog: Catalog): System[] {
  return catalog.systems;
}
