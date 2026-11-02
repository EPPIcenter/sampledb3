import { describe, it, expect } from 'vitest'
import { compareBySortType, compareText, type SortDirection, type SortType } from '../sort-compare'

function sorted(values: unknown[], type: SortType, direction: SortDirection = 'asc'): unknown[] {
  return [...values].sort((a, b) => compareBySortType(a, b, type, direction))
}

describe('compareText', () => {
  it('orders digit runs by value and ignores case', () => {
    const names = ['S10', 's2', 'S1', 'b', 'A']
    expect([...names].sort(compareText)).toEqual(['A', 'b', 'S1', 's2', 'S10'])
  })

  it('ignores leading and trailing whitespace', () => {
    expect([' Dire Dawa', 'Accra', 'Zumba '].sort(compareText)).toEqual(['Accra', ' Dire Dawa', 'Zumba '])
  })
})

describe('compareBySortType', () => {
  it('sorts text naturally rather than as dates', () => {
    expect(sorted(['100', '350', '10', '2', '1'], 'text')).toEqual(['1', '2', '10', '100', '350'])
    expect(sorted(['100', '350', '10', '2', '1'], 'text', 'desc')).toEqual(['350', '100', '10', '2', '1'])
  })

  it('sorts numbers by value, including numeric strings', () => {
    expect(sorted([10, '9', 100, 0.5], 'number')).toEqual([0.5, '9', 10, 100])
  })

  it('sorts a zoneless server timestamp as UTC', () => {
    // Tests run in America/Los_Angeles: read as local time, 10:00 would be 18:00Z and sort last.
    const dates = ['2024-01-15T12:00:00Z', '2024-01-15 10:00:00']
    expect(sorted(dates, 'date')).toEqual(['2024-01-15 10:00:00', '2024-01-15T12:00:00Z'])
  })

  it('sorts dates chronologically', () => {
    const dates = ['2024-03-01', '2023-12-31T23:00:00Z', '2024-01-15']
    expect(sorted(dates, 'date')).toEqual(['2023-12-31T23:00:00Z', '2024-01-15', '2024-03-01'])
    expect(sorted(dates, 'date', 'desc')).toEqual(['2024-03-01', '2024-01-15', '2023-12-31T23:00:00Z'])
  })

  it('puts missing and unparseable values last in both directions', () => {
    expect(sorted([null, 3, '', 1], 'number')).toEqual([1, 3, null, ''])
    expect(compareBySortType(undefined, 1, 'number', 'desc')).toBeGreaterThan(0)
    expect(compareBySortType(1, undefined, 'number', 'asc')).toBeLessThan(0)
    expect(sorted([null, 3, '', 1], 'number', 'desc')).toEqual([3, 1, null, ''])
    expect(sorted(['not a date', '2024-01-01', null, '2023-01-01'], 'date', 'desc')).toEqual([
      '2024-01-01',
      '2023-01-01',
      'not a date',
      null,
    ])
    expect(sorted([null, 'b', 'a'], 'text', 'desc')).toEqual(['b', 'a', null])
  })
})
