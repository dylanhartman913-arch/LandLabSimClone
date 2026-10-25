import { readFileSync, writeFileSync } from 'node:fs';
import { catalog, SITES } from '@homestead/catalog';
import { auditGates, auditMarkdown, catalogAudit } from '@homestead/engine';

/** LL-47: regenerate the audit section of docs/CATALOG.md; exit 1 if a gate fails. */
export const AUDIT_START = '<!-- catalog-audit:start -->';
export const AUDIT_END = '<!-- catalog-audit:end -->';
const PATH = 'docs/CATALOG.md';

const audit = catalogAudit(catalog, Object.values(SITES));
const doc = readFileSync(PATH, 'utf8');
const section = `${AUDIT_START}\n${auditMarkdown(catalog, audit, Object.keys(SITES))}${AUDIT_END}`;
const next = doc.includes(AUDIT_START)
  ? doc.slice(0, doc.indexOf(AUDIT_START)) + section + doc.slice(doc.indexOf(AUDIT_END) + AUDIT_END.length)
  : `${doc.trimEnd()}\n\n${section}\n`;
writeFileSync(PATH, next);
const gates = auditGates(catalog, audit);
for (const f of gates.failures) console.error(`catalog:audit: ${f.gate}: ${f.name}`);
for (const s of gates.stale) console.error(`catalog:audit: stale exception: ${s}`);
console.log(`catalog:audit: wrote ${PATH}; ${gates.failures.length} failure(s), ${gates.stale.length} stale exception(s).`);
process.exitCode = gates.failures.length || gates.stale.length ? 1 : 0;
