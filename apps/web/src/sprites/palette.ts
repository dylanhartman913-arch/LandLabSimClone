/**
 * Original placeholder palette: one muted, earthy color per catalog category.
 * Colors are paired with a glyph so nothing is conveyed by color alone.
 */
export const CATEGORY_COLORS: Record<string, number> = {
  Energy: 0xe0a526,
  Solar: 0xf2c641,
  Shelter: 0xb07a4f,
  Canvas: 0xd8c9a3,
  Biomass: 0x7a5a3a,
  Livestock: 0xc98b6b,
  Fowl: 0xe8b86b,
  Insects: 0xd99a2b,
  Transportation: 0x6f8fa8,
  'Water-System': 0x4f93c9,
  Purification: 0x7fc4d8,
  Conventional: 0x8c8c94,
  'Food System': 0x8fb35a,
  Garden: 0x5f9e4a,
  Plants: 0x3f8a4f,
  Compost: 0x6b5236,
  Sanitation: 0x9a8a6a,
  Storage: 0x9c7b9e,
  Biodiversity: 0x6fae8a,
  Tools: 0x7d7a70,
  Cooking: 0xd46a43,
  Cooling: 0x66b8c9,
  Heating: 0xc9503c,
  Land: 0xa8a070,
  Household: 0xefe6d6,
};

export const FALLBACK_COLOR = 0x999999;

export function categoryColor(category: string | undefined): number {
  return (category ? CATEGORY_COLORS[category] : undefined) ?? FALLBACK_COLOR;
}

export function cssColor(n: number): string {
  return `#${n.toString(16).padStart(6, '0')}`;
}

export type GlyphKind =
  | 'house'
  | 'tent'
  | 'sun'
  | 'bolt'
  | 'drop'
  | 'leaf'
  | 'tree'
  | 'sprout'
  | 'egg'
  | 'hoof'
  | 'bee'
  | 'wheel'
  | 'flame'
  | 'snow'
  | 'pot'
  | 'box'
  | 'swirl'
  | 'filter'
  | 'wrench'
  | 'flower'
  | 'coin'
  | 'field'
  | 'person';

const GLYPH_BY_CATEGORY: Record<string, GlyphKind> = {
  Shelter: 'house',
  Canvas: 'tent',
  Solar: 'sun',
  Energy: 'bolt',
  'Water-System': 'drop',
  Purification: 'filter',
  Plants: 'tree',
  Garden: 'sprout',
  'Food System': 'leaf',
  Biomass: 'tree',
  Fowl: 'egg',
  Livestock: 'hoof',
  Insects: 'bee',
  Transportation: 'wheel',
  Heating: 'flame',
  Cooling: 'snow',
  Cooking: 'pot',
  Storage: 'box',
  Compost: 'swirl',
  Sanitation: 'swirl',
  Tools: 'wrench',
  Biodiversity: 'flower',
  Conventional: 'coin',
  Land: 'field',
  Household: 'person',
};

export function glyphFor(categories: readonly string[]): GlyphKind {
  // Prefer the most specific category (Canvas over Shelter, Solar over Energy, Fowl over Livestock).
  const order = ['Canvas', 'Solar', 'Fowl', 'Insects', 'Purification', 'Heating', 'Cooling', 'Cooking'];
  for (const c of order) if (categories.includes(c)) return GLYPH_BY_CATEGORY[c]!;
  return GLYPH_BY_CATEGORY[categories[0] ?? ''] ?? 'box';
}
