import type { RiskKind, NeedKey, Site } from '@homestead/catalog';
import type { SurvivalNeed, WellbeingTerm } from './wellbeing.ts';
import type { DayWeather } from './climate.ts';
import type { YearWeather } from './weather.ts';
import type { JobId } from './gather.ts';
import type { TutorialState } from '../tutorial.ts';

export type BuildMode = 'buy' | 'diy' | 'prebuilt';
export type WeatherMode = 'average' | 'real';

export interface GameSettings {
  /** Experimental Phase 9 mechanics; explicit opt-in, never migrated automatically. */
  wearAndRepair?: boolean;
  sellingAndTrade?: boolean;
  foodPreservation?: boolean;
  livestockLifecycle?: boolean;
  shelterOccupancy?: boolean;
  /** LL-33: separate raw/drinking water pools, feed storage, and outdoor tanks that freeze. */
  storagePools?: boolean;
  /** LL-34: tools multiply gathering at the land's nodes instead of producing on their own. */
  toolGathering?: boolean;
  /** LL-35: gardens keep a fertility level that cropping lowers and compost, manure and cover crops raise. */
  soilFertility?: boolean;
  /** LL-36: children and elders, skills from practice, illness and injury. */
  householdRoles?: boolean;
  /** LL-37: explicit credit, tax, failure insurance and reserve planning. */
  finance?: boolean;
  /** LL-38: warned risk events with an independent saved random stream. */
  riskEvents?: boolean;
  /** LL-39: demand comes from trips, not a flat need per resident. */
  transportAccess?: boolean;
  parcelAcres: number;
  startingCash: number;
  weatherMode: WeatherMode;
  /** Share of each day's labor pool that construction may use first. */
  constructionShare: number;
  /** Emergency work takes resident labor before employment, upkeep and fetching; ignores construction cap/share. */
  emergencyConstruction?: boolean;
  /** v0.2 town-return policy. Absent in legacy replay logs; enabled by a logged settings action on continuation. */
  safeRecovery?: boolean;
  /** v0.4 labor fix: upkeep hours a system could not use go to jobs still short. Absent in legacy logs; enabled on continuation. */
  reuseIdleLabor?: boolean;
  /** v0.5 town return: shelter must meet the survival threshold, not 100% of need. Absent in legacy logs; enabled on continuation. */
  survivalShelterReturn?: boolean;
  /** v0.6 water storage: raw water spills before safe water, and fetching stops at free room. Absent in legacy logs; enabled on continuation. */
  safeWaterFirst?: boolean;
  /** v0.7 start: services warm up on household by-products, so day 1 has no false shortage. Only read when a game starts. */
  serviceWarmUp?: boolean;
  /** v0.8 start: the seasonal tutorial line (summer goals, named supply orders, warmth by residents). Only read when a game starts. */
  tutorialSeasons?: boolean;
  /** v0.9: employment has its own labor priority below upkeep, capped at 40 h per adult/week. */
  employmentPriority?: boolean;
  /** v0.9 start: first-year greenfield cash support scales with the household. */
  householdStart?: boolean;
  /** v0.9: outside crew rates use the site's game balance rate. */
  siteCrewRates?: boolean;
  /** v0.9: purchases and fees cannot overdraw cash. */
  cashFloor?: boolean;
  /** Day of year the game starts on (0 = Jan 1). */
  startDay?: number;
  /** Stocks on day one (arrival supplies). */
  startingStocks: Record<string, number>;
  /**
   * Validation only: every request is met in full (shortfalls are recorded as `supplied`),
   * and nothing is capped by storage. Used to check time mode against balance mode.
   */
  unlimitedSupply?: boolean;
  /** Work priorities (G14): per job, a priority 1 (first) to 5, and an optional cap in hours a week. */
  work?: { priorities?: Partial<Record<JobId, number>>; caps?: Partial<Record<JobId, number | null>> };
  /**
   * Auto-gather rules (G14): keep water above N days of use, firewood above N weeks, food above
   * N weeks, by gathering from the land's natural nodes. Absent or 0: off.
   */
  autoGather?: { waterDays?: number; woodWeeks?: number; foodWeeks?: number };
  /** Difficulty (G15): multiplier on wellbeing penalties (Gentle 0.5, Standard 1). Default 1. */
  wellbeingMult?: number;
  /**
   * People at 0 wellbeing go to stay in town (G15). On in the two game starts; off by default so
   * design analysis (validation, Monte Carlo, scenarios) keeps a fixed household at 0 wellbeing.
   */
  peopleLeave?: boolean;
  /** Backstops fill unmet needs up to this × their catalog output a week (default 3, G12). */
  backstopCapMult?: number;
}

