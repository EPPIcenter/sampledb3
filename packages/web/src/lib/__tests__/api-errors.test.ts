import { describe, it, expect } from 'vitest'
import axios from 'axios'
import {
  extractApiError,
  isTypedApiError,
  getErrorMessage,
  type TypedApiError,
} from '../api-errors'

describe('api-errors', () => {
  describe('extractApiError', () => {
    it('maps Axios error with response.data.error and errorCode to message and code', () => {
      const axiosError = new axios.AxiosError('Network error')
      axiosError.response = {
        status: 400,
        statusText: 'Bad Request',
        data: { error: 'Validation failed', errorCode: 'VALIDATION_ERROR', details: [] },
        headers: {},
        config: {} as import('axios').InternalAxiosRequestConfig,
      }
      const result = extractApiError(axiosError)
      expect(result.message).toBe('Validation failed')
      expect(result.code).toBe('VALIDATION_ERROR')
      expect(result.statusCode).toBe(400)
      expect(result.details).toEqual([])
    })

    it('uses axiosError.message when response.data.error is missing', () => {
      const axiosError = new axios.AxiosError('Request failed')
      axiosError.response = {
        status: 500,
        statusText: 'Internal Server Error',
        data: {},
        headers: {},
        config: {} as import('axios').InternalAxiosRequestConfig,
      }
      const result = extractApiError(axiosError)
      expect(result.message).toBe('Request failed')
      expect(result.code).toBe('UNKNOWN')
    })

    it('maps generic Error to message and UNKNOWN code', () => {
      const err = new Error('Something broke')
      const result = extractApiError(err)
      expect(result.message).toBe('Something broke')
      expect(result.code).toBe('UNKNOWN')
      expect(result.originalError).toBe(err)
    })

    it('maps non-Error to "Unknown error" and UNKNOWN code', () => {
      const result = extractApiError('string error')
      expect(result.message).toBe('Unknown error')
      expect(result.code).toBe('UNKNOWN')
    })
  })

  describe('isTypedApiError', () => {
    it('returns true for object with message and code strings', () => {
      const err: TypedApiError = { message: 'Test', code: 'TEST' }
      expect(isTypedApiError(err)).toBe(true)
    })

    it('returns false for Error instance', () => {
      expect(isTypedApiError(new Error('x'))).toBe(false)
    })

    it('returns false for null', () => {
      expect(isTypedApiError(null)).toBe(false)
    })
  })

  describe('getErrorMessage', () => {
    it('returns message from extractApiError', () => {
      expect(getErrorMessage(new Error('Custom message'))).toBe('Custom message')
    })

    it('returns "Unknown error" for non-Error', () => {
      expect(getErrorMessage(42)).toBe('Unknown error')
    })
  })
})
