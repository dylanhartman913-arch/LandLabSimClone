import { describe, expect, it } from 'vitest';
import { catalog, getSite, type NeedKey } from '@homestead/catalog';
import {
  balance,
  digest,
  initGame,
  placeDesign,
  placeSystem,
  removeSystem,
  stepDays,
  summarizeLedgers,
  type DayLedger,
  type GameState,
} from '../src/index.ts';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildSync } from 'esbuild';
import { expectDigest, loadDesign, REPO } from './fixtures.ts';
import { sysId } from './time-helpers.ts';

function gameFor(file: string, opts: { unlimited?: boolean; site?: string; seed?: number } = {}): GameState {
  const { design } = loadDesign(file);
  const s = initGame(
    catalog,
    getSite(opts.site ?? 'front-range'),
    { parcelAcres: 5, unlimitedSupply: opts.unlimited },
    opts.seed ?? 1,
  );
  return placeDesign(catalog, s, design.counts);
}

function expectConservation(ledgers: DayLedger[], final: GameState) {
  for (let d = 0; d < ledgers.length; d++) {
    const l = ledgers[d]!;
    for (const [r, x] of Object.entries(l.resources)) {
      const end =
        d + 1 < ledgers.length
          ? ledgers[d + 1]!.resources[r]!.start
          : (final.stocks[r] ?? 0) + (final.direct[r] ?? 0);
      const lhs = x.start + x.produced + x.supplied - x.consumed - x.spilled - x.spoiled;
      const scale = Math.max(1, x.start, x.produced, x.consumed, x.spilled);
      if (Math.abs(lhs - end) > 1e-9 * scale) {
        throw new Error(
          `${r} on day ${l.absDay}: start+produced−consumed−spilled−spoiled = ${lhs}, end = ${end}`,
        );
      }
    }
  }
}

describe('conservation: start + produced − consumed − spilled − spoiled = end, every resource, every day', () => {
  for (const file of ['starter.json', 'offgrid-cabin-family.json', 'suburban-baseline.json']) {
    it(`holds for ${file} over a year`, () => {
      const { state, ledgers } = stepDays(gameFor(file), catalog, 365);
      expectConservation(ledgers, state);
    });
  }

  it('holds in validation mode, counting supplied top-ups', () => {
    const { state, ledgers } = stepDays(
      gameFor('offgrid-cabin-family.json', { unlimited: true }),
      catalog,
      120,
    );
    expectConservation(ledgers, state);
  });

  it('holds across construction, removal, and a harvest', () => {
    let g = gameFor('offgrid-cabin-family.json');
    const all: DayLedger[] = [];
    const add = (n: number) => {
      const r = stepDays(g, catalog, n);
      expectConservation(r.ledgers, r.state);
      all.push(...r.ledgers);
      g = r.state;
    };
    const placed = placeSystem(catalog, g, sysId('Raised Beds (24 sq ft)'), 300, 400, 'diy');
    g = placed.state;
    add(60);
    g = removeSystem(g, placed.instanceId);
    add(300);
    expect(all.some((l) => l.resources['Woody biomass']!.produced > 0)).toBe(true);
  });
});

