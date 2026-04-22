import { describe, it, expect } from 'vitest'
import { isError, isErrorLike, getErrorMessage, getErrorStack } from '../error-utils'

describe('error-utils', () => {
  describe('isError', () => {
    it('returns true for Error instances', () => {
      expect(isError(new Error('test'))).toBe(true)
    })
    it('returns false for plain object with message', () => {
      expect(isError({ message: 'oops' })).toBe(false)
    })
    it('returns false for string', () => {
      expect(isError('oops')).toBe(false)
    })
    it('returns false for null', () => {
      expect(isError(null)).toBe(false)
    })
  })

  describe('isErrorLike', () => {
    it('returns true for object with string message', () => {
      expect(isErrorLike({ message: 'oops' })).toBe(true)
    })
    it('returns false for Error instance', () => {
      expect(isErrorLike(new Error('test'))).toBe(true)
    })
    it('returns false when message is not a string', () => {
      expect(isErrorLike({ message: 123 })).toBe(false)
    })
    it('returns false for null', () => {
      expect(isErrorLike(null)).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('returns message from Error', () => {
      expect(getErrorMessage(new Error('fail'))).toBe('fail')
    })
    it('returns message from error-like object', () => {
      expect(getErrorMessage({ message: 'oops' })).toBe('oops')
    })
    it('returns string error as-is', () => {
      expect(getErrorMessage('string error')).toBe('string error')
    })
    it('returns fallback for unknown', () => {
      expect(getErrorMessage(null)).toBe('An unknown error occurred')
      expect(getErrorMessage(42, 'custom')).toBe('custom')
    })
  })

  describe('getErrorStack', () => {
    it('returns stack for Error', () => {
      const err = new Error('test')
      expect(getErrorStack(err)).toBeDefined()
      expect(typeof getErrorStack(err)).toBe('string')
    })
    it('returns undefined for non-Error', () => {
      expect(getErrorStack({ message: 'oops' })).toBeUndefined()
      expect(getErrorStack(null)).toBeUndefined()
    })
  })
})
