import { createHash } from 'node:crypto';
import type { WorkBook } from 'xlsx';
import {
  CatalogSchema,
  GoldensSchema,
  NEED_KEYS,
  OverridesSchema,
  PeriodSchema,
  ResourceClassSchema,
  type AdjacencyRule,
  type AssumptionKey,
  type Assumptions,
  type Catalog,
  type Category,
  type Flow,
  type Goldens,
  type NeedKey,
  type Overrides,
  type Period,
  type PeriodRow,
  type ProvenanceSource,
  type QtyExpr,
  type Resource,
  type System,
} from '../schema.ts';
import { evalQtyExpr } from '../qty.ts';
import { CatalogExportError } from './errors.ts';
import { recognizeFormula } from './formulas.ts';
import {
  DEFAULT_DELIVERY,
  DEFAULT_DIRECT_USE,
  DEFAULT_SPOIL_PER_WEEK,
  defaultInputRole,
  defaultLayer,
  defaultPriorityTier,
  NON_STORABLE,
  defaultStorage,
  defaultTiming,
  defaultYearsToFullOutput,
} from './defaults.ts';
import {
  cellAt,
  getSheet,
  num,
  readTable,
  readWorkbook,
  requireHeaders,
  str,
  type Table,
} from './workbook.ts';

export interface ExportResult {
  catalog: Catalog;
  goldens: Goldens;
}

export interface ExportInput {
  xlsx: Uint8Array;
  /** File name recorded in the output (not a path, so output is machine-independent). */
  xlsxName: string;
  overrides: unknown;
}

const ASSUMPTION_LABELS: Record<string, AssumptionKey> = {
  'Heating degree-days': 'hdd',
  'Cooling degree-days': 'cdd',
  'Peak sun hours': 'psh',
  'PV system derate': 'pvDerate',
  'Annual precipitation': 'precipIn',
  'Gallons per sq ft per inch of rain': 'galPerSqftIn',
  'Small wind capacity factor': 'windCf',
  'Micro-hydro capacity factor': 'hydroCf',
  'Growing seasons per year': 'seasonsPerYear',
};

const SUMMARY_LABELS: Record<string, string> = {
  Humans: 'humans',
  'Systems placed (excluding people and site)': 'systemsPlaced',
  'Overall off-grid score': 'overallScore',
  'Purchase cost (ready-made)': 'costBuy',
  'Cheapest build cost': 'costCheapest',
  'Setup labor': 'setupLaborHrs',
  'Labor available per week': 'laborAvailable',
  'Labor required per week': 'laborRequired',
  'Land available': 'landAvailable',
  'Land used by footprints': 'landUsed',
  'Land used (% of available)': 'landUsedPct',
  'Water storage': 'waterStorage',
  'Days of water in storage': 'waterDays',
  'Battery storage': 'batteryStorage',
  'Days of electricity in batteries': 'batteryDays',
  'Food storage': 'foodStorage',
  'Capital in per week': 'capitalIn',
  'Capital out per week': 'capitalOut',
  'Net capital per week': 'capitalNet',
  'Wellbeing points per week': 'wellbeing',
  'Resources in deficit': 'deficitCount',
};

const DIRECTION: Record<string, 'in' | 'out'> = { Input: 'in', Output: 'out' };

function splitList(s: string): string[] {
  return s
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean);
}

function sha256(data: Uint8Array): string {
  return createHash('sha256').update(data).digest('hex');
}

function relClose(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}

// ---------------------------------------------------------------------------

