/**
 * Date filter bounds from a request (issue #104). Collection dates are stored as YYYY-MM-DD and
 * compared as strings, so a malformed bound such as `garbage` or `5/7/2024` would silently
 * match everything or nothing. (A stored date migration 008 could not read stays as it was;
 * `isCalendarDate` in `sql-helpers.ts` keeps it out of a filter.) These helpers reject it with a `ValidationError` (400) instead.
 */
import { ValidationError } from './error-handler'
import { parseCollectionDate } from './validation'
import { parseStoredTimestamp } from './datetime'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?$/
const DATE_OR_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})?)?$/

/** True when `value` is a real calendar date written YYYY-MM-DD. */
export function isIsoCalendarDate(value: string): boolean {
  return ISO_DATE.test(value) && parseCollectionDate(value) === value
}

/**
 * True when `value` is a real calendar date written YYYY-MM-DD, optionally followed by a time
 * (`YYYY-MM-DD HH:MM[:SS[.fff]]` or the ISO `T` form, with an optional `Z` or `±HH:MM` zone).
 * Rejects text `parseStoredTimestamp` alone would still read, such as `2024-02-30` (rolled over to
 * March 1), `3/5/2024` or `1`.
 */
export function isDateOrTimestamp(value: string): boolean {
  const match = DATE_OR_TIMESTAMP.exec(value)
  return match != null && isIsoCalendarDate(match[1]) && parseStoredTimestamp(value) !== null
}

/**
 * A collection-date filter bound. Empty or omitted means no bound; anything other than a real
 * YYYY-MM-DD date throws a `ValidationError` naming `label`.
 */
export function collectionDateFilter(label: string, value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const text = value.trim()
  if (text === '') return undefined
  if (!isIsoCalendarDate(text)) {
    throw new ValidationError(`Invalid ${label} '${value}': use a date written YYYY-MM-DD.`)
  }
  return text
}

/**
 * A bound on a created timestamp (stored as `YYYY-MM-DD HH:MM:SS`): YYYY-MM-DD, optionally
 * followed by a time. The time is written as stored (space separator, seconds) so the bound
 * compares with stored values as text.
 * Empty or omitted means no bound; anything else throws a `ValidationError` naming `label`.
 */
export function timestampFilter(label: string, value: string | null | undefined): string | undefined {
  if (value == null) return undefined
  const text = value.trim()
  if (text === '') return undefined
  const match = TIMESTAMP.exec(text)
  if (!match || !isIsoCalendarDate(match[1])) {
    throw new ValidationError(`Invalid ${label} '${value}': use YYYY-MM-DD or YYYY-MM-DD HH:MM:SS.`)
  }
  if (!match[2]) return match[1]
  // HH:MM means HH:MM:00, so an upper bound includes a row stored at exactly that minute.
  const time = match[2].length === 5 ? `${match[2]}:00` : match[2]
  return `${match[1]} ${time}`
}
