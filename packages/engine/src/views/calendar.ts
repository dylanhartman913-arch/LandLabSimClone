import type { Season } from './hud.ts';

/**
 * Display calendar: four seasons of 28 days each, mapped onto the engine's
 * 365-day calendar (the engine itself always runs on real days). Seasons are
 * meteorological: spring Mar 1, summer Jun 1, fall Sep 1, winter Dec 1.
 */
export const DISPLAY_SEASONS: readonly { season: Season; startDay: number; days: number }[] = [
  { season: 'spring', startDay: 59, days: 92 }, // Mar 1 – May 31
  { season: 'summer', startDay: 151, days: 92 }, // Jun 1 – Aug 31
  { season: 'fall', startDay: 243, days: 91 }, // Sep 1 – Nov 30
  { season: 'winter', startDay: 334, days: 90 }, // Dec 1 – Feb 28
];
export const DISPLAY_DAYS_PER_SEASON = 28;

export interface DisplayDate {
  season: Season;
  /** 1-28 */
  dayOfSeason: number;
  /** 1-based display year; winter belongs to the year it starts in. */
  year: number;
  /** "Spring 12, year 1" */
  label: string;
  /** Engine day index at which this display season starts (for "end of season" checks). */
  seasonStartDay: number;
  /** True on the last engine day of the season. */
  lastDayOfSeason: boolean;
}

const LABEL: Record<Season, string> = { spring: 'Spring', summer: 'Summer', fall: 'Fall', winter: 'Winter' };

export function displayDate(day: number, year: number): DisplayDate {
  let s = DISPLAY_SEASONS[3]!;
  for (const x of DISPLAY_SEASONS) if (day >= x.startDay && day < x.startDay + x.days) s = x;
  const into = s.season === 'winter' ? (day - s.startDay + 365) % 365 : day - s.startDay;
  const dayOfSeason = Math.min(
    DISPLAY_DAYS_PER_SEASON,
    Math.floor((into / s.days) * DISPLAY_DAYS_PER_SEASON) + 1,
  );
  const displayYear = s.season === 'winter' && day < s.startDay ? year : year + 1;
  return {
    season: s.season,
    dayOfSeason,
    year: displayYear,
    label: `${LABEL[s.season]} ${dayOfSeason}, year ${displayYear}`,
    seasonStartDay: s.startDay,
    lastDayOfSeason: into === s.days - 1,
  };
}