function readAssumptions(wb: WorkBook, problems: string[]) {
  const sheet = getSheet(wb, 'Assumptions');
  const values: Partial<Assumptions> = {};
  const at: Record<string, AssumptionKey> = {};
  const notes: Catalog['assumptionNotes'] = {};
  const periods: PeriodRow[] = [];
  let inPeriods = false;
  for (let r = 1; r <= 200; r++) {
    const label = str(cellAt(sheet, `B${r}`));
    if (!label) continue;
    if (label === 'Period') {
      inPeriods = true;
      continue;
    }
    if (inPeriods) {
      const parsed = PeriodSchema.safeParse(label);
      if (!parsed.success) {
        problems.push(`Assumptions!B${r}: unknown period "${label}"`);
        continue;
      }
      const times = cellAt(sheet, `C${r}`);
      const factor = num(cellAt(sheet, `D${r}`));
      let timesPerYear: PeriodRow['timesPerYear'];
      if (times.f && /^Assumptions!\$C\$\d+$/.test(times.f)) {
        const key = at[times.f.replace(/^Assumptions!\$C\$/, 'C')];
        if (key !== 'seasonsPerYear') problems.push(`Assumptions!C${r}: period count refers to ${times.f}`);
        timesPerYear = 'seasonsPerYear';
      } else if (typeof times.v === 'number') {
        timesPerYear = times.v;
      } else {
        timesPerYear = null;
      }
      periods.push({
        period: parsed.data,
        timesPerYear,
        fixedWeeklyFactor: timesPerYear === null ? (factor ?? null) : null,
        meaning: str(cellAt(sheet, `E${r}`)),
      });
      continue;
    }
    const key = ASSUMPTION_LABELS[label];
    if (!key) continue;
    const v = num(cellAt(sheet, `C${r}`));
    if (v === undefined) {
      problems.push(`Assumptions!C${r}: "${label}" has no numeric value`);
      continue;
    }
    values[key] = v;
    at[`C${r}`] = key;
    notes[key] = { label, unit: str(cellAt(sheet, `D${r}`)), note: str(cellAt(sheet, `E${r}`)) };
  }
  for (const k of Object.values(ASSUMPTION_LABELS)) {
    if (values[k] === undefined) problems.push(`Assumptions: missing "${k}"`);
  }
  for (const p of PeriodSchema.options) {
    if (!periods.some((x) => x.period === p))
      problems.push(`Assumptions: period table has no row for "${p}"`);
  }
  return { assumptions: values as Assumptions, at, notes, periods };
}

function readCategories(wb: WorkBook): Category[] {
  const t = readTable(wb, 'Categories');
  requireHeaders(t, ['Category', 'In game dropdown?', 'Target range']);
  return t.rows.map((r) => ({
    name: str(r.cells['Category']),
    inDropdown: str(r.cells['In game dropdown?']).toLowerCase() === 'yes',
    targetRange: str(r.cells['Target range']),
    notes: str(r.cells['Notes']),
  }));
}

function readResources(t: Table, problems: string[]) {
  requireHeaders(t, [
    'Resource',
    'Unit',
    'Class',
    'Needs Checklist row',
    'Factor to checklist unit',
    'Notes',
  ]);
  const out: Omit<
    Resource,
    | 'spoilPerWeek'
    | 'storedIn'
    | 'storable'
    | 'directUseShare'
    | 'satisfiedBy'
    | 'deliversTo'
    | 'deliveryRadiusFt'
    | 'marketPrice'
    | 'marketUnit'
    | 'marketAvailable'
    | 'provenance'
  >[] = [];
  const seen = new Set<string>();
  for (const r of t.rows) {
    const name = str(r.cells['Resource']);
    if (seen.has(name)) problems.push(`Resources row ${r.rowNumber}: duplicate resource "${name}"`);
    seen.add(name);
    const cls = ResourceClassSchema.safeParse(str(r.cells['Class']));
    if (!cls.success) {
      problems.push(`Resources row ${r.rowNumber}: "${name}" has unknown class "${str(r.cells['Class'])}"`);
      continue;
    }
    const needs = str(r.cells['Needs Checklist row']);
    const res: (typeof out)[number] = {
      name,
      unit: str(r.cells['Unit']),
      class: cls.data,
      note: str(r.cells['Notes']),
    };
    if (needs) {
      if (!(NEED_KEYS as readonly string[]).includes(needs)) {
        problems.push(`Resources row ${r.rowNumber}: "${name}" maps to unknown checklist row "${needs}"`);
      } else {
        res.needsRow = needs as NeedKey;
        const factor = num(r.cells['Factor to checklist unit']);
        if (factor === undefined)
          problems.push(`Resources row ${r.rowNumber}: "${name}" has a checklist row but no factor`);
        else res.factorToNeed = factor;
      }
    }
    out.push(res);
  }
  return out;
}

const SYSTEM_HEADERS = [
  'System ID',
  'System',
  'Categories',
  'Original game tags',
  'Source',
  'Description',
  'Purchase cost ($)',
  'DIY cost ($)',
  'Setup labor (hrs)',
  'Weekly upkeep (hrs)',
  'Footprint (sq ft)',
  'Lifespan (yrs)',
  'Conditioned area (sq ft)',
  'Heat-loss factor (BTU/hr·°F per sq ft)',
  'Catchment area (sq ft)',
  'Capture efficiency',
  'Count in design',
  'Game-listed inputs',
  'Game-listed outputs',
  'Confidence',
  'Notes',
];

