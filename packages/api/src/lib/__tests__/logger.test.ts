import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateRequestId, createTimer } from '../logger'

describe('logger', () => {
  let consoleLog: ReturnType<typeof vi.spyOn>
  let consoleWarn: ReturnType<typeof vi.spyOn>
  let consoleError: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
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
      const payload = JSON.parse(consoleLog.mock.calls[0][0])
      expect(payload.message).toContain('Performance')
      expect(payload.context?.operation).toBe('testOp')
      expect(payload.context?.duration).toBe(duration)
    })
  })
})
