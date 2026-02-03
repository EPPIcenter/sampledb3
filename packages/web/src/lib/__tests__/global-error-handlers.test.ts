import { describe, it, expect, beforeEach, vi } from 'vitest'

const logErrorFromException = vi.fn()
const logErrorFromMessage = vi.fn()

vi.mock('../error-logger', () => ({
  logErrorFromException: (...args: unknown[]) => logErrorFromException(...args),
  logErrorFromMessage: (...args: unknown[]) => logErrorFromMessage(...args),
}))

import { initializeGlobalErrorHandlers } from '../global-error-handlers'

describe('global-error-handlers', () => {
  beforeEach(() => {
    logErrorFromException.mockClear()
    logErrorFromMessage.mockClear()
  })

  it('registers unhandledrejection listener when initializeGlobalErrorHandlers is called', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    expect(addSpy).toHaveBeenCalledWith('unhandledrejection', expect.any(Function))
    addSpy.mockRestore()
  })

  it('registers error listener when initializeGlobalErrorHandlers is called', () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const errorCalls = addSpy.mock.calls.filter(([name]) => name === 'error')
    expect(errorCalls.length).toBeGreaterThanOrEqual(1)
    addSpy.mockRestore()
  })

  it('when unhandledrejection fires with Error, listener calls logErrorFromException', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const rejectionCall = addSpy.mock.calls.find(([name]) => name === 'unhandledrejection')
    addSpy.mockRestore()
    expect(rejectionCall).toBeDefined()
    const handler = rejectionCall![1] as (event: PromiseRejectionEvent) => void
    const err = new Error('Test rejection')
    const promise = Promise.reject(err)
    promise.catch(() => {}) // prevent unhandled rejection in test runner
    handler({
      reason: err,
      promise,
    } as unknown as PromiseRejectionEvent)
    await vi.waitFor(() => {
      expect(logErrorFromException).toHaveBeenCalledWith(
        expect.any(Error),
        'error',
        expect.objectContaining({ type: 'unhandledRejection', promise: true })
      )
    })
  })
})
