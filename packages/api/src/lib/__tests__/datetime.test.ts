import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { daysBefore, parseStoredTimestamp, shiftCalendarDate, toStoredTimestamp, utcMonthOf } from '../datetime'

describe('shiftCalendarDate', () => {
  it('rolls over months and years', () => {
    expect(shiftCalendarDate('2024-01-31', 1)).toBe('2024-02-01')
    expect(shiftCalendarDate('2024-03-01', -1)).toBe('2024-02-29')
    expect(shiftCalendarDate('2023-12-31', 1)).toBe('2024-01-01')
  })

  it('reads the date part of a timestamp', () => {
    expect(shiftCalendarDate('2024-05-26 22:28:26', 0)).toBe('2024-05-26')
  })

  it('returns null for text that does not start with a date', () => {
    expect(shiftCalendarDate('1/5/2024', 1)).toBeNull()
  })
})

describe('stored timestamp helpers in a non-UTC process time zone', () => {
  const originalTz = process.env.TZ
  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles'
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })

  it('formats an instant as stored UTC text', () => {
    expect(toStoredTimestamp(new Date('2024-01-15T23:59:59.999Z'))).toBe('2024-01-15 23:59:59')
  })

  it('reads zoneless stored text as UTC', () => {
    expect(parseStoredTimestamp('2024-01-15 10:00:00')?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    expect(parseStoredTimestamp('2024-01-15T10:00:00')?.toISOString()).toBe('2024-01-15T10:00:00.000Z')
    expect(parseStoredTimestamp('2024-01-15')?.toISOString()).toBe('2024-01-15T00:00:00.000Z')
    expect(parseStoredTimestamp('2024-01-15T10:00:00+02:00')?.toISOString()).toBe('2024-01-15T08:00:00.000Z')
    expect(parseStoredTimestamp('not a date')).toBeNull()
  })

  it('gives the UTC month at either side of a month boundary', () => {
    expect(utcMonthOf('2024-01-31 23:59:59')).toBe('2024-01')
    expect(utcMonthOf('2024-02-01 00:00:00')).toBe('2024-02')
    expect(utcMonthOf('2024-02-01')).toBe('2024-02')
    expect(utcMonthOf('garbage')).toBeNull()
  })

  it('steps back whole 24-hour days across a DST change', () => {
    expect(daysBefore(new Date('2024-03-15T12:00:00Z'), 7).toISOString()).toBe('2024-03-08T12:00:00.000Z')
  })
})
