import { describe, it, expect } from 'vitest'
import {
  idParam,
  optionalIdParam,
  email,
  isoDate,
  dateString,
  optionalDateString,
  nonEmptyString,
  positiveNumber,
  nonNegativeNumber,
  integer,
  positiveInteger,
  optionalPositiveInteger,
  parseId,
  validateId,
} from '../common-validators'

describe('common-validators', () => {
  describe('idParam', () => {
    it('parses valid positive integer string', () => {
      expect(idParam.parse('1')).toBe(1)
      expect(idParam.parse('42')).toBe(42)
      expect(idParam.parse('999')).toBe(999)
    })

    it('rejects zero', () => {
      expect(() => idParam.parse('0')).toThrow()
    })

    it('rejects negative', () => {
      expect(() => idParam.parse('-1')).toThrow()
    })

    it('rejects non-numeric string', () => {
      expect(() => idParam.parse('abc')).toThrow()
      expect(() => idParam.parse('1.5')).toThrow()
      expect(() => idParam.parse('')).toThrow()
    })
  })

  describe('optionalIdParam', () => {
    it('parses valid id or undefined', () => {
      expect(optionalIdParam.parse('5')).toBe(5)
      expect(optionalIdParam.parse(undefined)).toBeUndefined()
    })
  })

  describe('email', () => {
    it('accepts valid email', () => {
      expect(email.parse('a@b.co')).toBe('a@b.co')
      expect(email.parse('user@example.com')).toBe('user@example.com')
    })

    it('rejects invalid email', () => {
      expect(() => email.parse('invalid')).toThrow()
      expect(() => email.parse('@nodomain.com')).toThrow()
      expect(() => email.parse('noatsign.com')).toThrow()
    })
  })

  describe('isoDate', () => {
    it('accepts ISO 8601 datetime string', () => {
      expect(isoDate.parse('2024-01-15T12:00:00.000Z')).toBe('2024-01-15T12:00:00.000Z')
    })

    it('rejects invalid date format', () => {
      expect(() => isoDate.parse('2024-01-15')).toThrow()
      expect(() => isoDate.parse('not-a-date')).toThrow()
    })
  })

  describe('dateString', () => {
    it('accepts valid date strings', () => {
      expect(dateString.parse('2024-01-15')).toBe('2024-01-15')
      expect(dateString.parse('2024-01-15T00:00:00.000Z')).toBe('2024-01-15T00:00:00.000Z')
    })

    it('rejects invalid date', () => {
      expect(() => dateString.parse('not-a-date')).toThrow()
      expect(() => dateString.parse('2024-13-45')).toThrow()
    })
  })

  describe('optionalDateString', () => {
    it('accepts valid date or undefined', () => {
      expect(optionalDateString.parse('2024-01-15')).toBe('2024-01-15')
      expect(optionalDateString.parse(undefined)).toBeUndefined()
    })
  })

  describe('nonEmptyString', () => {
    it('accepts non-empty string', () => {
      expect(nonEmptyString.parse('a')).toBe('a')
      expect(nonEmptyString.parse('hello')).toBe('hello')
    })

    it('rejects empty string', () => {
      expect(() => nonEmptyString.parse('')).toThrow()
    })
  })

  describe('positiveNumber', () => {
    it('accepts positive number', () => {
      expect(positiveNumber.parse(0.1)).toBe(0.1)
      expect(positiveNumber.parse(1)).toBe(1)
    })

    it('rejects zero and negative', () => {
      expect(() => positiveNumber.parse(0)).toThrow()
      expect(() => positiveNumber.parse(-1)).toThrow()
    })
  })

  describe('nonNegativeNumber', () => {
    it('accepts zero and positive', () => {
      expect(nonNegativeNumber.parse(0)).toBe(0)
      expect(nonNegativeNumber.parse(1)).toBe(1)
    })

    it('rejects negative', () => {
      expect(() => nonNegativeNumber.parse(-1)).toThrow()
    })
  })

  describe('integer', () => {
    it('accepts integer', () => {
      expect(integer.parse(0)).toBe(0)
      expect(integer.parse(42)).toBe(42)
    })

    it('rejects non-integer', () => {
      expect(() => integer.parse(1.5)).toThrow()
    })
  })

  describe('positiveInteger', () => {
    it('accepts positive integer', () => {
      expect(positiveInteger.parse(1)).toBe(1)
      expect(positiveInteger.parse(100)).toBe(100)
    })

    it('rejects zero and negative', () => {
      expect(() => positiveInteger.parse(0)).toThrow()
      expect(() => positiveInteger.parse(-1)).toThrow()
    })
  })

  describe('optionalPositiveInteger', () => {
    it('accepts positive integer or undefined', () => {
      expect(optionalPositiveInteger.parse(1)).toBe(1)
      expect(optionalPositiveInteger.parse(undefined)).toBeUndefined()
    })
  })

  describe('parseId', () => {
    it('returns number for valid id string', () => {
      expect(parseId('1')).toBe(1)
      expect(parseId('42')).toBe(42)
    })

    it('returns null for undefined, empty, invalid', () => {
      expect(parseId(undefined)).toBe(null)
      expect(parseId('')).toBe(null)
      expect(parseId('abc')).toBe(null)
      expect(parseId('0')).toBe(null)
      expect(parseId('-1')).toBe(null)
    })
  })

  describe('validateId', () => {
    it('returns valid for positive integer', () => {
      expect(validateId(1)).toEqual({ valid: true })
      expect(validateId(42)).toEqual({ valid: true })
    })

    it('returns invalid for null, undefined, zero, negative', () => {
      expect(validateId(null)).toEqual({ valid: false, error: 'ID is required' })
      expect(validateId(undefined)).toEqual({ valid: false, error: 'ID is required' })
      expect(validateId(0)).toEqual({ valid: false, error: 'Invalid ID' })
      expect(validateId(-1)).toEqual({ valid: false, error: 'Invalid ID' })
    })
  })
})