type RawSystem = Omit<
  System,
  | 'priorityTier'
  | 'yearsToFullOutput'
  | 'spriteKey'
  | 'layer'
  | 'outdoor'
  | 'backstop'
  | 'backstopFee'
  | 'backstopPrices'
  | 'provenance'
>;

function readSystems(t: Table, categories: Category[], problems: string[]): RawSystem[] {
  requireHeaders(t, SYSTEM_HEADERS);
  const catNames = new Set(categories.map((c) => c.name));
  const names = new Map<string, number>();
  const ids = new Map<string, number>();
  const out: RawSystem[] = [];
  for (const r of t.rows) {
    const c = r.cells;
    const id = str(c['System ID']);
    const name = str(c['System']);
    const where = `Systems row ${r.rowNumber} (${id} "${name}")`;
    if (names.has(name)) problems.push(`${where}: duplicate system name (also row ${names.get(name)})`);
    if (ids.has(id)) problems.push(`${where}: duplicate system ID (also row ${ids.get(id)})`);
    names.set(name, r.rowNumber);
    ids.set(id, r.rowNumber);
    const categoriesList = splitList(str(c['Categories']));
    if (categoriesList.length === 0) problems.push(`${where}: no categories`);
    for (const cat of categoriesList) {
      if (!catNames.has(cat)) problems.push(`${where}: category "${cat}" is not in the Categories sheet`);
    }
    const n = (h: string, required = true): number | undefined => {
      const v = num(c[h]);
      if (v === undefined && required) problems.push(`${where}: "${h}" is not a number`);
      if (v !== undefined && v < 0) problems.push(`${where}: "${h}" is negative (${v})`);
      return v;
    };
    const confidence = str(c['Confidence']).toLowerCase();
    if (!['low', 'medium', 'high'].includes(confidence)) {
      problems.push(`${where}: confidence "${confidence}" is not low/medium/high`);
    }
    const sys: RawSystem = {
      id,
      name,
      categories: categoriesList,
      source: str(c['Source']),
      description: str(c['Description']),
      costBuy: n('Purchase cost ($)') ?? 0,
      setupLaborHrs: n('Setup labor (hrs)') ?? 0,
      weeklyUpkeepHrs: n('Weekly upkeep (hrs)') ?? 0,
      footprintSqft: n('Footprint (sq ft)') ?? 0,
      lifespanYrs: n('Lifespan (yrs)') ?? 0,
      confidence: confidence as System['confidence'],
      notes: str(c['Notes']),
      starterCount: n('Count in design') ?? 0,
      gameListedInputs: str(c['Game-listed inputs']),
      gameListedOutputs: str(c['Game-listed outputs']),
    };
    const tags = splitList(str(c['Original game tags']));
    if (tags.length) sys.originalTags = tags;
    const optional: [keyof RawSystem, string][] = [
      ['costDiy', 'DIY cost ($)'],
      ['conditionedAreaSqft', 'Conditioned area (sq ft)'],
      ['heatLossFactor', 'Heat-loss factor (BTU/hr·°F per sq ft)'],
      ['catchmentSqft', 'Catchment area (sq ft)'],
      ['captureEff', 'Capture efficiency'],
    ];
    for (const [key, header] of optional) {
      const v = n(header, false);
      if (v !== undefined) (sys as Record<string, unknown>)[key] = v;
    }
    out.push(sys);
  }
  return out;
}

const FLOW_HEADERS = [
  'Flow ID',
  'System',
  'Direction',
  'Resource',
  'Qty per period',
  'Unit',
  'Period',
  'Weekly equivalent (per unit)',
  'Count in design',
  'Weekly total (design)',
  'Needs Checklist row',
  'Contribution to need',
  'Notes',
];

type RawFlow = Omit<Flow, 'inputRole' | 'boostWeight' | 'timing' | 'provenance'>;

