import { describe, it, expect } from 'vitest'
import { calendarDaysBetween, shiftCalendarDate } from '../datetime'

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

describe('calendarDaysBetween', () => {
  it('counts whole calendar days across months, a leap day, and DST changes', () => {
    expect(calendarDaysBetween('2024-01-15', '2024-01-15')).toBe(0)
    expect(calendarDaysBetween('2024-02-28', '2024-03-01')).toBe(2)
    expect(calendarDaysBetween('2024-11-03', '2024-11-04')).toBe(1)
    expect(calendarDaysBetween('2024-03-10', '2024-03-11')).toBe(1)
  })

  it('counts by the date part of a timestamp, whatever the time of day', () => {
    expect(calendarDaysBetween('2024-11-03T09:00:00', '2024-11-04T10:00:00')).toBe(1)
    expect(calendarDaysBetween('2024-11-03', '2024-11-04 18:00:00')).toBe(1)
  })
})
