import { z } from 'zod';

/** Where an effective catalog value came from. */
export const ProvenanceSourceSchema = z.enum(['xlsx', 'override', 'default-rule']);
export type ProvenanceSource = z.infer<typeof ProvenanceSourceSchema>;

export const ResourceClassSchema = z.enum(['Flow', 'Capacity', 'Ambient', 'Service', 'Money']);
export type ResourceClass = z.infer<typeof ResourceClassSchema>;

export const NeedKeySchema = z.enum([
  'Water',
  'Drinking water',
  'Food',
  'Shelter',
  'Sanitation',
  'Electricity',
  'Transportation',
  'Cooking fuel',
  'Heated shelter',
  'Cooled shelter',
  'Est. Required Labor',
]);
export type NeedKey = z.infer<typeof NeedKeySchema>;
export const NEED_KEYS: readonly NeedKey[] = NeedKeySchema.options;

export const PeriodSchema = z.enum([
  'Daily',
  'Weekly',
  'Monthly',
  'Per season',
  'Yearly',
  'One-time',
  'Capacity',
]);
export type Period = z.infer<typeof PeriodSchema>;

export const DirectionSchema = z.enum(['in', 'out']);
export type Direction = z.infer<typeof DirectionSchema>;

/**
 * How an input limits its consumer in time mode.
 * - required: Leontief; output scales with the least-satisfied required input.
 * - capacity: occupied, not used up; satisfaction = available ÷ required.
 * - boost: a yield modifier; output × (1 − weight × (1 − satisfaction)).
 * - ambient: set by site and weather; never depleted.
 * - need: consumed and tracked (checklist, health) but never curtails output (people, shelter heat/cooling).
 */
export const InputRoleSchema = z.enum(['required', 'capacity', 'boost', 'ambient', 'need']);
export type InputRole = z.infer<typeof InputRoleSchema>;

/**
 * A flow quantity. Typed constants come straight from the sheet; every formula
 * in the Flows sheet must match one of the recognized templates.
 */
export const QtyExprSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('const'), value: z.number() }),
  /** Assumptions peak sun hours × 7 (sun-hours per week). */
  z.object({ kind: z.literal('sun') }),
  /** Assumptions annual precipitation ÷ 52 (inches per week). */
  z.object({ kind: z.literal('rain') }),
  /** kw × peak sun hours × 7 × PV derate (kWh per week). */
  z.object({ kind: z.literal('pv'), kw: z.number() }),
  /** kw × 168 × wind capacity factor (kWh per week). */
  z.object({ kind: z.literal('wind'), kw: z.number() }),
  /** kw × 168 × micro-hydro capacity factor (kWh per week). */
  z.object({ kind: z.literal('hydro'), kw: z.number() }),
  /** The system's catchment area (sq ft of Roofing area). */
  z.object({ kind: z.literal('catchArea') }),
  /** catchment × precipitation ÷ 52 × gal per sq ft·in × capture efficiency (gal per week). */
  z.object({ kind: z.literal('rainCapture') }),
  /** conditioned area × heat-loss factor × HDD × 24 ÷ 52 (BTU per week). */
  z.object({ kind: z.literal('heatLoad') }),
  /** conditioned area × heat-loss factor × CDD × 24 ÷ 52 (BTU per week). */
  z.object({ kind: z.literal('coolLoad') }),
]);
export type QtyExpr = z.infer<typeof QtyExprSchema>;

/** When within the year a flow happens (time mode only; balance mode ignores it). */
export const TimingSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('steady') }),
  /** Spread over the site's growing-season days. */
  z.object({ kind: z.literal('growing-season') }),
  /** Spread evenly over ISO-like weeks startWeek..endWeek (1-52, inclusive). */
  z.object({
    kind: z.literal('window'),
    startWeek: z.number().int().min(1).max(52),
    endWeek: z.number().int().min(1).max(52),
  }),
  /** Follows the day's heating degree-days (annual total preserved). */
  z.object({ kind: z.literal('heating') }),
  /** Follows the day's cooling degree-days (annual total preserved). */
  z.object({ kind: z.literal('cooling') }),
]);
export type Timing = z.infer<typeof TimingSchema>;

export const AdjacencyRuleSchema = z.object({
  /** A system ID or `category:<Category>`; the system that projects the effect. */
  from: z.string(),
  /** A system ID or `category:<Category>`; the system that receives the effect. */
  to: z.string(),
  radiusFt: z.number().positive(),
  effect: z.object({
    resource: z.string(),
    /** Per-source multiplier applied to the receiver's flow of `resource`. */
    multiplier: z.number().nonnegative(),
    /** Lower bound on the combined multiplier (e.g. shade floor 0.7). */
    floor: z.number().nonnegative().optional(),
    /** `require`: the receiver's flow only works if a source is in range. */
    mode: z.enum(['scale', 'require']).default('scale'),
    direction: DirectionSchema.default('in'),
  }),
  note: z.string().default(''),
});
export type AdjacencyRule = z.infer<typeof AdjacencyRuleSchema>;

