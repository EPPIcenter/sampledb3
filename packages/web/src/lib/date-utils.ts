/**
 * Parse a date for display. A bare YYYY-MM-DD is a calendar date, so it is built in local
 * time: new Date('2024-01-15') is UTC midnight, which renders as Jan 14 in the Americas.
 */
export function parseDisplayDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (match) return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return new Date(value)
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
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "2 days ago" or "Jan 15, 2024")
 */
export function formatDateWithRelativeTime(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  const date = parseDisplayDate(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
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

/**
 * Formats a date string as an absolute date
 * @param dateString - ISO date string
 * @returns Formatted date string (e.g., "Jan 15, 2024")
 */
export function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return 'N/A'
  
  const date = parseDisplayDate(dateString)
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
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