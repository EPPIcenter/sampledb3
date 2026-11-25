import { parseStoredTimestamp } from '../datetime'
import { parseCollectionDate } from '../validation'

export type DailyCount = { date: string; count: number }

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * The calendar dates (YYYY-MM-DD) of stored collection dates. A legacy value in another format
 * the collection-date rule accepts, such as `5/7/2024`, is read as that date; a value that isn't
 * a date is left out.
 */
function collectionCalendarDates(dates: ReadonlyArray<string | null>): string[] {
  const calendarDates: string[] = []
  for (const date of dates) {
    const calendarDate = date ? parseCollectionDate(date) : null
    if (calendarDate) calendarDates.push(calendarDate)
  }
  return calendarDates
}

/** Counts per key, in key order. */
function countByKey(keys: Iterable<string>): DailyCount[] {
  const counts = new Map<string, number>()
  for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1)
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([date, count]) => ({ date, count }))
}

/** Earliest and latest collection dates as YYYY-MM-DD, in date order, or null when none is a date. */
export function collectionDateRangeOf(dates: ReadonlyArray<string | null>): { earliest: string; latest: string } | null {
  const calendarDates = collectionCalendarDates(dates)
  if (calendarDates.length === 0) return null
  let earliest = calendarDates[0]!
  let latest = earliest
  for (const date of calendarDates) {
    if (date < earliest) earliest = date
    if (date > latest) latest = date
  }
  return { earliest, latest }
}

function parseCalendarDateUtc(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|[T ])/.exec(value)
  if (!match) return NaN
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const ms = Date.UTC(year, month - 1, day)
  const check = new Date(ms)
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    return NaN
  }
  return ms
}

/** Whole days from `earliest` to `latest`, both YYYY-MM-DD (or timestamps starting with one). */
export function daysBetweenCalendarDates(earliest: string, latest: string): number {
  return Math.round((parseCalendarDateUtc(latest) - parseCalendarDateUtc(earliest)) / DAY_MS)
}

/** Specimens collected per calendar day. */
export function collectionTimeline(dates: ReadonlyArray<string | null>): DailyCount[] {
  return countByKey(collectionCalendarDates(dates))
}

/** Subjects enrolled per UTC day of their stored `created` timestamp. */
export function enrollmentTimeline(created: ReadonlyArray<string>): DailyCount[] {
  const days: string[] = []
  for (const value of created) {
    const instant = parseStoredTimestamp(value)
    if (instant) days.push(instant.toISOString().slice(0, 10))
  }
  return countByKey(days)
}
