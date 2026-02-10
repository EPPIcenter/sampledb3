import { describe, it, expect, vi, beforeEach } from 'vitest'
import { logErrorFromMessage, logErrorFromException } from '../error-logger'

// Avoid actually sending to backend
vi.mock('axios', () => ({
  default: {
    post: vi.fn().mockResolvedValue(undefined),
  },
}))

describe('error-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logErrorFromMessage does not throw', () => {
    expect(() => logErrorFromMessage('test message')).not.toThrow()
  })

  it('logErrorFromMessage accepts level and context', () => {
    expect(() =>
      logErrorFromMessage('msg', 'warning', { key: 'value' })
    ).not.toThrow()
  })

  it('logErrorFromException does not throw', async () => {
    logErrorFromException(new Error('test'))
    await new Promise((r) => setTimeout(r, 0))
    expect(true).toBe(true)
  })

  it('logErrorFromException accepts level and context', () => {
    expect(() =>
      logErrorFromException(new Error('e'), 'info', { extra: true })
    ).not.toThrow()
  })
})
