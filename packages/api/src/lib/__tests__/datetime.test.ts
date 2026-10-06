import { describe, it, expect } from 'vitest'
import { shiftCalendarDate } from '../datetime'

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
