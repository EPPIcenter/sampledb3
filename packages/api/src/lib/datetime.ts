/** UTC timestamp in SQLite canonical format: YYYY-MM-DD HH:MM:SS */
export function utcNow(): string {
  return new Date().toISOString().replace('T', ' ').replace('Z', '').split('.')[0]
}

/**
 * The calendar date `days` after a value that starts with YYYY-MM-DD (negative goes back), or
 * null when it doesn't start with one. Month and year rollovers follow the calendar.
 */
export function shiftCalendarDate(date: string, days: number): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days)).toISOString().slice(0, 10)
}

/** UTC midnight of a value's calendar date: its leading YYYY-MM-DD, or else its local date. */
function calendarDateAsUtc(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value)
  if (match) return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  const date = new Date(value)
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
}

/**
 * Whole calendar days from one date to a later one. Counted in UTC, where every day is 24
 * hours, so neither a time of day nor a DST change adds a day. The web's
 * `calendarDaysBetween` counts a filtered study duration the same way.
 */
export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((calendarDateAsUtc(to) - calendarDateAsUtc(from)) / 86_400_000)
}