export const StorageRuleSchema = z.object({
  /** The Capacity resource that bounds this stock (e.g. `Water storage`). */
  capacityResource: z.string(),
  /** Extra room that exists without any storage system (e.g. 50 gal of jugs). */
  buffer: z.number().nonnegative(),
  /** How many units of this resource fit in one unit of the capacity resource. */
  unitsPerCapacityUnit: z.number().positive(),
});
export type StorageRule = z.infer<typeof StorageRuleSchema>;

export const ResourceSchema = z.object({
  name: z.string(),
  unit: z.string(),
  class: ResourceClassSchema,
  needsRow: NeedKeySchema.optional(),
  factorToNeed: z.number().optional(),
  note: z.string(),
  // engine-only
  spoilPerWeek: z.number().min(0).max(1),
  storedIn: StorageRuleSchema.nullable(),
  /** False for services that cannot be kept (heat, cooling, labor): unused supply is lost at day end. */
  storable: z.boolean(),
  /**
   * Share of each day's output that daytime loads can use directly without storage (solar power
   * running daytime loads). It serves at most the same share of demand; unused, it is lost.
   */
  directUseShare: z.number().min(0).max(1),
  /** Other resources that can meet a request for this one, in draw order, converted through `factorToNeed`. */
  satisfiedBy: z.array(z.string()),
  provenance: z.record(z.string(), ProvenanceSourceSchema),
});
export type Resource = z.infer<typeof ResourceSchema>;

export const SystemSchema = z.object({
  id: z.string().regex(/^S\d{3,}$/),
  name: z.string(),
  categories: z.array(z.string()).min(1),
  originalTags: z.array(z.string()).optional(),
  source: z.string(),
  description: z.string(),
  costBuy: z.number().nonnegative(),
  costDiy: z.number().nonnegative().optional(),
  setupLaborHrs: z.number().nonnegative(),
  weeklyUpkeepHrs: z.number().nonnegative(),
  footprintSqft: z.number().nonnegative(),
  lifespanYrs: z.number().nonnegative(),
  conditionedAreaSqft: z.number().nonnegative().optional(),
  heatLossFactor: z.number().nonnegative().optional(),
  catchmentSqft: z.number().nonnegative().optional(),
  captureEff: z.number().nonnegative().optional(),
  confidence: z.enum(['low', 'medium', 'high']),
  notes: z.string(),
  starterCount: z.number().int().nonnegative(),
  gameListedInputs: z.string(),
  gameListedOutputs: z.string(),
  // engine-only
  priorityTier: z.number().int().min(0).max(2),
  yearsToFullOutput: z.number().nonnegative(),
  spriteKey: z.string(),
  /** Map layer: `none` (no footprint), `ground` (large plantings others may sit on), `object`. */
  layer: z.enum(['none', 'ground', 'object']),
  provenance: z.record(z.string(), ProvenanceSourceSchema),
});
export type System = z.infer<typeof SystemSchema>;

export const FlowSchema = z.object({
  id: z.string().regex(/^F\d{4,}$/),
  systemId: z.string(),
  direction: DirectionSchema,
  resource: z.string(),
  qty: QtyExprSchema,
  period: PeriodSchema,
  note: z.string(),
  // engine-only
  inputRole: InputRoleSchema.nullable(),
  boostWeight: z.number().min(0).max(1).optional(),
  timing: TimingSchema,
  provenance: z.record(z.string(), ProvenanceSourceSchema),
});
export type Flow = z.infer<typeof FlowSchema>;

export const AssumptionsSchema = z.object({
  hdd: z.number(),
  cdd: z.number(),
  psh: z.number(),
  pvDerate: z.number(),
  precipIn: z.number(),
  galPerSqftIn: z.number(),
  windCf: z.number(),
  hydroCf: z.number(),
  seasonsPerYear: z.number(),
});
export type Assumptions = z.infer<typeof AssumptionsSchema>;
export type AssumptionKey = keyof Assumptions;

export const PeriodRowSchema = z.object({
  period: PeriodSchema,
  /** Occurrences per year, or `seasonsPerYear` to read Assumptions. Capacity has none. */
  timesPerYear: z.union([z.number(), z.literal('seasonsPerYear'), z.null()]),
  /** Weekly factor used when the period has no per-year count (Capacity = 1). */
  fixedWeeklyFactor: z.number().nullable(),
  meaning: z.string(),
});
export type PeriodRow = z.infer<typeof PeriodRowSchema>;