describe('time mode agrees with balance mode', () => {
  const ROWS_WITHIN = 0.05;
  const compare = (file: string, unlimited: boolean) => {
    const { design } = loadDesign(file);
    const y1 = stepDays(gameFor(file, { unlimited }), catalog, 365);
    const y2 = stepDays(y1.state, catalog, 365);
    const t = summarizeLedgers(y2.ledgers, catalog);
    const b = balance(catalog, catalog.assumptions, design);
    return { t, b, ledgers: y2.ledgers };
  };
  const rel = (a: number, e: number) => Math.abs(a - e) / Math.max(1e-9, Math.abs(e));

  for (const file of ['starter.json', 'offgrid-cabin-family.json', 'suburban-baseline.json']) {
    it(`${file}: with every input supplied, year-2 weekly averages match balance within 5% on every row`, () => {
      const { t, b } = compare(file, true);
      for (const row of t.checklist) {
        const br = b.checklist.find((x) => x.need === row.need)!;
        for (const k of ['provided', 'needed'] as const) {
          if (br[k].value === 0) expect(row[k], `${row.need} ${k}`).toBeCloseTo(0, 6);
          else expect(rel(row[k], br[k].value), `${row.need} ${k}`).toBeLessThan(ROWS_WITHIN);
        }
      }
    });
  }

  it('starter design, real supply: every row that differs by more than 5% is documented with its cause', () => {
    const { t, b, ledgers } = compare('starter.json', false);
    const differing: NeedKey[] = [];
    for (const row of t.checklist) {
      const br = b.checklist.find((x) => x.need === row.need)!;
      expect(
        rel(row.needed, br.needed.value) < ROWS_WITHIN || br.needed.value === 0,
        `${row.need} needed`,
      ).toBe(true);
      if (br.provided.value > 0 && rel(row.provided, br.provided.value) > ROWS_WITHIN)
        differing.push(row.need);
    }
    // docs/ENGINE.md, "Balance agreement": each of these is explained by a curtailment chain.
    expect(differing).toEqual([
      'Water',
      'Food',
      'Sanitation',
      'Transportation',
      'Cooled shelter',
      'Est. Required Labor',
    ]);
    const limited = (name: string) => {
      const id = sysId(name);
      const counts = new Map<string, number>();
      for (const l of ledgers)
        for (const c of l.curtailed)
          if (c.systemId === id) counts.set(c.limitedBy ?? '', (counts.get(c.limitedBy ?? '') ?? 0) + 1);
      return [...counts.entries()].sort((a, c) => c[1] - a[1])[0]?.[0];
    };
    expect(limited('Well')).toBe('Electricity'); // Water: no battery, and people get the daytime power first
    expect(limited('Chicken Coop (12 hens)')).toBe('Water'); // Food: no water for the hens…
    expect(limited('Raised Beds (24 sq ft)')).toBe('Water'); // …or the beds
    expect(limited('Composting Outhouse')).toBe('Carbon'); // Sanitation: no cover material
    expect(limited('Cargo Bike')).toBe('Food'); // Transportation: the rider’s calories go to the household first
    expect(limited('Poplar Tree')).toBe('Water'); // Cooled shelter: shade trees need summer water
    expect(t.averageHealth).toBeLessThan(0.5); // Labor provided falls with health
    // Electricity production matches; only delivery is storage-limited.
    const e = t.checklist.find((r) => r.need === 'Electricity')!;
    expect(rel(e.provided, 14)).toBeLessThan(ROWS_WITHIN);
    expect(e.pct).toBeLessThan(b.checklist.find((r) => r.need === 'Electricity')!.pct.value);
  });
});

describe('determinism', () => {
  const run = (file: string, seed: number) => {
    let g = gameFor(file, { seed });
    g = placeSystem(catalog, g, sysId('Yurt'), 400, 400, 'diy').state;
    const r = stepDays(g, catalog, 365);
    return digest({
      stocks: r.state.stocks,
      direct: r.state.direct,
      cash: r.state.cash,
      instances: r.state.instances,
      rng: r.state.rng,
      year: summarizeLedgers(r.ledgers, catalog),
      events: r.events.length,
    });
  };

  it('the same seed and actions give the same digest', () => {
    expect(run('starter.json', 42)).toBe(run('starter.json', 42));
  });

  for (const file of ['starter.json', 'offgrid-cabin-family.json', 'suburban-baseline.json']) {
    it(`${file} matches its committed one-year digest`, () => {
      expectDigest(`time:${file}`, run(file, 42));
    });
  }

  it('stepDay never mutates the state it is given', () => {
    const g = gameFor('offgrid-cabin-family.json');
    const before = JSON.stringify(g);
    stepDays(g, catalog, 30);
    expect(JSON.stringify(g)).toBe(before);
  });
});

describe('performance', () => {
  it('simulates one year of a 200-instance design in under 150 ms in Node', () => {
    // Bundle the engine and run it in a child Node process, so the measurement is
    // plain Node rather than code rewritten by the test runner's module transform.
    const dir = mkdtempSync(join(tmpdir(), 'homestead-bench-'));
    const out = join(dir, 'year.mjs');
    buildSync({
      entryPoints: [join(REPO, 'packages/engine/bench/year.ts')],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: out,
      logLevel: 'silent',
    });
    const res = spawnSync(process.execPath, [out, join(REPO, 'designs/offgrid-cabin-family.json')], {
      encoding: 'utf8',
    });
    rmSync(dir, { recursive: true, force: true });
    expect(res.status, res.stderr).toBe(0);
    const { instances, bestMs } = JSON.parse(res.stdout) as { instances: number; bestMs: number };
    console.log(`one year, ${instances} instances: ${bestMs.toFixed(1)} ms (best of 3, plain Node)`);
    expect(instances).toBeGreaterThanOrEqual(190);
    expect(bestMs).toBeLessThan(150);
  });
});
