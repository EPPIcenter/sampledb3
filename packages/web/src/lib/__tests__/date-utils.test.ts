import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { formatDate, formatDateWithRelativeTime } from '../date-utils'

describe('date-utils', () => {
  const fixedDate = new Date('2024-06-15T12:00:00.000Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(fixedDate)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('formatDate', () => {
    it('returns N/A for null', () => {
      expect(formatDate(null)).toBe('N/A')
    })

    it('returns N/A for undefined', () => {
      expect(formatDate(undefined)).toBe('N/A')
    })

    it('returns formatted date for valid ISO string', () => {
      const result = formatDate('2024-01-15T12:00:00.000Z')
      expect(result).toMatch(/Jan|January/)
      expect(result).toMatch(/\d+/)
      expect(result).toContain('2024')
    })
  })

  describe('formatDateWithRelativeTime', () => {
    it('returns N/A for null', () => {
      expect(formatDateWithRelativeTime(null)).toBe('N/A')
    })

    it('returns N/A for undefined', () => {
      expect(formatDateWithRelativeTime(undefined)).toBe('N/A')
    })

    it('returns "Just now" for date within last minute', () => {
      const thirtySecondsAgo = new Date(fixedDate.getTime() - 30 * 1000).toISOString()
      expect(formatDateWithRelativeTime(thirtySecondsAgo)).toBe('Just now')
    })

    it('returns "X minutes ago" for date within last hour', () => {
      const fiveMinutesAgo = new Date(fixedDate.getTime() - 5 * 60 * 1000).toISOString()
      expect(formatDateWithRelativeTime(fiveMinutesAgo)).toBe('5 minutes ago')
    })

    it('returns "1 minute ago" for singular', () => {
      const oneMinuteAgo = new Date(fixedDate.getTime() - 1 * 60 * 1000).toISOString()
      expect(formatDateWithRelativeTime(oneMinuteAgo)).toBe('1 minute ago')
    })

    it('returns "Yesterday" for date one day ago', () => {
      const oneDayAgo = new Date(fixedDate.getTime() - 24 * 60 * 60 * 1000).toISOString()
      expect(formatDateWithRelativeTime(oneDayAgo)).toBe('Yesterday')
    })

    it('returns "X days ago" for date within last 7 days', () => {
      const threeDaysAgo = new Date(fixedDate.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString()
      expect(formatDateWithRelativeTime(threeDaysAgo)).toBe('3 days ago')
    })

    it('returns absolute date for date older than 7 days', () => {
      const tenDaysAgo = new Date(fixedDate.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString()
      const result = formatDateWithRelativeTime(tenDaysAgo)
      expect(result).toMatch(/Jun|June|May/)
      expect(result).toContain('2024')
    })
  })
})

describe('calendar dates in local time', () => {
  it('parseDisplayDate keeps a bare YYYY-MM-DD on its calendar day', async () => {
    const { parseDisplayDate } = await import('../date-utils')
    const d = parseDisplayDate('2024-01-15')
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2024, 0, 15])
  })

  it('formatDate shows a collection date on its own day', async () => {
    const { formatDate } = await import('../date-utils')
    expect(formatDate('2024-01-15')).toBe('Jan 15, 2024')
  })

  it('toLocalDateString uses the local date, not the UTC date', async () => {
    const { toLocalDateString } = await import('../date-utils')
    // 11pm local on Jan 15 is already Jan 16 in UTC for any zone west of UTC.
    expect(toLocalDateString(new Date(2024, 0, 15, 23, 30))).toBe('2024-01-15')
  })
})

