import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SITES, type Catalog } from '@homestead/catalog';
import { auditGates, auditMarkdown, catalogAudit } from '../src/index.ts';
import { catalog, sysId } from './time-helpers.ts';

const sites = Object.values(SITES);
const audit = catalogAudit(catalog, sites);

describe('LL-47 catalog audit gates', () => {
  it('the shipped catalog passes every gate, with no stale exception', () => {
    const gates = auditGates(catalog, audit);
    expect(gates.failures).toEqual([]);
    expect(gates.stale).toEqual([]);
  });

  it('docs/CATALOG.md publishes the current audit (run `npm run catalog:audit` to refresh)', () => {
    const doc = readFileSync(new URL('../../../docs/CATALOG.md', import.meta.url), 'utf8');
    const start = '<!-- catalog-audit:start -->\n';
    const section = doc.slice(doc.indexOf(start) + start.length, doc.indexOf('<!-- catalog-audit:end -->'));
    expect(section).toBe(auditMarkdown(catalog, audit, Object.keys(SITES)));
  });

  it('a resource that is made but used by nothing fails as a dead end', () => {
    // Coffee grounds are made by Food Waste and used only by the fly larvae and the worm bin.
    const users = new Set([sysId('Black Soldier Fly Protopod (BSF)'), sysId('Vermicompost Bin')]);
    const fixture: Catalog = {
      ...catalog,
      flows: catalog.flows.filter((f) => !(f.resource === 'Coffee grounds' && f.direction === 'in' && users.has(f.systemId))),
    };
    const a = catalogAudit(fixture, sites);
    expect(a.deadEnds).toEqual(['Coffee grounds']);
    expect(auditGates(fixture, a).failures).toContainEqual({ gate: 'dead end', name: 'Coffee grounds' });
  });

  it('a survival input with one non-market source fails unless a reviewed exception covers it', () => {
    expect(audit.survivalInputs.find((s) => s.resource === 'Chicken feed')!.nonMarketSources).toBe(1);
    const bare: Catalog = { ...catalog, auditExceptions: { deadEnds: [], fragileSurvivalInputs: [], unsuppliableSystems: [] } };
    const failed = auditGates(bare, audit).failures.filter((f) => f.gate === 'fragile survival input').map((f) => f.name);
    expect(failed).toEqual(audit.fragile);
    expect(failed).toContain('Chicken feed');
    // Drinking water's inputs all have two or more home sources.
    expect(audit.survivalInputs.find((s) => s.resource === 'Water')!.nonMarketSources).toBeGreaterThanOrEqual(2);
  });

  it('an exception that is no longer needed fails as stale', () => {
    const ex = catalog.auditExceptions!;
    const padded: Catalog = {
      ...catalog,
      auditExceptions: { ...ex, fragileSurvivalInputs: [...ex.fragileSurvivalInputs, { name: 'Water', reason: 'pretend water had one source' }] },
    };
    expect(auditGates(padded, audit).stale).toEqual(['fragile survival input: Water']);
  });

  it('a system whose input has no source at any site fails; a stream-only system passes where there is a stream', () => {
    const chipper = sysId('Wood Chipper');
    const fixture: Catalog = { ...catalog, flows: catalog.flows.filter((f) => !(f.systemId === chipper && f.resource === 'Wood chips')) };
    const a = catalogAudit(fixture, sites);
    expect(a.unsuppliable.sort()).toEqual(['Biochar Double Barrel Retort', 'Pellet Mill (small)']);
    const hydro = audit.systems.find((s) => s.name === 'Micro-Hydro Turbine (500 W)')!;
    expect(hydro.sites.map((s) => s.missing)).toEqual([['Stream flow'], ['Stream flow'], [], ['Stream flow'], [], ['Stream flow']]);
  });
});
