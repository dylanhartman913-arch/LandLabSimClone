import type { Catalog } from '@homestead/catalog';
import { explained } from '../provenance.ts';
import type { GameState } from '../time/types.ts';
import type { JobId } from '../time/gather.ts';

/** One accounting basis for the HUD and Work panel; legacy ledgers have no byJob. */
export function laborWeek(state: GameState, catalog?: Catalog) {
  const week = state.ledgers.slice(-7);
  const jobs: Partial<Record<JobId, number>> = {};
  let available = 0;
  let worked = 0;
  let paid = 0;
  let maintenance = 0;
  const incomeSystems = new Set(catalog?.flows.filter((f) => f.direction === 'out' && f.resource === 'Capital').map((f) => f.systemId) ?? []);
  for (const l of week) {
    const raw = l.labor.byJob ?? { construction: l.labor.construction, upkeep: l.labor.upkeepDelivered };
    const dayPaid = raw.employment ?? Object.entries(l.laborBySystem).reduce((a, [id, h]) => a + (incomeSystems.has(id) ? h : 0), 0);
    maintenance += Math.max(0, (raw.upkeep ?? 0) - (raw.employment === undefined ? dayPaid : 0));
    // A continued game's seven-day window may contain both ledger formats.
    const byJob = state.settings.employmentPriority && raw.employment === undefined
      ? { ...raw, upkeep: Math.max(0, (raw.upkeep ?? 0) - dayPaid), employment: dayPaid }
      : raw;
    for (const [job, h] of Object.entries(byJob)) {
      jobs[job as JobId] = (jobs[job as JobId] ?? 0) + h;
      worked += h;
    }
    available += l.labor.pool;
    paid += dayPaid;
  }
  return {
    jobs,
    breakdown: {
      employment: explained(paid, 'labor consumed by systems producing income over the last 7 days'),
      maintenance: explained(maintenance, 'daily system work excluding employment over the last 7 days; legacy and separate-employment ledgers reconciled'),
      construction: explained(jobs.construction ?? 0, 'construction work over the last 7 days'),
      gathering: explained(Object.entries(jobs).filter(([job]) => job.startsWith('gather-')).reduce((a, [, h]) => a + h!, 0), 'gathering work including walking and boiling over the last 7 days'),
    },
    worked: explained(worked, 'Σ gathering (including walking and boiling) + construction + system work over the last 7 days', {
      refs: { ...jobs, days: week.length },
    }),
    available: explained(available, 'Σ household labor available over the last 7 days', { refs: { days: week.length } }),
    idle: explained(Math.max(0, available - worked), 'available − worked over the last 7 days', { refs: { available, worked } }),
  };
}