function readFlows(
  t: Table,
  systems: RawSystem[],
  resources: ReturnType<typeof readResources>,
  assumptions: Assumptions,
  at: Record<string, AssumptionKey>,
  systemsTable: Table,
  problems: string[],
): { flows: RawFlow[]; cached: Goldens['flows'] } {
  requireHeaders(t, FLOW_HEADERS);
  const sysByName = new Map(systems.map((s) => [s.name, s]));
  const resByName = new Map(resources.map((r) => [r.name, r]));
  const cols = systemsTable.columns;
  const systemCols = {
    name: cols['System']!,
    area: cols['Conditioned area (sq ft)']!,
    lossFactor: cols['Heat-loss factor (BTU/hr·°F per sq ft)']!,
    catchment: cols['Catchment area (sq ft)']!,
    captureEff: cols['Capture efficiency']!,
  };
  const flows: RawFlow[] = [];
  const cached: Goldens['flows'] = {};
  const ids = new Set<string>();
  for (const r of t.rows) {
    const c = r.cells;
    const id = str(c['Flow ID']);
    const sysName = str(c['System']);
    const resName = str(c['Resource']);
    const where = `Flows row ${r.rowNumber} (${id})`;
    if (ids.has(id)) problems.push(`${where}: duplicate flow ID`);
    ids.add(id);
    const sys = sysByName.get(sysName);
    if (!sys) problems.push(`${where}: unknown system "${sysName}"`);
    const res = resByName.get(resName);
    if (!res) problems.push(`${where}: unknown resource "${resName}"`);
    const direction = DIRECTION[str(c['Direction'])];
    if (!direction) problems.push(`${where}: direction "${str(c['Direction'])}" is not Input or Output`);
    const period = PeriodSchema.safeParse(str(c['Period']));
    if (!period.success) problems.push(`${where}: unknown period "${str(c['Period'])}"`);
    if (res && period.success) {
      const p = period.data;
      if (res.class === 'Capacity' && p !== 'Capacity') {
        problems.push(`${where}: ${res.class} resource "${resName}" must use period Capacity, not ${p}`);
      }
      if ((res.class === 'Flow' || res.class === 'Ambient' || res.class === 'Money') && p === 'Capacity') {
        problems.push(`${where}: ${res.class} resource "${resName}" cannot use period Capacity`);
      }
    }
    const qtyCell = c['Qty per period']!;
    let qty: QtyExpr | undefined;
    if (qtyCell.f) {
      const rec = recognizeFormula(qtyCell.f, { rowNumber: r.rowNumber, assumptionAt: at, systemCols });
      if (rec.ok) qty = rec.qty;
      else problems.push(`${where}: formula "=${qtyCell.f}" ${rec.reason}`);
    } else {
      const v = num(qtyCell);
      if (v === undefined) problems.push(`${where}: quantity "${String(qtyCell.v)}" is not a number`);
      else qty = { kind: 'const', value: v };
    }
    if (qty && qty.kind === 'const' && qty.value < 0)
      problems.push(`${where}: negative quantity ${qty.value}`);
    if (qty && sys) {
      const evaluated = evalQtyExpr(qty, sys, assumptions);
      const cachedQty = num(qtyCell);
      if (evaluated < 0) problems.push(`${where}: quantity evaluates negative (${evaluated})`);
      if (cachedQty !== undefined && !relClose(evaluated, cachedQty)) {
        problems.push(`${where}: quantity evaluates to ${evaluated} but the sheet cached ${cachedQty}`);
      }
    }
    const unit = str(c['Unit']);
    if (res && unit && unit !== res.unit) {
      problems.push(`${where}: unit "${unit}" disagrees with Resources unit "${res.unit}" for ${resName}`);
    }
    if (!sys || !res || !direction || !period.success || !qty) continue;
    flows.push({
      id,
      systemId: sys.id,
      direction,
      resource: resName,
      qty,
      period: period.data,
      note: str(c['Notes']),
    });
    const contribution = c['Contribution to need'];
    cached[id] = {
      qty: num(qtyCell) ?? 0,
      weeklyPerUnit: num(c['Weekly equivalent (per unit)']) ?? 0,
      count: num(c['Count in design']) ?? 0,
      weeklyTotal: num(c['Weekly total (design)']) ?? 0,
      contribution: contribution && typeof contribution.v === 'number' ? contribution.v : null,
    };
  }
  return { flows, cached };
}

