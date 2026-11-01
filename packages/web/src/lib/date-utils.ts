const CALENDAR_DATE = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/
const ZONELESS_DATETIME = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/

/**
 * Parse a date or server timestamp for display. Every date string from the API goes through
 * here.
 *
 * - A bare YYYY-MM-DD (a collection date) or YYYY-MM (a timeline month) is a calendar date, so
 *   it is built in local time: new Date('2024-01-15') is UTC midnight, which renders as Jan 14
 *   in the Americas.
 * - A timestamp with no zone marker, such as SQLite's `YYYY-MM-DD HH:MM:SS` from
 *   `current_timestamp` or `utcNow()`, is UTC. new Date() would read it as local time.
 * - Anything else (ISO with `Z` or an offset) keeps its own zone.
 */
export function parseDisplayDate(value: string): Date {
  const calendar = CALENDAR_DATE.exec(value)
  if (calendar) {
    return new Date(Number(calendar[1]), Number(calendar[2]) - 1, calendar[3] ? Number(calendar[3]) : 1)
  }
  const zoneless = ZONELESS_DATETIME.exec(value)
  if (zoneless) return new Date(`${zoneless[1]}T${zoneless[2]}Z`)
  return new Date(value)
}

/** Milliseconds since the epoch for a date or server timestamp (see parseDisplayDate). */
export function displayDateTime(value: string): number {
  return parseDisplayDate(value).getTime()
}

/** A Date as a local YYYY-MM-DD calendar date (toISOString() gives the UTC date). */
export function toLocalDateString(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Today's local calendar date as YYYY-MM-DD, for date input defaults. */
export function localToday(): string {
  return toLocalDateString(new Date())
}

/**
 * Formats a date string with relative time for recent dates and absolute dates for older items
 * @param dateString - Date or server timestamp (see parseDisplayDate)
 * @returns Formatted date string (e.g., "2 days ago" or "Jan 15, 2024")
 */
export function formatDateWithRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  const date = parseDisplayDate(dateString)
  const now = new Date()
  // A timestamp slightly ahead of this clock (server clock skew) reads as "Just now", not as a
  // negative age.
  const diffMs = Math.max(0, now.getTime() - date.getTime())
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  
  // Use relative time for dates within the last 7 days
  if (diffDays === 0) {
    if (diffMinutes < 1) return 'Just now'
    if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes !== 1 ? 's' : ''} ago`
    return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  }
  
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays} days ago`
  
  // Use absolute date for older items
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const DATE_FORMATS = {
  short: { month: 'short', day: 'numeric', year: 'numeric' },
  long: { month: 'long', day: 'numeric', year: 'numeric' },
  numeric: { month: 'numeric', day: 'numeric', year: 'numeric' },
} satisfies Record<string, Intl.DateTimeFormatOptions>

/**
 * Format a date for display: "Jan 15, 2024" (short), "January 15, 2024" (long), or
 * "1/15/2024" (numeric). A bare YYYY-MM-DD shows that calendar day (see parseDisplayDate).
 */
export function formatDate(
  dateString: string | null | undefined,
  style: keyof typeof DATE_FORMATS = 'short',
): string {
  if (!dateString) return 'N/A'
  return parseDisplayDate(dateString).toLocaleDateString('en-US', DATE_FORMATS[style])
}

/**
 * Format a server timestamp as a local date and time, e.g. "1/15/2024, 3:45:00 PM" in en-US.
 */
export function formatDateTime(
  dateString: string | null | undefined,
  options?: Intl.DateTimeFormatOptions,
): string {
  if (!dateString) return 'N/A'
  return parseDisplayDate(dateString).toLocaleString(undefined, options)
}

/**
 * Format a date as a filesystem-safe local datetime string.
 * Format: YYYY-MM-DD_HH-MM-SS (e.g., "2026-01-27_14-30-45")
 * @param date - Date to format (defaults to now)
 */
export function formatLocalDateTime(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}_${hours}-${minutes}-${seconds}`
}