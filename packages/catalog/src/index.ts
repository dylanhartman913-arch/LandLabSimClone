import catalogJson from '../generated/catalog.json';
import goldensJson from '../generated/goldens.json';
import type { Catalog, Goldens } from './schema.ts';

export type * from './schema.ts';
export { NEED_KEYS } from './schema.ts';
export { evalQtyExpr, describeQtyExpr, qtyAssumptionKeys, type QtySystemParams } from './qty.ts';

/** The generated catalog (committed; regenerate with `npm run catalog:export`). */
export const catalog = catalogJson as unknown as Catalog;
/** Cached spreadsheet values for the starter design (the parity contract). */
export const goldens = goldensJson as unknown as Goldens;
export { SITES, DEFAULT_SITE_ID, getSite } from './sites.ts';
export { STARTS, getStart } from './starts.ts';
export { QUEST_LINES, getQuestLine } from './quests.ts';