function checkLaborUpkeep(
  systems: RawSystem[],
  flows: RawFlow[],
  periods: PeriodRow[],
  assumptions: Assumptions,
  problems: string[],
) {
  const weekly = (p: Period) => {
    const row = periods.find((x) => x.period === p)!;
    if (row.timesPerYear === null) return row.fixedWeeklyFactor ?? 0;
    const times = row.timesPerYear === 'seasonsPerYear' ? assumptions.seasonsPerYear : row.timesPerYear;
    return times / 52;
  };
  for (const s of systems) {
    if (s.weeklyUpkeepHrs <= 0) continue;
    const labor = flows.filter((f) => f.systemId === s.id && f.resource === 'Labor' && f.direction === 'in');
    const hrs = labor.reduce((a, f) => a + evalQtyExpr(f.qty, s, assumptions) * weekly(f.period), 0);
    if (hrs + 1e-9 < s.weeklyUpkeepHrs) {
      problems.push(
        `System ${s.id} "${s.name}": weekly upkeep is ${s.weeklyUpkeepHrs} h (Systems column K) but its Labor inputs total ${hrs} h/week`,
      );
    }
  }
}

// ---------------------------------------------------------------------------

function applyEngineFields(
  rawSystems: RawSystem[],
  rawResources: ReturnType<typeof readResources>,
  rawFlows: RawFlow[],
  overrides: Overrides,
  problems: string[],
) {
  const sysIds = new Set(rawSystems.map((s) => s.id));
  const resNames = new Set(rawResources.map((r) => r.name));
  const flowIds = new Set(rawFlows.map((f) => f.id));
  for (const k of Object.keys(overrides.systems)) {
    if (!sysIds.has(k)) problems.push(`catalog_overrides.json: systems.${k} is not a system ID`);
  }
  for (const k of Object.keys(overrides.resources)) {
    if (!resNames.has(k)) problems.push(`catalog_overrides.json: resources."${k}" is not a resource`);
  }
  for (const k of Object.keys(overrides.flows)) {
    if (!flowIds.has(k)) problems.push(`catalog_overrides.json: flows.${k} is not a flow ID`);
  }

  const systems: System[] = rawSystems.map((s) => {
    const o = overrides.systems[s.id] ?? {};
    const provenance: Record<string, ProvenanceSource> = {};
    for (const k of Object.keys(s)) provenance[k] = 'xlsx';
    const pick = <T>(key: string, ov: T | undefined, def: T): T => {
      provenance[key] = ov !== undefined ? 'override' : 'default-rule';
      return ov !== undefined ? ov : def;
    };
    return {
      ...s,
      priorityTier: pick('priorityTier', o.priorityTier, defaultPriorityTier(s.name, s.categories)),
      yearsToFullOutput: pick(
        'yearsToFullOutput',
        o.yearsToFullOutput,
        defaultYearsToFullOutput(s.name, s.categories),
      ),
      spriteKey: pick('spriteKey', o.spriteKey, `system:${s.id}`),
      layer: pick('layer', o.layer, defaultLayer(s.footprintSqft, s.categories)),
      outdoor: pick('outdoor', o.outdoor, false),
      backstop: pick('backstop', o.backstop, false),
      backstopFee: pick('backstopFee', o.backstopFee, 0),
      backstopPrices: pick('backstopPrices', o.backstopPrices, {}),
      provenance,
    };
  });

  const resources: Resource[] = rawResources.map((r) => {
    const o = overrides.resources[r.name] ?? {};
    const provenance: Record<string, ProvenanceSource> = {};
    for (const k of Object.keys(r)) provenance[k] = 'xlsx';
    provenance.spoilPerWeek = o.spoilPerWeek !== undefined ? 'override' : 'default-rule';
    provenance.storedIn = o.storedIn !== undefined ? 'override' : 'default-rule';
    provenance.storable = o.storable !== undefined ? 'override' : 'default-rule';
    provenance.satisfiedBy = o.satisfiedBy !== undefined ? 'override' : 'default-rule';
    provenance.directUseShare = o.directUseShare !== undefined ? 'override' : 'default-rule';
    provenance.deliversTo = o.deliversTo !== undefined ? 'override' : 'default-rule';
    provenance.deliveryRadiusFt = o.deliveryRadiusFt !== undefined ? 'override' : 'default-rule';
    provenance.marketPrice = o.marketPrice !== undefined ? 'override' : 'default-rule';
    provenance.marketUnit = o.marketUnit !== undefined ? 'override' : 'default-rule';
    provenance.marketAvailable = o.marketAvailable !== undefined ? 'override' : 'default-rule';
    if (o.marketUnit !== undefined && o.marketUnit !== `$/${r.unit}`)
      problems.push(`catalog_overrides.json: resources."${r.name}".marketUnit "${o.marketUnit}" must be "$/${r.unit}"`);
    const delivery = DEFAULT_DELIVERY[r.name];
    return {
      ...r,
      spoilPerWeek: o.spoilPerWeek ?? DEFAULT_SPOIL_PER_WEEK[r.name] ?? 0,
      storedIn: o.storedIn !== undefined ? o.storedIn : defaultStorage(r.name, r.needsRow),
      storable: o.storable ?? (r.class === 'Flow' || r.class === 'Money' ? !NON_STORABLE.has(r.name) : false),
      directUseShare: o.directUseShare ?? DEFAULT_DIRECT_USE[r.name] ?? 0,
      satisfiedBy: o.satisfiedBy ?? [],
      deliversTo: o.deliversTo ?? delivery?.deliversTo ?? 'any',
      deliveryRadiusFt: o.deliveryRadiusFt ?? delivery?.radiusFt ?? 0,
      marketPrice: o.marketPrice ?? null,
      marketUnit: o.marketUnit ?? null,
      marketAvailable: o.marketAvailable ?? o.marketPrice !== undefined,
      provenance,
    };
  });
  // A request for Food (kcal) can be met from any food-family stock, most perishable first.
  const food = resources.find((r) => r.name === 'Food');
  if (food && food.provenance.satisfiedBy === 'default-rule') {
    food.satisfiedBy = resources
      .filter((r) => r.needsRow === 'Food' && r.name !== 'Food')
      .sort((a, b) => b.spoilPerWeek - a.spoilPerWeek || a.name.localeCompare(b.name))
      .map((r) => r.name)
      .concat('Food');
  }
  for (const r of resources) {
    for (const sub of r.satisfiedBy) {
      const other = resources.find((x) => x.name === sub);
      if (!other) problems.push(`Resource "${r.name}": satisfiedBy "${sub}" is not a resource`);
      else if (sub !== r.name && (other.factorToNeed === undefined || other.needsRow !== r.needsRow)) {
        problems.push(
          `Resource "${r.name}": satisfiedBy "${sub}" must feed the same checklist row with a factor`,
        );
      }
    }
  }
  const resClass = new Map(resources.map((r) => [r.name, r.class]));
  for (const r of resources) {
    if (r.storedIn && resClass.get(r.storedIn.capacityResource) !== 'Capacity') {
      problems.push(
        `Resource "${r.name}": storedIn "${r.storedIn.capacityResource}" is not a Capacity resource`,
      );
    }
  }

  const sysById = new Map(rawSystems.map((s) => [s.id, s]));
  const outputsBySystem = new Map<string, Set<string>>();
  for (const f of rawFlows) {
    if (f.direction !== 'out') continue;
    const set = outputsBySystem.get(f.systemId) ?? new Set<string>();
    set.add(f.resource);
    outputsBySystem.set(f.systemId, set);
  }
  const foodFamily = new Set(resources.filter((r) => r.needsRow === 'Food').map((r) => r.name));
  const flows: Flow[] = rawFlows.map((f) => {
    const o = overrides.flows[f.id] ?? {};
    const sys = sysById.get(f.systemId)!;
    const provenance: Record<string, ProvenanceSource> = {};
    for (const k of Object.keys(f)) provenance[k] = 'xlsx';
    const flow: Flow = { ...f, inputRole: null, timing: { kind: 'steady' }, provenance };
    if (f.direction === 'in') {
      const def = defaultInputRole(f.resource, resClass.get(f.resource)!, sys.name);
      flow.inputRole = o.inputRole ?? def.role;
      provenance.inputRole = o.inputRole ? 'override' : 'default-rule';
      if (flow.inputRole === 'boost') {
        flow.boostWeight = o.boostWeight ?? def.boostWeight ?? 0.15;
        provenance.boostWeight = o.boostWeight !== undefined ? 'override' : 'default-rule';
      }
    }
    flow.timing =
      o.timing ??
      defaultTiming(f.period, f.direction, f.resource, {
        systemName: sys.name,
        categories: sys.categories,
        outputs: outputsBySystem.get(f.systemId) ?? new Set(),
        isFood: (r) => foodFamily.has(r),
      });
    provenance.timing = o.timing ? 'override' : 'default-rule';
    return flow;
  });

  // G15 modifiers become adjacency rules (scope host: on the receiver; parcel: anywhere).
  const modifierRules: AdjacencyRule[] = [];
  for (const [id, o] of Object.entries(overrides.systems)) {
    for (const m of o.modifies ?? []) {
      modifierRules.push({
        from: id,
        to: m.to,
        radiusFt: 0,
        scope: m.scope,
        effect: { resource: m.resource, multiplier: m.multiplier, mode: 'scale', direction: m.direction, stack: 'once' },
        note: m.note,
      });
    }
  }
  const adjacencyRules: AdjacencyRule[] = [...overrides.adjacencyRules, ...modifierRules];
  const catNames = new Set(rawSystems.flatMap((s) => s.categories));
  for (const rule of adjacencyRules) {
    for (const end of [rule.from, rule.to]) {
      const ok = end.startsWith('category:')
        ? catNames.has(end.slice(9))
        : end === 'terrain:tree' || sysIds.has(end);
      if (!ok)
        problems.push(`catalog_overrides.json: adjacency endpoint "${end}" is not a system ID or category`);
    }
    if (!resNames.has(rule.effect.resource)) {
      problems.push(`catalog_overrides.json: adjacency resource "${rule.effect.resource}" is not a resource`);
    }
  }
  const assignedCapacities = overrides.assignedCapacities;
  for (const a of assignedCapacities) {
    if (resClass.get(a.resource) !== 'Capacity') {
      problems.push(`catalog_overrides.json: assigned capacity "${a.resource}" is not a Capacity resource`);
    }
  }
  const terrainRules = overrides.terrainRules;
  for (const t of terrainRules) {
    if (!sysIds.has(t.to))
      problems.push(`catalog_overrides.json: terrain rule target "${t.to}" is not a system ID`);
    if (!resNames.has(t.resource))
      problems.push(`catalog_overrides.json: terrain rule resource "${t.resource}" is not a resource`);
  }
  // Backstops (G12): every sold output needs a price. Default: the market price; failing that,
  // for the system's first Flow output, its weekly bill (Capital in, less the fee) ÷ that output.
  const resByName = new Map(resources.map((r) => [r.name, r]));
  for (const sys of systems) {
    if (!sys.backstop) {
      if (Object.keys(sys.backstopPrices).length || sys.backstopFee)
        problems.push(`catalog_overrides.json: systems.${sys.id} has backstop prices or a fee but is not a backstop`);
      continue;
    }
    const own = flows.filter((f) => f.systemId === sys.id);
    const outs = own.filter((f) => f.direction === 'out' && resByName.get(f.resource)?.class === 'Flow');
    for (const r of Object.keys(sys.backstopPrices)) {
      if (!outs.some((f) => f.resource === r))
        problems.push(`catalog_overrides.json: systems.${sys.id}.backstopPrices."${r}" is not one of its outputs`);
    }
    const prices: Record<string, number> = { ...sys.backstopPrices };
    for (const f of outs) {
      if (prices[f.resource] !== undefined) continue;
      const market = resByName.get(f.resource)?.marketPrice;
      if (market !== null && market !== undefined) prices[f.resource] = market;
    }
    if (!Object.keys(prices).length && outs[0]) {
      const capital = own.find((f) => f.direction === 'in' && f.resource === 'Capital');
      const first = outs[0];
      if (capital?.qty.kind === 'const' && first.qty.kind === 'const' && capital.period === first.period && first.qty.value > 0)
        prices[first.resource] = Math.max(0, capital.qty.value - sys.backstopFee * (first.period === 'Weekly' ? 1 : 0)) / first.qty.value;
    }
    if (!Object.keys(prices).length)
      problems.push(`catalog_overrides.json: backstop ${sys.id} (${sys.name}) sells nothing: give it backstopPrices`);
    if (Object.keys(prices).length !== Object.keys(sys.backstopPrices).length) sys.provenance.backstopPrices = 'default-rule';
    sys.backstopPrices = prices;
  }

  return { systems, resources, flows, adjacencyRules, assignedCapacities, terrainRules };
}

