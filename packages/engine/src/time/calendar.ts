/** The engine calendar: 365 days, no leap years. Day index 0 = January 1. */
export const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;
export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;
export const DAYS_PER_YEAR = 365;

const MONTH_OF_DAY: number[] = [];
const MONTH_START: number[] = [];
{
  let d = 0;
  DAYS_IN_MONTH.forEach((n, m) => {
    MONTH_START.push(d);
    for (let i = 0; i < n; i++) MONTH_OF_DAY.push(m);
    d += n;
  });
}

export function monthOfDay(day: number): number {
  return MONTH_OF_DAY[((day % 365) + 365) % 365]!;
}

export function monthStartDay(month: number): number {
  return MONTH_START[month]!;
}

/** 1-based week of the year; day 364 belongs to week 52. */
export function weekOfDay(day: number): number {
  return Math.min(52, Math.floor(day / 7) + 1);
}

/** First and last day index (inclusive) of a 1-based week window. */
export function windowDays(
  startWeek: number,
  endWeek: number,
): { first: number; last: number; days: number } {
  const first = (startWeek - 1) * 7;
  const last = endWeek === 52 ? 364 : endWeek * 7 - 1;
  return { first, last, days: last - first + 1 };
}

export function dateLabel(day: number, year: number): string {
  const m = monthOfDay(day);
  return `${MONTH_NAMES[m]} ${day - monthStartDay(m) + 1}, year ${year + 1}`;
}