export interface PersonState {
  /** Wellbeing 0–100 (G15). */
  wellbeing: number;
  /** Labor share: 0.5 + 0.5 × wellbeing / 100. */
  health: number;
  /** Consecutive days each survival need has been short (the grace counter). */
  short: Record<SurvivalNeed, number>;
  /** Consecutive days food has been severely short (under 20%). */
  severeFood: number;
  /** Today's change in wellbeing, term by term, biggest first. */
  why: WellbeingTerm[];
  /** Gone to stay in town (wellbeing hit 0): consumes and makes nothing until they come back. */
  away?: { since: number };
  /** LL-36: adult (default), child or elder. */
  role?: 'adult' | 'child' | 'elder';
  /** LL-36: hours of practice this person has had at each skill. */
  skills?: { building: number; growing: number; gathering: number };
  /** LL-36: ill or injured, with days left. */
  condition?: { kind: 'ill' | 'injured'; daysLeft: number };
}

export interface InstanceInputRecord {
  requested: number;
  /** What allocation offered (supply available to this consumer). */
  granted: number;
  /** What the consumer actually used (less than granted when another input limits it). */
  received: number;
}

export interface AnimalState {
  ageDays: number;
  /** Fed days toward maturity; chronological age continues during shortages. */
  growthDays: number;
  breeding?: { progressDays: number; laborDone: number };
  culling?: { laborDone: number };
  predatorWarning?: { daysLeft: number };
}

export interface Instance {
  id: string;
  systemId: string;
  /** Center, in feet from the parcel's north-west corner. */
  x: number;
  y: number;
  status: 'building' | 'active';
  buildMode: BuildMode;
  /** Dollars paid at placement (for refunds). */
  paid: number;
  /** Remaining service life, 0–1; absent means new when wear is first enabled. */
  condition?: number;
  servicing?: { activeSince: number | null };
  preservation?: { resource: string; keep: number };
  animal?: AnimalState;
  /** LL-43 incubator or nest box batch: eggs set (0 while waiting for eggs), counted and missed days, sitting hen. */
  hatch?: { eggs: number; days: number; missed: number; henId?: string };
  /** Undefined: deterministic automatic assignment; null: explicitly unsheltered. */
  shelterId?: string | null;
  shelterClosed?: boolean;
  /** LL-35 garden fertility (1 = the catalog's full yield); absent means the rule's starting level. */
  fertility?: number;
  /** LL-44 cover crop seeding: share of this year's seed sown in its window (0–1), kept until the next window. */
  sown?: number;
  /** LL-33 outdoor tank: protection bought, its install hours, frost (°F-days) and locked ice (gal). */
  winter?: { protection?: 'insulated' | 'heated'; setupHours?: number; frost: number; frozen?: number };
  setupHoursNeeded: number;
  setupHoursDone: number;
  /** Materials drawn (construction has started). */
  materialsDrawn: boolean;
  /** Prepaid outside construction. Hours already worked remain sunk on removal. */
  contractor?: { hours: number; worked: number; rate?: number };
  /** Absolute day the instance became active (prebuilt plants are backdated to maturity). */
  activeSince: number | null;
  /** Allocation tier; lower is served first. Defaults to the system's priority tier. */
  priority: number;
  /** Present only for Human Being instances. */
  person?: PersonState;
  /** Player-chosen providers for assigned capacities (resource → provider instance id). */
  links?: Record<string, string>;
  /** Share of a full system this instance is (a child is 0.6 of a Human Being). Default 1. */
  scale?: number;
}

/** Yesterday's result for one group (all active instances of a system at one priority). */
export interface GroupDay {
  /** Production satisfaction (0-1). */
  sat: number;
  /** The input that limited satisfaction, if any. */
  limitedBy: string | null;
  boostMult: number;
  /** Per instance: requested and received for each input. */
  inputs: Record<string, InstanceInputRecord>;
  /** Per instance at full maturity and health: output of each resource (actual: × satisfaction × boosts). */
  outputs: Record<string, number>;
  /** Per instance at full maturity: output with every input met (potential, G11). */
  potential: Record<string, number>;
  /** Outputs that didn't reach a shelter (G11), so they count as potential only. */
  undelivered?: string[];
}