export const CategorySchema = z.object({
  name: z.string(),
  inDropdown: z.boolean(),
  targetRange: z.string(),
  notes: z.string(),
});
export type Category = z.infer<typeof CategorySchema>;

export const CatalogSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({ file: z.string(), sha256: z.string() }),
  assumptions: AssumptionsSchema,
  assumptionNotes: z.record(z.string(), z.object({ label: z.string(), unit: z.string(), note: z.string() })),
  periods: z.array(PeriodRowSchema),
  categories: z.array(CategorySchema),
  resources: z.array(ResourceSchema),
  systems: z.array(SystemSchema),
  flows: z.array(FlowSchema),
  /** Spatial rules (G7). Every rule is from `catalog_overrides.json`. */
  adjacencyRules: z.array(AdjacencyRuleSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;

/** Engine-only fields a user may override. Catalog numbers from the xlsx cannot be overridden. */
export const OverridesSchema = z
  .object({
    version: z.literal(1),
    systems: z.record(
      z.string(),
      z
        .object({
          priorityTier: z.number().int().min(0).max(2).optional(),
          yearsToFullOutput: z.number().nonnegative().optional(),
          spriteKey: z.string().optional(),
          layer: z.enum(['none', 'ground', 'object']).optional(),
        })
        .strict(),
    ),
    resources: z.record(
      z.string(),
      z
        .object({
          spoilPerWeek: z.number().min(0).max(1).optional(),
          storedIn: StorageRuleSchema.nullable().optional(),
          storable: z.boolean().optional(),
          directUseShare: z.number().min(0).max(1).optional(),
          satisfiedBy: z.array(z.string()).optional(),
        })
        .strict(),
    ),
    flows: z
      .record(
        z.string(),
        z
          .object({
            inputRole: InputRoleSchema.optional(),
            boostWeight: z.number().min(0).max(1).optional(),
            timing: TimingSchema.optional(),
            /** Why this override exists (documentation only). */
            note: z.string().optional(),
          })
          .strict(),
      )
      .default({}),
    /** Rules applied to every matching system; checked against system IDs and categories at export. */
    adjacencyRules: z.array(AdjacencyRuleSchema).default([]),
  })
  .strict();
export type Overrides = z.infer<typeof OverridesSchema>;

export const ChecklistGoldenSchema = z.object({
  need: NeedKeySchema,
  unit: z.string(),
  provided: z.number(),
  needed: z.number(),
  pct: z.number(),
  covered: z.string(),
});

export const GoldensSchema = z.object({
  schemaVersion: z.literal(1),
  source: z.object({ file: z.string(), sha256: z.string() }),
  counts: z.record(z.string(), z.number()),
  humans: z.number(),
  overallScore: z.number(),
  checklist: z.array(ChecklistGoldenSchema),
  summary: z.record(z.string(), z.number()),
  resources: z.record(
    z.string(),
    z.object({ produced: z.number(), consumed: z.number(), net: z.number(), status: z.string() }),
  ),
  flows: z.record(
    z.string(),
    z.object({
      qty: z.number(),
      weeklyPerUnit: z.number(),
      count: z.number(),
      weeklyTotal: z.number(),
      contribution: z.number().nullable(),
    }),
  ),
});
export type Goldens = z.infer<typeof GoldensSchema>;

const Monthly = z.array(z.number().nonnegative()).length(12);

/** A climate preset (`data/sites/*.json`). Monthly arrays are shapes; scalars set the annual totals. */
export const SiteSchema = z.object({
  schema: z.literal('homestead.site.v1'),
  id: z.string(),
  name: z.string(),
  description: z.string(),
  latitude: z.number(),
  elevationFt: z.number(),
  assumptions: AssumptionsSchema,
  monthly: z.object({ hdd: Monthly, cdd: Monthly, psh: Monthly, precipIn: Monthly, windCfMult: Monthly }),
  /** 1-based days of year of last spring frost and first fall frost. */
  growingSeason: z.object({
    startDay: z.number().int().min(1).max(365),
    endDay: z.number().int().min(1).max(365),
  }),
  /** Which ambient resources the land supplies with no system placed. */
  ambient: z.record(z.string(), z.boolean()),
  terrain: z.object({
    slopePct: z.number(),
    aspect: z.string(),
    stream: z.object({ points: z.array(z.tuple([z.number(), z.number()])), widthFt: z.number() }).nullable(),
    existingTrees: z.array(z.object({ x: z.number(), y: z.number(), species: z.string() })),
    coordinates: z.string().optional(),
  }),
  notes: z.string(),
});
export type Site = z.infer<typeof SiteSchema>;
