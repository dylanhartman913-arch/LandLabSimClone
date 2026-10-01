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
  /**
   * What projects the effect: a system ID, `category:<Category>`, or `terrain:tree`
   * (the site's existing trees, which the player cannot move).
   */
  from: z.string(),
  /** A system ID or `category:<Category>`; the system that receives the effect. */
  to: z.string(),
  /** Feet between footprints (0: touching or on top of it). Ignored for scope `parcel`. */
  radiusFt: z.number().nonnegative(),
  /**
   * `radius` (default): sources within radiusFt. `host`: the source sits on the receiver (G15
   * modifiers such as a weatherization retrofit on a house). `parcel`: anywhere on the parcel.
   */
  scope: z.enum(['radius', 'host', 'parcel']).optional(),
  effect: z.object({
    resource: z.string(),
    /** Per-source multiplier applied to the receiver's flow of `resource`. */
    multiplier: z.number().nonnegative(),
    /** Lower bound on the combined multiplier (e.g. shade floor 0.7). */
    floor: z.number().nonnegative().optional(),
    /** `require`: the receiver's flow only works if a source is in range. */
    mode: z.enum(['scale', 'require']).default('scale'),
    direction: DirectionSchema.default('in'),
    /** `each`: every source in range applies the multiplier; `once`: any number of sources apply it once. */
    stack: z.enum(['each', 'once']).default('each'),
  }),
  note: z.string().default(''),
});
export type AdjacencyRule = z.infer<typeof AdjacencyRuleSchema>;

/**
 * A Capacity resource that is *assigned* rather than pooled: each consumer is linked to one
 * provider (nearest with room by default, or the player's choice) within `maxDistanceFt`.
 */
export const AssignedCapacitySchema = z.object({
  resource: z.string(),
  maxDistanceFt: z.number().positive().nullable(),
  note: z.string().default(''),
});
export type AssignedCapacity = z.infer<typeof AssignedCapacitySchema>;

/** How the site's slope changes a system's flow: multiplier = clamp(1 + perSlopePct × slope%, min, max). */
export const TerrainRuleSchema = z.object({
  to: z.string(),
  resource: z.string(),
  direction: DirectionSchema.default('out'),
  perSlopePct: z.number(),
  min: z.number().nonnegative(),
  max: z.number().nonnegative(),
  note: z.string().default(''),
});
export type TerrainRule = z.infer<typeof TerrainRuleSchema>;

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
  /**
   * Who an output of this resource reaches (G11). `shelter`: it only counts when the producer
   * serves a shelter (is one, sits inside one with no footprint, or is within `deliveryRadiusFt`
   * of one); otherwise it is potential only. `any`: everywhere.
   */
  deliversTo: z.enum(['shelter', 'any']),
  deliveryRadiusFt: z.number().nonnegative(),
  /** Market (G12): dollars per canonical unit when the market sells it (null: not sold). */
  marketPrice: z.number().nonnegative().nullable(),
  /** "$/<unit>", which must match the resource's own unit. */
  marketUnit: z.string().nullable(),
  marketAvailable: z.boolean(),
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
  /** Its heat and cooling stay outdoors (a firepit): they never reach a shelter (G11). */
  outdoor: z.boolean(),
  /**
   * Backstop (G12): instead of a fixed weekly output, it fills whatever the homestead doesn't,
   * up to 3× its catalog output, at `backstopPrices` per unit, plus `backstopFee` a week whether used or not.
   */
  backstop: z.boolean(),
  backstopFee: z.number().nonnegative(),
  /** Dollars per unit for each output it sells. Outputs without a price are by-products. */
  backstopPrices: z.record(z.string(), z.number().nonnegative()),
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
  assignedCapacities: z.array(AssignedCapacitySchema),
  terrainRules: z.array(TerrainRuleSchema),
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
          outdoor: z.boolean().optional(),
          backstop: z.boolean().optional(),
          backstopFee: z.number().nonnegative().optional(),
          backstopPrices: z.record(z.string(), z.number().nonnegative()).optional(),
          /**
           * G15 modifiers: this system changes another system's flow (a retrofit cuts its house's
           * heat loss; a clothesline cuts household electricity). Exported as adjacency rules.
           */
          modifies: z
            .array(
              z
                .object({
                  to: z.string(),
                  resource: z.string(),
                  direction: DirectionSchema.default('in'),
                  multiplier: z.number().nonnegative(),
                  scope: z.enum(['host', 'parcel']),
                  note: z.string(),
                })
                .strict(),
            )
            .optional(),
          note: z.string().optional(),
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
          deliversTo: z.enum(['shelter', 'any']).optional(),
          deliveryRadiusFt: z.number().nonnegative().optional(),
          marketPrice: z.number().nonnegative().optional(),
          marketUnit: z.string().optional(),
          marketAvailable: z.boolean().optional(),
          note: z.string().optional(),
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
    assignedCapacities: z.array(AssignedCapacitySchema).default([]),
    terrainRules: z.array(TerrainRuleSchema).default([]),
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

