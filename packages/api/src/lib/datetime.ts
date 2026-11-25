const DAY_MS = 24 * 60 * 60 * 1000

/**
 * An instant in the format server timestamps are stored in: `YYYY-MM-DD HH:MM:SS`, UTC, the
 * same text SQLite's `current_timestamp` writes. Compare a stored timestamp column only with a
 * bound in this format; an ISO string (`…T…Z`) sorts after every stored value on its day.
 */
export function toStoredTimestamp(instant: Date): string {
  return instant.toISOString().slice(0, 19).replace('T', ' ')
}

/** UTC timestamp in SQLite canonical format: YYYY-MM-DD HH:MM:SS */
export function utcNow(): string {
  return toStoredTimestamp(new Date())
}

/** The instant exactly `days` × 24 hours before `now`, independent of the local time zone. */
export function daysBefore(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS)
}

/**
 * The instant a stored timestamp names. A value without a zone (`YYYY-MM-DD HH:MM:SS`,
 * `YYYY-MM-DDTHH:MM:SS`, or a bare `YYYY-MM-DD`) is UTC, whatever the process time zone;
 * `new Date(text)` would read the first two as local time. Null when the text isn't a date.
 */
export function parseStoredTimestamp(value: string): Date | null {
  const text = value.trim()
  const zoneless = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?))?$/.exec(text)
  let date = new Date(text)
  if (zoneless) {
    const [, day, time = '00:00:00'] = zoneless
    date = new Date(`${day}T${time}Z`)
  }
  return Number.isNaN(date.getTime()) ? null : date
}

/** The UTC month (`YYYY-MM`) of a stored timestamp or date, or null when it isn't a date. */
export function utcMonthOf(value: string): string | null {
  const date = parseStoredTimestamp(value)
  return date ? date.toISOString().slice(0, 7) : null
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
