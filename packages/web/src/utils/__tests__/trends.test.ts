import { describe, it, expect } from 'vitest'
import { calculateTrend, trendWindows } from '../trends'

describe('trendWindows', () => {
  it('splits the last 60 days into two 30-day windows that meet without overlapping', () => {
    expect(trendWindows(new Date('2026-10-31T15:00:00Z'))).toEqual({
      current: { created_from: '2026-10-02' },
      previous: { created_from: '2026-09-02', created_to: '2026-10-01' },
    })
  })

  it('uses the UTC date, which is how created timestamps are stored', () => {
    // 23:30 UTC on Mar 1 is still Mar 1 in UTC whatever the local zone says.
    expect(trendWindows(new Date('2026-03-01T23:30:00Z'))).toEqual({
      current: { created_from: '2026-01-31' },
      previous: { created_from: '2026-01-01', created_to: '2026-01-30' },
    })
  })
})

describe('calculateTrend', () => {
  it('reports growth from the previous window to the current one', () => {
    expect(calculateTrend(15, 10)).toEqual({ value: 50, positive: true })
  })

  it('reports a decline as a negative trend', () => {
    expect(calculateTrend(3, 4)).toEqual({ value: 25, positive: false })
  })

  it('treats no change as a flat, non-negative trend', () => {
    expect(calculateTrend(5, 5)).toEqual({ value: 0, positive: true })
  })

  it('rounds to one decimal place', () => {
    expect(calculateTrend(2, 3)).toEqual({ value: 33.3, positive: false })
  })

  it('returns null when the previous window is empty, rather than inventing a percentage', () => {
    expect(calculateTrend(12, 0)).toBeNull()
    expect(calculateTrend(0, 0)).toBeNull()
  })
})
