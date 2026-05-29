import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  generateRequestId,
  createTimer,
  logInfo,
  logError,
  resolveLogFormat,
} from '../observability'

describe('observability', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>
  let consoleWarn: ReturnType<typeof vi.spyOn>
  let consoleError: ReturnType<typeof vi.spyOn>
  const originalLogFormat = process.env.LOG_FORMAT
  const originalNodeEnv = process.env.NODE_ENV

  beforeEach(() => {
    process.env.LOG_FORMAT = 'json'
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    if (originalLogFormat !== undefined) {
      process.env.LOG_FORMAT = originalLogFormat
    } else {
      delete process.env.LOG_FORMAT
    }
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv
    } else {
      delete process.env.NODE_ENV
    }
    consoleLog.mockRestore()
    consoleWarn.mockRestore()
    consoleError.mockRestore()
  })

  describe('generateRequestId', () => {
    it('returns string starting with req_', () => {
      expect(generateRequestId()).toMatch(/^req_\d+_[a-z0-9]+$/)
    })

    it('returns unique ids', () => {
      const a = generateRequestId()
      const b = generateRequestId()
      expect(a).not.toBe(b)
    })
  })

  describe('resolveLogFormat', () => {
    it('respects LOG_FORMAT=json', () => {
      process.env.LOG_FORMAT = 'json'
      expect(resolveLogFormat()).toBe('json')
    })

    it('respects LOG_FORMAT=pretty', () => {
      process.env.LOG_FORMAT = 'pretty'
      expect(resolveLogFormat()).toBe('pretty')
    })
  })

  describe('logInfo', () => {
    it('emits single-line JSON when LOG_FORMAT=json', () => {
      logInfo('hello', { foo: 'bar' })
      expect(consoleLog).toHaveBeenCalledOnce()
      const payload = JSON.parse(String(consoleLog.mock.calls[0][0]))
      expect(payload.level).toBe('info')
      expect(payload.message).toBe('hello')
      expect(payload.context).toEqual({ foo: 'bar' })
    })

    it('emits pretty lines when LOG_FORMAT=pretty', () => {
      process.env.LOG_FORMAT = 'pretty'
      logInfo('hello', { requestId: 'req_test_abc' })
      expect(consoleLog).toHaveBeenCalledOnce()
      const output = String(consoleLog.mock.calls[0][0])
      expect(output).toContain('INFO hello')
      expect(output).toContain('requestId: req_test_abc')
      expect(() => JSON.parse(output)).toThrow()
    })
  })

  describe('logError', () => {
    it('emits JSON with error details', () => {
      logError('failed', new Error('boom'), { component: 'test' })
      expect(consoleError).toHaveBeenCalledOnce()
      const payload = JSON.parse(String(consoleError.mock.calls[0][0]))
      expect(payload.level).toBe('error')
      expect(payload.error?.message).toBe('boom')
    })
  })

  describe('createTimer', () => {
    it('getDuration returns elapsed ms', async () => {
      const timer = createTimer('op')
      await new Promise((r) => setTimeout(r, 10))
      const d = timer.getDuration()
      expect(d).toBeGreaterThanOrEqual(10)
    })

    it('end calls logPerformance and returns duration', async () => {
      const timer = createTimer('testOp')
      await new Promise((r) => setTimeout(r, 5))
      const duration = timer.end()
      expect(duration).toBeGreaterThanOrEqual(5)
      expect(consoleLog).toHaveBeenCalled()
      const payload = JSON.parse(String(consoleLog.mock.calls[0][0]))
      expect(payload.message).toContain('Performance')
      expect(payload.context?.operation).toBe('testOp')
      expect(payload.context?.duration).toBe(duration)
    })
  })
})
