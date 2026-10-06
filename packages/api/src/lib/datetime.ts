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