export interface ResourceDay {
  /** Sold or bartered away; never counted as household consumption. */
  sold?: number;
  /** Food transformed by processing, separate from meals. */
  processed?: number;
  /** Of production, canonical units converted from another food (not new harvest). */
  converted?: number;
  /** Net raw water locked in (positive) or released from (negative) frozen tanks. */
  frozen?: number;
  start: number;
  produced: number;
  consumed: number;
  spilled: number;
  spoiled: number;
  requested: number;
  unmet: number;
  /** Construction materials brought in because stock ran short (never touches the stock). */
  imported: number;
  /** Validation mode only: amount added to the stock so every request could be met. */
  supplied: number;
  /** What producers would have made with every input met (G11). */
  potential: number;
  /** Made but unusable: heat or cooling that doesn't reach a shelter (G11). */
  undelivered: number;
  /** Brought in from outside today: backstop deliveries and market purchases (G12). */
  purchased: number;
}

export interface NeedDay {
  /** Actual output of feeding resources that reached their users, in the row's unit. */
  provided: number;
  /** The same with every input met and every output delivered (G11 potential). */
  potential: number;
  /** Requests from every consumer of feeding resources, in the row's unit. */
  needed: number;
  /** What those consumers actually received, in the row's unit. */
  delivered: number;
  /** Of `provided`, what came from outside: backstops, the market, and conventional services (G12). */
  bought: number;
}

export interface DayLedger {
  absDay: number;
  day: number;
  year: number;
  resources: Record<string, ResourceDay>;
  needs: Record<NeedKey, NeedDay>;
  finance?: FinanceDay;
  access?: AccessDay;
  risks?: { id: string; kind: RiskKind; targetId?: string }[];
  cash: { start: number; in: number; out: number; purchases: number; refunds: number; end: number; borrowed?: number; repaid?: number };
  labor: {
    pool: number;
    construction: number;
    upkeepRequested: number;
    upkeepDelivered: number;
    unused: number;
    /** Hours worked per job today (G14): gathering, construction, upkeep. */
    byJob?: Partial<Record<JobId, number>>;
  };
  /** Per-shelter actual receipts, and the least-served resident, under occupancy. */
  shelters?: {
    id: string;
    residents: string[];
    heatNeeded: number;
    heatReceived: number;
    coolingNeeded: number;
    coolingReceived: number;
  }[];
  /** LL-36: practice hours today by skill, and today's injury risk from dangerous work. */
  household?: { practice: { building: number; growing: number; gathering: number }; injuryRisk: number };
  /** LL-35 gardens: fertility after today, and what fed and drew it. */
  fertility?: {
    instanceId: string;
    fertility: number;
    compost: number;
    manure: number;
    cover: number;
    fed: number;
    draw: number;
  }[];
  /** Outdoor tanks under LL-33 with frost, ice or a running heater. */
  winter?: {
    instanceId: string;
    meanF: number;
    frost: number;
    threshold: number;
    frozen: number | null;
    heaterKWh: number;
    heaterNeedKWh: number;
  }[];
  residentShares?: { shelter: number; heat: number; cooling: number };
  fodder?: { instanceId: string; scytheIds: string[]; cuttingHours: number; toolHours: number; savedHours: number }[];
  waterTests?: { instanceId: string; warning: string }[];
  preserved?: {
    instanceId: string;
    resource: string;
    amount: number;
    inputKcal: number;
    outputKcal: number;
    labor: number;
    energyResource: string;
    energy: number;
  }[];
  /** LL-46: each CSA group's growing-season day: share delivered, revenue earned, make-good paid. */
  csa?: { instanceIds: string[]; share: number; revenue: number; makeGood: number }[];
  /** LL-43: each incubator or nest box batch's day: eggs set, whether the day counted, power used, chicks hatched. */
  hatching?: { instanceId: string; eggsSet: number; counted: boolean; kWh: number; hatched: number }[];
  livestock?: {
    instanceId: string;
    kind: 'matured' | 'born' | 'culled' | 'died' | 'predator-warning' | 'predator-loss' | 'protected' | 'eggs-set' | 'hatch-failed';
    amount: number;
  }[];
  trades?: {
    resource: string;
    amount: number;
    revenue: number;
    received?: string;
    receivedAmount?: number;
  }[];
  /** What people gathered from the land today (G14). */
  gathered?: GatherRecord[];
  /** Untreated water boiled into drinking water today (G14). */
  boiled?: { gal: number; fuelHours: number; laborHours: number };
  /** Upkeep hours worked per system today (construction is in labor.construction). */
  laborBySystem: Record<string, number>;
  /** Systems running below full satisfaction today, with the input that limited them. */
  curtailed: { systemId: string; count: number; sat: number; limitedBy: string | null }[];
  weather: DayWeather;
  /** Flow output bought from outside today (grid power, city water, groceries), by resource. */
  bought: Record<string, number>;
  /** Household members who entered hardship today. */
  hardships: number;
  /** Money spent today on backstops, the market, connection fees, and delivery (G12). Included in cash.out. */
  spend: DaySpend;
  /** Average labor share of the people at home today (0.5 + 0.5 × wellbeing / 100). */
  health: number;
  /** Average wellbeing (0–100) of the people at home today; null when nobody is home (G15). */
  wellbeing: number | null;
  /** People staying in town today (G15). */
  away: number;
}

