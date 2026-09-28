import type { NeedKey, Site } from '@homestead/catalog';
import type { PersonNeed } from './constants.ts';
import type { DayWeather } from './climate.ts';
import type { YearWeather } from './weather.ts';

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
}

export interface PersonState {
  /** Last ROLLING_DAYS fractions met per need, oldest first. */
  recent: Record<PersonNeed, number[]>;
  health: number;
  /** Consecutive days below the hardship threshold, per need. */
  lowStreak: Record<PersonNeed, number>;
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
  /** Per instance at full maturity and health: output of each resource. */
  outputs: Record<string, number>;
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
}

export interface NeedDay {
  /** Output of feeding resources, in the row's unit. */
  provided: number;
  /** Requests from every consumer of feeding resources, in the row's unit. */
  needed: number;
  /** What those consumers actually received, in the row's unit. */
  delivered: number;
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
  };
  /** Upkeep hours worked per system today (construction is in labor.construction). */
  laborBySystem: Record<string, number>;
  /** Systems running below full satisfaction today, with the input that limited them. */
  curtailed: { systemId: string; count: number; sat: number; limitedBy: string | null }[];
  weather: DayWeather;
  /** Flow output bought from outside today (grid power, city water, groceries), by resource. */
  bought: Record<string, number>;
  /** Household members who entered hardship today. */
  hardships: number;
  /** Average household health today. */
  health: number;
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
  flags: { short: Record<string, string[]>; spilling: boolean };
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
  | { kind: 'hardship'; absDay: number; instanceId: string; need: PersonNeed; level: number }
  | { kind: 'health'; absDay: number; instanceId: string; health: number };