export const NodeTypeSchema = z.enum([
  'deadfall',
  'creek',
  'spring',
  'wild-greens',
  'berry-thicket',
  'clay-bank',
  'leaf-litter',
  'rain-pools',
]);
export type NodeType = z.infer<typeof NodeTypeSchema>;

/** A natural node (G14). Yields are per hour of work at the node, not counting the walk. */
export const NodeSchema = z.object({
  id: z.string(),
  type: NodeTypeSchema,
  /** Fractions of the parcel side (0-1). */
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  resource: z.string(),
  yieldPerHour: z.number().positive(),
  /** Smaller by-products per hour (wild greens give a little food besides biomass). */
  extra: z.array(z.object({ resource: z.string(), perHour: z.number().positive() })).default([]),
  /** Units on hand at the start (null: unlimited, like a creek or a clay bank). */
  stock: z.number().nonnegative().nullable(),
  /** Most it can hold (null with an unlimited stock). */
  maxStock: z.number().nonnegative().nullable(),
  /** Units it regrows per day in its active months. */
  regrowPerDay: z.number().nonnegative(),
  /** Months (1-12) it can be worked; regrowth happens only then. */
  months: z.array(z.number().int().min(1).max(12)).min(1),
  /** Untreated water: drink it only after a filter or boiling. */
  untreated: z.boolean().default(false),
  /** Rain refills it (gallons per inch of rain), and it dries up (share lost per day). */
  rainFill: z.number().nonnegative().default(0),
  evaporatePerDay: z.number().min(0).max(1).default(0),
  /** Yield falls with a dry year in real weather (creeks, springs). */
  droughtSensitive: z.boolean().default(false),
});
export type ResourceNode = z.infer<typeof NodeSchema>;

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
  /**
   * Natural resource nodes on the land (G14): worked with labor, depleted, and regrown.
   * Positions are fractions of the parcel side, like terrain.
   */
  nodes: z.array(NodeSchema).default([]),
  notes: z.string(),
});
export type Site = z.infer<typeof SiteSchema>;

/** Difficulty presets for a start (G15). */
export const DifficultySchema = z.enum(['gentle', 'standard', 'real']);
export type Difficulty = z.infer<typeof DifficultySchema>;

/**
 * A way to start a game (G15), as data in `data/starts/<id>.json`: land, systems already
 * running, a stockpile, cash, rules, and per-difficulty multipliers. Names are catalog names,
 * so a start never hard-codes system IDs.
 */