// ---------------------------------------------------------------------------

function readGoldens(wb: WorkBook, systems: RawSystem[], problems: string[]) {
  const nc = getSheet(wb, 'Needs Checklist');
  const humans = num(cellAt(nc, 'B2')) ?? NaN;
  const overallScore = num(cellAt(nc, 'B3')) ?? NaN;
  const checklist: Goldens['checklist'] = [];
  for (let r = 6; r <= 40; r++) {
    const need = str(cellAt(nc, `A${r}`));
    if (!need) break;
    if (!(NEED_KEYS as readonly string[]).includes(need)) {
      problems.push(`Needs Checklist!A${r}: unknown need "${need}"`);
      continue;
    }
    checklist.push({
      need: need as NeedKey,
      unit: str(cellAt(nc, `B${r}`)),
      provided: num(cellAt(nc, `C${r}`)) ?? NaN,
      needed: num(cellAt(nc, `D${r}`)) ?? NaN,
      pct: num(cellAt(nc, `E${r}`)) ?? NaN,
      covered: str(cellAt(nc, `F${r}`)),
    });
  }
  if (checklist.length !== NEED_KEYS.length) {
    problems.push(`Needs Checklist: found ${checklist.length} rows, expected ${NEED_KEYS.length}`);
  }

  const ds = readTable(wb, 'Design Summary', 4);
  requireHeaders(ds, ['Metric', 'Value']);
  const summary: Record<string, number> = {};
  for (const r of ds.rows) {
    const label = str(r.cells['Metric']);
    const key = SUMMARY_LABELS[label];
    if (!key) {
      problems.push(`Design Summary row ${r.rowNumber}: unknown metric "${label}"`);
      continue;
    }
    summary[key] = num(r.cells['Value']) ?? NaN;
  }

  const rt = readTable(wb, 'Resources');
  const resources: Goldens['resources'] = {};
  for (const r of rt.rows) {
    resources[str(r.cells['Resource'])] = {
      produced: num(r.cells['Produced per week (design)']) ?? NaN,
      consumed: num(r.cells['Consumed per week (design)']) ?? NaN,
      net: num(r.cells['Net per week (design)']) ?? NaN,
      status: str(r.cells['Balance in design']),
    };
  }

  const counts: Record<string, number> = {};
  for (const s of systems) if (s.starterCount > 0) counts[s.id] = s.starterCount;
  return { humans, overallScore, checklist, summary, resources, counts };
}

