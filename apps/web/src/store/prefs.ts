import type { UnitSystem } from '../lib/format.ts';

export type AutoPauseKey = 'shortage' | 'hardship' | 'built' | 'harvest' | 'frost' | 'cash' | 'season';

export const AUTO_PAUSE_LABELS: Record<AutoPauseKey, string> = {
  shortage: 'First shortage of a household need',
  hardship: 'A hardship event',
  built: 'Construction complete',
  harvest: 'A harvest',
  frost: 'First frost',
  cash: 'Cash below one month of running costs',
  season: 'End of a season',
};

/** Per-viewer preferences (kept in localStorage; not part of the game or its saves). */
export interface Prefs {
  units: UnitSystem;
  defaultSpeed: 1 | 3 | 10;
  autoPause: Record<AutoPauseKey, boolean>;
  snap: 0 | 1 | 5 | 10;
  colorblind: boolean;
  reducedMotion: boolean;
  uiScale: number;
  /** Status bubbles on systems that are partial or blocked (B). */
  badges: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  units: 'imperial',
  defaultSpeed: 1,
  autoPause: {
    shortage: true,
    hardship: true,
    built: false,
    harvest: false,
    frost: true,
    cash: true,
    season: true,
  },
  snap: 1,
  colorblind: false,
  // Follows the OS setting until the player chooses.
  reducedMotion:
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches,
  uiScale: 1,
  badges: true,
};
