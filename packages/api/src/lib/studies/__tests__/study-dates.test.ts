import { describe, it, expect } from 'vitest'
import { daysBetweenCalendarDates } from '../study-dates'

describe('daysBetweenCalendarDates', () => {
  it('counts whole calendar days between valid ISO dates', () => {
    expect(daysBetweenCalendarDates('2024-01-15', '2024-01-15')).toBe(0)
    expect(daysBetweenCalendarDates('2024-02-28', '2024-03-01')).toBe(2)
    expect(daysBetweenCalendarDates('2024-01-01', '2024-12-31')).toBe(365)
  })

  it('accepts timestamps separated by T or space after the calendar date', () => {
    expect(daysBetweenCalendarDates('2024-11-03T09:00:00Z', '2024-11-04T10:00:00Z')).toBe(1)
    expect(daysBetweenCalendarDates('2024-11-03 23:00:00', '2024-11-04 01:00:00')).toBe(1)
  })

  it('returns NaN for impossible calendar dates', () => {
    expect(daysBetweenCalendarDates('2024-02-31', '2024-03-01')).toBeNaN()
    expect(daysBetweenCalendarDates('2023-02-29', '2023-03-01')).toBeNaN()
    expect(daysBetweenCalendarDates('2024-01-01', '2024-13-01')).toBeNaN()
  })

  it('returns NaN when trailing text follows the date without a T or space separator', () => {
    expect(daysBetweenCalendarDates('2024-11-03', '2024-11-04xyz')).toBeNaN()
    expect(daysBetweenCalendarDates('2024-11-03-extra', '2024-11-04')).toBeNaN()
  })
})
