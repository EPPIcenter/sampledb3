/**
 * Numeric query parameters (issue #120). A list filter such as `subject_id=abc` used to be
 * dropped, so the list returned every row, and an oversized `page` reached SQLite as a float
 * offset and failed with a 500. These helpers reject such values with a `ValidationError` (400)
 * that names the parameter.
 */
import { ValidationError } from './error-handler'

/**
 * The highest page number a list accepts. Far above any real list, and low enough that
 * `(page - 1) * limit` stays a safe integer for any page size.
 */
export const MAX_PAGE = 1_000_000

const POSITIVE_INTEGER = /^\d+$/

function positiveId(name: string, value: string): number {
  const text = value.trim()
  const id = POSITIVE_INTEGER.test(text) ? Number(text) : NaN
  if (!Number.isSafeInteger(id) || id < 1) {
    throw new ValidationError(`Invalid ${name} '${value}': use a positive whole number.`)
  }
  return id
}

/** An id filter. Empty or omitted means no filter; anything but a positive integer throws. */
export function idQueryParam(name: string, value: string | null | undefined): number | undefined {
  if (value == null || value.trim() === '') return undefined
  return positiveId(name, value)
}

/**
 * A repeated id filter (`tag_ids=1&tag_ids=2`). Omitted or all-empty means no filter; any value
 * that is not a positive integer throws.
 */
export function idListQueryParam(name: string, values: readonly string[] | null | undefined): number[] | undefined {
  const present = (values ?? []).filter((value) => value.trim() !== '')
  if (present.length === 0) return undefined
  return present.map((value) => positiveId(name, value))
}

/**
 * A page number. Omitted, empty or below 1 means page 1, and text that does not start with a
 * number does too, as before; a page above `MAX_PAGE` throws.
 */
export function pageQueryParam(value: string | number | undefined, name = 'page'): number {
  const parsed = typeof value === 'string' ? parseInt(value, 10) : value
  if (parsed === undefined || Number.isNaN(parsed)) return 1
  if (parsed > MAX_PAGE) {
    throw new ValidationError(`Invalid ${name} '${value}': the highest page is ${MAX_PAGE}.`)
  }
  return Math.max(1, Math.trunc(parsed))
}