export interface DaySpend {
  /** Dollars per resource delivered by backstops (grocery, grid, city water…). */
  backstop: Record<string, number>;
  /** Dollars per resource bought at the market. */
  market: Record<string, number>;
  /** Backstop connection fees (charged whether used or not). */
  fees: number;
  /** Market delivery charges (when no transport was available for the trip). */
  delivery: number;
  /** LL-39: paid commuting/supply/town fares and settlement of emergency fares. */
  access?: number;
  /** LL-46: CSA make-good paid to members for short weeks. */
  makeGood?: number;
  /**
   * Running costs by system (G16): the Capital each system draws (a house payment, a car).
   * Already part of cash out, so not in `spendTotal`; shown as bills.
   */
  running?: Record<string, number>;
}

/** One node's haul today (G14). */
export interface GatherRecord {
  job: JobId;
  nodeId: string;
  nodeType: string;
  resource: string;
  amount: number;
  /** Hours at the node plus the walk there and back. */
  hours: number;
  walkHours: number;
  /** LL-34: tools that worked this haul, their hours at the node, the extra yield, and fuel burned. */
  toolIds?: string[];
  toolHours?: number;
  toolExtra?: number;
  fuel?: number;
}

/** A market purchase waiting for the next trip (G12). */
export interface MarketOrder {
  resource: string;
  amount: number;
}

/** "Keep firewood above 500 lbs": buy up to `orderUpTo` whenever the stock drops below `keepAbove`. */
export interface StandingOrder {
  resource: string;
  keepAbove: number;
  orderUpTo: number;
}

export interface FinanceState {
  debt: number;
  taxDue: number;
  insured: boolean;
  emergencyDays: number;
  /** LL-51: a start's mortgage. `payment` is monthly; unpaid installments wait in `arrears` (no penalty). */
  mortgage?: MortgageState;
}

export interface MortgageState {
  balance: number;
  annualRate: number;
  payment: number;
  arrears: number;
}

export interface FinanceDay {
  borrowed: number;
  repaid: number;
  interest: number;
  capitalized: number;
  taxAssessed: number;
  taxPaid: number;
  premium: number;
  claim: number;
  covered: boolean;
  debt: number;
  taxDue: number;
  /** LL-51, only with a mortgage: today's interest, payment, and the balance and arrears after them. */
  mortgage?: { interest: number; paid: number; balance: number; arrears: number };
}

export interface RiskThreat {
  id: string;
  kind: RiskKind;
  warnedAt: number;
  startsAt: number;
  endsAt: number;
  targetId?: string;
}

export interface RiskState {
  threats: RiskThreat[];
  /** Previous day's actual operating share; new or unfunded defenses have no readiness. */
  readiness: Record<string, number>;
}

export interface AccessTrip {
  key: string;
  purpose: 'market' | 'commute' | 'supply' | 'town-out' | 'town-home';
  systemId?: string;
  miles: number;
  ownMiles: number;
  fare: number;
  deferred: number;
  completed: boolean;
  reason?: string;
}
export interface AccessDay {
  trips: AccessTrip[];
  repaid: number;
  fareDue: number;
}