// ---------------------------------------------------------------------------

/** Parse the workbook, validate it, merge overrides, and return catalog + goldens. */
export function exportCatalog(input: ExportInput): ExportResult {
  const problems: string[] = [];
  const overridesParsed = OverridesSchema.safeParse(input.overrides);
  if (!overridesParsed.success) {
    throw new CatalogExportError(
      overridesParsed.error.issues.map((i) => `catalog_overrides.json: ${i.path.join('.')}: ${i.message}`),
    );
  }
  const wb = readWorkbook(input.xlsx);
  for (const s of ['README', 'Matrix']) getSheet(wb, s); // required even though they carry no model data

  const { assumptions, at, notes, periods } = readAssumptions(wb, problems);
  const categories = readCategories(wb);
  const resourcesTable = readTable(wb, 'Resources');
  const rawResources = readResources(resourcesTable, problems);
  const systemsTable = readTable(wb, 'Systems');
  const rawSystems = readSystems(systemsTable, categories, problems);
  const flowsTable = readTable(wb, 'Flows');
  const { flows: rawFlows, cached } = readFlows(
    flowsTable,
    rawSystems,
    rawResources,
    assumptions,
    at,
    systemsTable,
    problems,
  );
  checkLaborUpkeep(rawSystems, rawFlows, periods, assumptions, problems);
  const merged = applyEngineFields(rawSystems, rawResources, rawFlows, overridesParsed.data, problems);
  const g = readGoldens(wb, rawSystems, problems);

  if (problems.length) throw new CatalogExportError(problems);

  const source = { file: input.xlsxName, sha256: sha256(input.xlsx) };
  const catalog = CatalogSchema.parse({
    schemaVersion: 1,
    source,
    assumptions,
    assumptionNotes: notes,
    periods,
    categories,
    resources: merged.resources,
    systems: merged.systems,
    flows: merged.flows,
    adjacencyRules: merged.adjacencyRules,
    assignedCapacities: merged.assignedCapacities,
    terrainRules: merged.terrainRules,
  });
  const goldens = GoldensSchema.parse({ schemaVersion: 1, source, ...g, flows: cached });
  return { catalog, goldens };
}
