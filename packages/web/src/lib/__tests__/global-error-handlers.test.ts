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

  it('when unhandledrejection fires with non-Error reason, listener calls logErrorFromMessage', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const rejectionCall = addSpy.mock.calls.find(([name]) => name === 'unhandledrejection')
    addSpy.mockRestore()
    expect(rejectionCall).toBeDefined()
    const handler = rejectionCall![1] as (event: PromiseRejectionEvent) => void
    const promise = Promise.reject('string reason')
    promise.catch(() => {})
    handler({
      reason: 'string reason',
      promise,
    } as unknown as PromiseRejectionEvent)
    await vi.waitFor(() => {
      expect(logErrorFromMessage).toHaveBeenCalledWith(
        expect.stringContaining('string reason'),
        'error',
        expect.objectContaining({ type: 'unhandledRejection', promise: true })
      )
    })
  })

  it('when error event fires with event.error, listener calls logErrorFromException', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const errorCalls = addSpy.mock.calls.filter(([name]) => name === 'error')
    addSpy.mockRestore()
    const jsErrorHandler = errorCalls.find(
      (call) => (call[2] as boolean | undefined) !== true
    )?.[1] as (event: ErrorEvent) => void
    expect(jsErrorHandler).toBeDefined()
    const err = new Error('window error')
    jsErrorHandler({
      message: 'window error',
      filename: 'file.js',
      lineno: 10,
      colno: 5,
      error: err,
    } as ErrorEvent)
    await vi.waitFor(() => {
      expect(logErrorFromException).toHaveBeenCalledWith(
        err,
        'error',
        expect.objectContaining({ type: 'windowError' })
      )
    })
  })

  it('when error event fires without event.error, listener calls logErrorFromMessage', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const errorCalls = addSpy.mock.calls.filter(([name]) => name === 'error')
    addSpy.mockRestore()
    const jsErrorHandler = errorCalls.find(
      (call) => (call[2] as boolean | undefined) !== true
    )?.[1] as (event: ErrorEvent) => void
    jsErrorHandler({
      message: 'Unknown message',
      filename: 'file.js',
      lineno: 1,
      colno: 0,
      error: undefined,
    } as ErrorEvent)
    await vi.waitFor(() => {
      expect(logErrorFromMessage).toHaveBeenCalledWith(
        'Unknown message',
        'error',
        expect.objectContaining({ type: 'windowError' })
      )
    })
  })

  it('when resource load error fires, listener calls logErrorFromMessage with resource info', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener')
    initializeGlobalErrorHandlers()
    const errorCalls = addSpy.mock.calls.filter(([name]) => name === 'error')
    addSpy.mockRestore()
    const captureHandler = errorCalls.find(
      (call) => (call[2] as boolean | undefined) === true
    )?.[1] as (event: ErrorEvent) => void
    expect(captureHandler).toBeDefined()
    const img = document.createElement('img')
    img.src = 'https://example.com/bad.png'
    captureHandler({
      target: img,
      message: '',
      filename: '',
      lineno: 0,
      colno: 0,
    } as unknown as ErrorEvent)
    await vi.waitFor(() => {
      expect(logErrorFromMessage).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load resource'),
        'warning',
        expect.objectContaining({ type: 'resourceLoadError', tagName: 'img' })
      )
    })
  })
})