export interface GameState {
  schema: 'homestead.game.v1';
  seed: number;
  rng: number;
  /** Independent opt-in risk stream keeps predator draws from changing weather. */
  livestockRng?: number;
  /** LL-36: independent stream for illness and injury draws. */
  householdRng?: number;
  riskRng?: number;
  risks?: RiskState;
  site: Site;
  settings: GameSettings;
  calendar: { day: number; year: number; absDay: number };
  cash: number;
  finance?: FinanceState;
  access?: { fareDue: number };
  stocks: Record<string, number>;
  /** Yesterday's output usable today by daytime loads without storage (see Resource.directUseShare). */
  direct: Record<string, number>;
  /** Yesterday's total output of each Service resource (pollination, pest control…). */
  services: Record<string, number>;
  /** Yesterday’s delivered thermal output, routed once to each occupied shelter. */
  shelterThermal?: Record<string, Record<string, number>>;
  /** Yesterday's results per group, keyed `systemId|priority`. */
  lastDay: Record<string, GroupDay>;
  instances: Instance[];
  nextInstanceId: number;
  weather: DayWeather;
  ledgers: DayLedger[];
  /** Pending purchases/refunds since the last step (placement happens between days). */
  pendingCash: { purchases: number; refunds: number; borrowed?: number; repaid?: number };
  /**
   * Rolling flags used to emit "first day of" events: for each resource that is short,
   * the systems it curtails; whether electricity is spilling.
   */
  flags: { short: Record<string, string[]>; spilling: boolean; broke?: boolean };
  /** Natural node stocks (G14), once someone has worked a node; untouched nodes are full. */
  nodeStock?: Record<string, number>;
  /** The market (G12): one-off orders for the next trip, and standing orders. Absent until used. */
  market?: {
    orders: MarketOrder[];
    standing: StandingOrder[];
    sales?: { resource: string; amount: number; keep: number; receive?: string }[];
  };
  /** The tutorial quest line and where it stands (G16). */
  tutorial?: TutorialState;
  /** The start this game began from (G15), if any. */
  start?: {
    id: string;
    difficulty: string;
    household: number;
    /** LL-51: children on top of the adults (absent: none). */
    children?: number;
    headline: 'self-reliance' | 'off-grid';
    tutorial: string | null;
  };
  /** Real weather only: this year's draws, and every year's draws so far (kept in saves). */
  yearWeather?: YearWeather;
  weatherLog?: YearWeather[];
}

export type GameEvent =
  | { kind: 'access'; absDay: number; blocked: boolean; message: string }
  | { kind: 'risk'; absDay: number; instanceId?: string; risk: RiskKind; phase: 'warning' | 'started' | 'ended' | 'averted'; message: string }
  | { kind: 'person'; absDay: number; instanceId: string; event: 'ill' | 'injured' | 'recovered'; days: number }
  | { kind: 'winter-water'; absDay: number; instanceId: string; event: 'froze' | 'thawed'; gal: number }
  | {
      kind: 'livestock';
      absDay: number;
      instanceId: string;
      event: NonNullable<DayLedger['livestock']>[number]['kind'];
      amount: number;
    }
  | {
      kind: 'shortage';
      absDay: number;
      resource: string;
      unmet: number;
      requested: number;
      curtailed: string[];
    }
  | { kind: 'shortage-ended'; absDay: number; resource: string }
  | { kind: 'spill'; absDay: number; resource: string; amount: number }
  | { kind: 'spoilage'; absDay: number; byResource: Record<string, number> }
  | { kind: 'harvest'; absDay: number; systemId: string; resource: string; instanceIds: string[] }
  | { kind: 'built'; absDay: number; instanceId: string; systemId: string }
  | { kind: 'imported'; absDay: number; instanceId: string; resource: string; amount: number }
  | { kind: 'hardship'; absDay: number; instanceId: string; need: SurvivalNeed; level: number }
  | { kind: 'health'; absDay: number; instanceId: string; health: number; wellbeing: number }
  | { kind: 'went-to-town'; absDay: number; instanceId: string }
  | { kind: 'came-home'; absDay: number; instanceId: string }
  | { kind: 'quest'; absDay: number; questId: string; title: string; reward: string }
  | { kind: 'purchases-stopped'; absDay: number; cash: number }
  | {
      kind: 'market';
      absDay: number;
      bought: Record<string, number>;
      cost: number;
      trip: 'own transport' | 'delivery';
    };
