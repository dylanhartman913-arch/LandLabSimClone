import type { Site } from '@homestead/catalog';
import type { ClimateTable, DayWeather } from './climate.ts';
import type { WeatherMode } from './types.ts';

/**
 * The day's weather. Average mode (the "80%" model) is the site's average-year
 * table. Real-weather mode (G9) draws seeded variation on top; until then it
 * returns the average day and leaves the RNG untouched.
 */
export function weatherFor(
  site: Site,
  table: ClimateTable,
  day: number,
  _mode: WeatherMode,
  rng: number,
): [DayWeather, number] {
  const base = table.days[day]!;
  const tags: string[] = [];
  if (day + 1 === site.growingSeason.startDay) tags.push('last frost');
  if (day === site.growingSeason.endDay) tags.push('first frost');
  return [tags.length ? { ...base, tags } : base, rng];
}
