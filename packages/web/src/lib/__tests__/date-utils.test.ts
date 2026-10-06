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