export const StartSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    pitch: z.string(),
    parcelAcres: z.number().positive(),
    /**
     * Day of year the game starts on (0 = Jan 1), or `spring`: 30 days before the site's last
     * spring frost, so every site starts with a month to prepare beds and the winter far off.
     */
    startDay: z.union([z.number().int().min(0).max(364), z.literal('spring')]),
    /** Default household (adults), and the range the start screen offers. */
    household: z.object({ default: z.number().int().min(1), min: z.number().int().min(1), max: z.number().int().min(1) }),
    /** Systems already built and running; x, y as fractions of the parcel side. `perPerson` scales with the household. */
    instances: z.array(
      z
        .object({
          system: z.string(),
          x: z.number().min(0).max(1),
          y: z.number().min(0).max(1),
          count: z.number().int().min(1).default(1),
          perPerson: z.boolean().default(false),
        })
        .strict(),
    ),
    /** Starting stocks for the default household; scaled by household ÷ default. */
    stockpile: z.record(z.string(), z.number().nonnegative()),
    cash: z.number(),
    autoGather: z.object({ waterDays: z.number(), woodWeeks: z.number(), foodWeeks: z.number() }).partial().optional(),
    /** Share of an unmet need a backstop may fill in a week, as a multiple of its catalog output (default 3). */
    backstopCapMult: z.number().positive().optional(),
    tutorial: z.string().nullable(),
    /** What the HUD leads with. */
    headline: z.enum(['self-reliance', 'off-grid']),
    difficulty: z.record(
      DifficultySchema,
      z
        .object({
          label: z.string(),
          blurb: z.string(),
          /** Wellbeing penalties × this. */
          wellbeingMult: z.number().positive(),
          /** Stockpile × this. */
          stockMult: z.number().positive(),
          weatherMode: z.enum(['average', 'real']),
        })
        .strict(),
    ),
    /** Plain-language lines for the start card ("A canvas wall tent with a stove jack"). */
    preview: z.object({ kit: z.array(z.string()), stockpile: z.array(z.string()) }),
  })
  .strict();
export type Start = z.infer<typeof StartSchema>;

/**
 * A tutorial quest goal (G16), evaluated by the engine. Goals compose with `all`.
 * - have: N active instances of a system (by catalog name).
 * - made: yesterday a system made at least this much of a resource.
 * - gathered: gathered at least this much of a resource since the quest began.
 * - stock: a stock is at least this much.
 * - setting: an auto-gather rule is at least this.
 * - warm: this many days since the quest began with HDD above `hddAbove` and the household's
 *   heat (after bedding) at least `atLeast` met.
 * - homegrown: home-grown food eaten is at least `share` of the household's need over `days`.
 * - modified: a system modifies some shelter's `resource` (a retrofit on the house).
 * - lacks: no active instance of a system.
 * - days: this many days since the quest began.
 * - ui: the player did something in the interface (opened a panel); bots count it as done.
 */
export const QuestGoalSchema: z.ZodType<QuestGoal, z.ZodTypeDef, unknown> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal('all'), of: z.array(QuestGoalSchema) }).strict(),
    z.object({ kind: z.literal('have'), system: z.string(), count: z.number().int().min(1).default(1) }).strict(),
    z.object({ kind: z.literal('made'), system: z.string(), resource: z.string(), atLeast: z.number().positive() }).strict(),
    z.object({ kind: z.literal('gathered'), resource: z.string(), atLeast: z.number().positive() }).strict(),
    z.object({ kind: z.literal('stock'), resource: z.string(), atLeast: z.number().positive() }).strict(),
    z
      .object({ kind: z.literal('setting'), rule: z.enum(['waterDays', 'woodWeeks', 'foodWeeks']), atLeast: z.number().positive() })
      .strict(),
    z
      .object({ kind: z.literal('warm'), hddAbove: z.number(), atLeast: z.number().min(0).max(1), days: z.number().int().min(1) })
      .strict(),
    z.object({ kind: z.literal('homegrown'), share: z.number().min(0).max(1), days: z.number().int().min(1) }).strict(),
    z.object({ kind: z.literal('modified'), system: z.string(), resource: z.string() }).strict(),
    z.object({ kind: z.literal('lacks'), system: z.string() }).strict(),
    z.object({ kind: z.literal('days'), atLeast: z.number().int().min(1) }).strict(),
    z.object({ kind: z.literal('ui'), panel: z.string(), label: z.string() }).strict(),
  ]),
);
export type QuestGoal =
  | { kind: 'all'; of: QuestGoal[] }
  | { kind: 'have'; system: string; count: number }
  | { kind: 'made'; system: string; resource: string; atLeast: number }
  | { kind: 'gathered'; resource: string; atLeast: number }
  | { kind: 'stock'; resource: string; atLeast: number }
  | { kind: 'setting'; rule: 'waterDays' | 'woodWeeks' | 'foodWeeks'; atLeast: number }
  | { kind: 'warm'; hddAbove: number; atLeast: number; days: number }
  | { kind: 'homegrown'; share: number; days: number }
  | { kind: 'modified'; system: string; resource: string }
  | { kind: 'lacks'; system: string }
  | { kind: 'days'; atLeast: number }
  | { kind: 'ui'; panel: string; label: string };

