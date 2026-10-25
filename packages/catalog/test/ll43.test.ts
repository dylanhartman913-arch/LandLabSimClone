import { describe, expect, it } from 'vitest';
import { catalog } from '../src/index.ts';
import { LivestockInfrastructureSchema, type Overrides } from '../src/schema.ts';
import { realOverrides, realXlsx, tryExport } from './helpers.ts';

describe('LL-43 livestock infrastructure catalog rules', () => {
  it('rejects invalid batches and rules that do not hatch into the laying hen', () => {
    const r = catalog.livestockInfrastructure!;
    for (const patch of [
      { hatchDays: 0 },
      { incubator: { ...r.incubator, hatchRate: 1.2 } },
      { nestBox: { ...r.nestBox, minDaylightHours: 25 } },
      { paddock: { ...r.paddock, bonus: 0 } },
    ])
      expect(LivestockInfrastructureSchema.safeParse({ ...r, ...patch }).success).toBe(false);
    for (const [patch, problem] of [
      [{ runId: 'S999' }, 'Livestock infrastructure: unknown system S999'],
      [{ chickSystemId: 'S050' }, 'hatched chicks must mature into the laying hen system'],
      [{ henSystemId: 'S051' }, 'hatched chicks must mature into the laying hen system'],
      [{ pastureIds: ['S190'] }, 'pasture S190 must have out Green biomass'],
    ] as const)
      expect(
        tryExport(realXlsx, { ...(realOverrides as Overrides), livestockInfrastructure: { ...r, ...patch } }).error
          ?.message,
      ).toContain(problem);
  });
  it('ships four workbook systems with real one-time lumber and a pasture-hosted kit', () => {
    const r = catalog.livestockInfrastructure!;
    const systems = [r.incubatorId, r.nestBoxId, r.runId, r.paddockId].map(
      (id) => catalog.systems.find((s) => s.id === id)!,
    );
    expect(systems.map((s) => s.name)).toEqual([
      'Egg Incubator (24 eggs)',
      'Broody Hen Nest Box',
      'Predator-Proof Run (12 birds)',
      'Rotational Paddock Kit',
    ]);
    for (const s of systems) expect(s.provenance.costBuy).toBe('xlsx');
    expect(systems[3]!.layer).toBe('none');
    const lumber = (id: string) =>
      catalog.flows.find((f) => f.systemId === id && f.resource === 'Waste lumber')!;
    expect(lumber(r.runId)).toMatchObject({ direction: 'in', period: 'One-time', qty: { kind: 'const', value: 150 } });
    expect(lumber(r.nestBoxId).qty).toEqual({ kind: 'const', value: 10 });
    expect(r.hatchDays).toBe(21);
  });
});
