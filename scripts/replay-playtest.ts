/** Rebuild an exported playtest action fixture without browser storage. Prints state JSON. */
import { readFileSync } from 'node:fs';
import { catalog } from '@homestead/catalog';
import { replay, type Action, type GameInit } from '@homestead/engine';

const file = process.argv[2];
if (!file) throw new Error('Usage: node --import tsx scripts/replay-playtest.ts <fixture.json> [absolute-day]');
const f = JSON.parse(readFileSync(file, 'utf8')) as { init: GameInit; actions: Action[]; absDay: number };
const until = process.argv[3] === undefined ? f.absDay : Number(process.argv[3]);
if (!Number.isInteger(until) || until < 0 || until > f.absDay) throw new Error('Absolute day must be an integer within the fixture history');
const state = replay(catalog, f.init, f.actions.filter((a) => a.at <= until), until);
process.stdout.write(JSON.stringify(state));
