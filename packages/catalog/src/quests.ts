import adapt from '../../../data/quests/adapt.json';
import greenfield from '../../../data/quests/greenfield.json';
import { QuestLineSchema, type QuestLine } from './schema.ts';

/** Tutorial quest lines (G16), validated; keyed by the id a start names in `tutorial`. */
export const QUEST_LINES: Record<string, QuestLine> = Object.fromEntries(
  [adapt, greenfield].map((q) => [q.id, QuestLineSchema.parse(q)]),
);

export function getQuestLine(id: string): QuestLine {
  const q = QUEST_LINES[id];
  if (!q) throw new Error(`Unknown quest line "${id}" (known: ${Object.keys(QUEST_LINES).join(', ')})`);
  return q;
}