/**
 * The cheapest way a quest suggests to do it (G16): what the tutorial-following bot does,
 * and what "show me" points at. `near` is the home, a node type, or a system already placed.
 */
export const QuestStepSchema = z.union([
  z
    .object({
      do: z.literal('place'),
      system: z.string(),
      mode: z.enum(['buy', 'diy']).default('diy'),
      count: z.number().int().min(1).default(1),
      near: z.string().default('home'),
      /** Put it on top of `near` (a retrofit on the house). */
      on: z.boolean().default(false),
    })
    .strict(),
  /** Remove `count` of a system (all of them when omitted). */
  z.object({ do: z.literal('remove'), system: z.string(), count: z.number().int().min(1).optional() }).strict(),
  /** Serve a system first (priority tier 0), e.g. the commute before leisure miles. */
  z.object({ do: z.literal('priority'), system: z.string(), tier: z.number().int().min(0).max(2) }).strict(),
  z.object({ do: z.literal('buy'), resource: z.string(), amount: z.number().positive() }).strict(),
  z.object({ do: z.literal('standing'), resource: z.string(), keepAbove: z.number().nonnegative(), orderUpTo: z.number().positive() }).strict(),
  z
    .object({ do: z.literal('autoGather'), waterDays: z.number().optional(), woodWeeks: z.number().optional(), foodWeeks: z.number().optional() })
    .strict(),
  z.object({ do: z.literal('workCap'), job: z.string(), hours: z.number().nonnegative().nullable() }).strict(),
  z.object({ do: z.literal('open'), panel: z.string() }).strict(),
]);
export type QuestStep = z.infer<typeof QuestStepSchema>;

/** What "show me" highlights: a drawer item, a node on the map, a resource page, or a panel. */
export const QuestShowSchema = z.union([
  z.object({ kind: z.literal('system'), name: z.string() }).strict(),
  z.object({ kind: z.literal('node'), type: z.string() }).strict(),
  z.object({ kind: z.literal('resource'), name: z.string() }).strict(),
  z.object({ kind: z.literal('panel'), panel: z.string() }).strict(),
]);
export type QuestShow = z.infer<typeof QuestShowSchema>;

/** A neighbor's thanks when a quest is done: cash or a stockpile top-up, and why. */
export const QuestRewardSchema = z
  .object({
    line: z.string(),
    cash: z.number().nonnegative().default(0),
    stock: z.record(z.string(), z.number().positive()).default({}),
  })
  .strict();
export type QuestReward = z.infer<typeof QuestRewardSchema>;

export const QuestSchema = z
  .object({
    id: z.string(),
    title: z.string(),
    /** One line: what this teaches and why it matters now. */
    reason: z.string(),
    /** The checklist row the quest moves. */
    row: NeedKeySchema,
    goal: QuestGoalSchema,
    steps: z.array(QuestStepSchema),
    show: QuestShowSchema,
    reward: QuestRewardSchema,
  })
  .strict();
export type QuestDef = z.infer<typeof QuestSchema>;

export const QuestLineSchema = z
  .object({
    id: z.string(),
    /** Who sends the rewards ("Ruth, on the next ridge"). */
    neighbor: z.string(),
    quests: z.array(QuestSchema).min(1),
  })
  .strict();
export type QuestLine = z.infer<typeof QuestLineSchema>;
