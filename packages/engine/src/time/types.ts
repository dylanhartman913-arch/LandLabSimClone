import type { NeedKey, Site } from '@homestead/catalog';
import type { SurvivalNeed, WellbeingTerm } from './wellbeing.ts';
import type { DayWeather } from './climate.ts';
import type { YearWeather } from './weather.ts';
import type { JobId } from './gather.ts';
import type { TutorialState } from '../tutorial.ts';

export type BuildMode = 'buy' | 'diy' | 'prebuilt';
export type WeatherMode = 'average' | 'real';

export interface GameSettings {
  parcelAcres: number;
  startingCash: number;
  weatherMode: WeatherMode;
  /** Share of each day's labor pool that construction may use first. */
  constructionShare: number;
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
}

export interface InstanceInputRecord {
  requested: number;
  /** What allocation offered (supply available to this consumer). */
  granted: number;
  /** What the consumer actually used (less than granted when another input limits it). */
  received: number;
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
  setupHoursNeeded: number;
  setupHoursDone: number;
  /** Materials drawn (construction has started). */
  materialsDrawn: boolean;
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
  cash: { start: number; in: number; out: number; purchases: number; refunds: number; end: number };
  labor: {
    pool: number;
    construction: number;
    upkeepRequested: number;
    upkeepDelivered: number;
    unused: number;
    /** Hours worked per job today (G14): gathering, construction, upkeep. */
    byJob?: Partial<Record<JobId, number>>;
  };
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

export interface GameState {
  schema: 'homestead.game.v1';
  seed: number;
  rng: number;
  site: Site;
  settings: GameSettings;
  calendar: { day: number; year: number; absDay: number };
  cash: number;
  stocks: Record<string, number>;
  /** Yesterday's output usable today by daytime loads without storage (see Resource.directUseShare). */
  direct: Record<string, number>;
  /** Yesterday's total output of each Service resource (pollination, pest control…). */
  services: Record<string, number>;
  /** Yesterday's results per group, keyed `systemId|priority`. */
  lastDay: Record<string, GroupDay>;
  instances: Instance[];
  nextInstanceId: number;
  weather: DayWeather;
  ledgers: DayLedger[];
  /** Pending purchases/refunds since the last step (placement happens between days). */
  pendingCash: { purchases: number; refunds: number };
  /**
   * Rolling flags used to emit "first day of" events: for each resource that is short,
   * the systems it curtails; whether electricity is spilling.
   */
  flags: { short: Record<string, string[]>; spilling: boolean; broke?: boolean };
  /** Natural node stocks (G14), once someone has worked a node; untouched nodes are full. */
  nodeStock?: Record<string, number>;
  /** The market (G12): one-off orders for the next trip, and standing orders. Absent until used. */
  market?: { orders: MarketOrder[]; standing: StandingOrder[] };
  /** The tutorial quest line and where it stands (G16). */
  tutorial?: TutorialState;
  /** The start this game began from (G15), if any. */
  start?: { id: string; difficulty: string; household: number; headline: 'self-reliance' | 'off-grid'; tutorial: string | null };
  /** Real weather only: this year's draws, and every year's draws so far (kept in saves). */
  yearWeather?: YearWeather;
  weatherLog?: YearWeather[];
}

export type GameEvent =
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
  | { kind: 'market'; absDay: number; bought: Record<string, number>; cost: number; trip: 'own transport' | 'delivery' };
