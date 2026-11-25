import { describe, it, expect } from 'vitest'
import { isDateOrTimestamp, timestampFilter } from '../date-filters'
import { ValidationError } from '../error-handler'

const IMPOSSIBLE_TIMES = ['99:99:99', '24:00:00', '24:00', '23:60', '23:60:00', '23:59:60', '25:00:00']

describe('timestampFilter', () => {
  it('returns a date, or a date and time written as stored', () => {
    expect(timestampFilter('created_from', '2024-01-01')).toBe('2024-01-01')
    expect(timestampFilter('created_from', '2024-01-01 00:00:00')).toBe('2024-01-01 00:00:00')
    expect(timestampFilter('created_to', '2024-01-01T23:59:59')).toBe('2024-01-01 23:59:59')
    expect(timestampFilter('created_to', ' 2024-01-01 09:30 ')).toBe('2024-01-01 09:30:00')
  })

  it('has no bound for an empty or omitted value', () => {
    expect(timestampFilter('created_from', undefined)).toBeUndefined()
    expect(timestampFilter('created_from', null)).toBeUndefined()
    expect(timestampFilter('created_from', '  ')).toBeUndefined()
  })

  it.each(IMPOSSIBLE_TIMES)('rejects the impossible clock time %s', (time) => {
    for (const separator of [' ', 'T']) {
      const value = `2024-01-01${separator}${time}`
      expect(() => timestampFilter('created_from', value)).toThrow(ValidationError)
      expect(() => timestampFilter('created_from', value)).toThrow(`Invalid created_from '${value}'`)
    }
  })

  it.each(['yesterday', '2024-13-01', '2024-02-30 10:00:00', '2024-01-01 1:00', '2024-01-01 10:00:00.5'])('rejects %s', (value) => {
    expect(() => timestampFilter('created_to', value)).toThrow(ValidationError)
  })
})

describe('isDateOrTimestamp', () => {
  it.each(['2024-01-01', '2024-01-01 23:59:59', '2024-01-01T00:00', '2024-01-01T10:15:30.250Z', '2024-01-01T10:15:30+02:00'])('accepts %s', (value) => {
    expect(isDateOrTimestamp(value)).toBe(true)
  })

  it.each(IMPOSSIBLE_TIMES)('rejects the impossible clock time %s', (time) => {
    expect(isDateOrTimestamp(`2024-01-01 ${time}`)).toBe(false)
    expect(isDateOrTimestamp(`2024-01-01T${time}`)).toBe(false)
    expect(isDateOrTimestamp(`2024-01-01T${time}Z`)).toBe(false)
  })

  it.each(['2024-02-30', '3/5/2024', '1', '2024-01-01T10:00+25:00'])('rejects %s', (value) => {
    expect(isDateOrTimestamp(value)).toBe(false)
  })
})