// vitest.config.ts runs the suite in America/Los_Angeles. On Oct 31, 2026 that is UTC-7 (PDT),
// so a server timestamp just after midnight UTC is still the previous evening locally.
describe('server timestamps (UTC with no zone marker)', () => {
  // 6:20 PM PDT on Oct 31, 2026
  const now = new Date('2026-11-01T01:20:02Z')

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(now)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('runs in a time zone west of UTC', () => {
    expect(now.getTimezoneOffset()).toBe(420)
  })

  it('parseDisplayDate reads a SQLite timestamp as UTC', async () => {
    const { parseDisplayDate } = await import('../date-utils')
    const d = parseDisplayDate('2026-11-01 01:10:02')
    expect(d.toISOString()).toBe('2026-11-01T01:10:02.000Z')
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 31, 18])
  })

  it('parseDisplayDate gives the same instant for the T, Z and offset forms', async () => {
    const { parseDisplayDate } = await import('../date-utils')
    const expected = '2026-11-01T01:10:02.000Z'
    expect(parseDisplayDate('2026-11-01T01:10:02').toISOString()).toBe(expected)
    expect(parseDisplayDate('2026-11-01T01:10:02Z').toISOString()).toBe(expected)
    expect(parseDisplayDate('2026-11-01T01:10:02.000Z').toISOString()).toBe(expected)
    expect(parseDisplayDate('2026-10-31T18:10:02-07:00').toISOString()).toBe(expected)
    expect(parseDisplayDate('2026-11-01 01:10').toISOString()).toBe('2026-11-01T01:10:00.000Z')
  })

  it('formatDate shows the local day for a timestamp just after midnight UTC', async () => {
    const { formatDate } = await import('../date-utils')
    expect(formatDate('2026-11-01 01:10:02')).toBe('Oct 31, 2026')
    expect(formatDate('2026-11-01 00:00:00')).toBe('Oct 31, 2026')
  })

  it('formatDate shows the local day for a timestamp just before midnight UTC', async () => {
    const { formatDate } = await import('../date-utils')
    expect(formatDate('2026-10-31 23:59:59')).toBe('Oct 31, 2026')
    // 7:30 AM UTC is still the previous local evening; 7:00 AM UTC is local midnight.
    expect(formatDate('2026-10-31 06:59:59')).toBe('Oct 30, 2026')
    expect(formatDate('2026-10-31 07:00:00')).toBe('Oct 31, 2026')
  })

  it('formatDateWithRelativeTime gives a past age for a timestamp just after midnight UTC', async () => {
    const { formatDateWithRelativeTime } = await import('../date-utils')
    expect(formatDateWithRelativeTime('2026-11-01 01:10:02')).toBe('10 minutes ago')
    expect(formatDateWithRelativeTime('2026-10-31 23:20:02')).toBe('2 hours ago')
    expect(formatDateWithRelativeTime('2026-10-31 01:20:02')).toBe('Yesterday')
  })

  it('formatDateWithRelativeTime never gives a negative age', async () => {
    const { formatDateWithRelativeTime } = await import('../date-utils')
    // A few seconds ahead of the browser clock (clock skew), and a day ahead.
    expect(formatDateWithRelativeTime('2026-11-01 01:20:30')).toBe('Just now')
    expect(formatDateWithRelativeTime('2026-11-02 01:20:02')).toBe('Just now')
  })

  it('formatDateTime shows a server timestamp in local time', async () => {
    const { formatDateTime } = await import('../date-utils')
    expect(formatDateTime('2026-11-01 01:10:02')).toBe(
      new Date(2026, 9, 31, 18, 10, 2).toLocaleString(),
    )
    expect(formatDateTime('2026-11-01 01:10:02', { dateStyle: 'medium', timeZone: 'America/Los_Angeles' }))
      .toBe('Oct 31, 2026')
    expect(formatDateTime(null)).toBe('N/A')
  })

  it('displayDateTime orders server timestamps across midnight UTC', async () => {
    const { displayDateTime } = await import('../date-utils')
    expect(displayDateTime('2026-11-01 00:00:01')).toBeGreaterThan(displayDateTime('2026-10-31 23:59:59'))
    expect(displayDateTime('2026-11-01 00:00:01')).toBe(Date.UTC(2026, 10, 1, 0, 0, 1))
  })

  it('does not shift a collection date or a timeline month', async () => {
    const { formatDate, parseDisplayDate } = await import('../date-utils')
    expect(formatDate('2026-11-01')).toBe('Nov 1, 2026')
    const month = parseDisplayDate('2026-11')
    expect([month.getFullYear(), month.getMonth(), month.getDate()]).toEqual([2026, 10, 1])
  })
})
