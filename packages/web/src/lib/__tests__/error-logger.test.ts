import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { postMock, getLastResponseRequestIdMock } = vi.hoisted(() => ({
  postMock: vi.fn().mockResolvedValue({ data: { ok: true } }),
  getLastResponseRequestIdMock: vi.fn(),
}))

vi.mock('../api/client', () => ({
  axiosApi: { post: postMock },
  getLastResponseRequestId: getLastResponseRequestIdMock,
}))

import { logErrorFromMessage } from '../error-logger'

describe('error-logger', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
    getLastResponseRequestIdMock.mockReturnValue(undefined)
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('logErrorFromMessage does not throw', () => {
    expect(() => logErrorFromMessage('test message')).not.toThrow()
  })

  it('posts via axiosApi with requestId from context', async () => {
    logErrorFromMessage('msg', 'error', { requestId: 'req_explicit' })
    await vi.runAllTimersAsync()

    expect(postMock).toHaveBeenCalledWith('/error-logs', {
      message: 'msg',
      stack: undefined,
      errorCode: undefined,
      level: 'error',
      context: expect.objectContaining({
        requestId: 'req_explicit',
        userAgent: navigator.userAgent,
        url: window.location.href,
      }),
    })
  })

  it('includes last API response requestId when context omits it', async () => {
    getLastResponseRequestIdMock.mockReturnValue('req_from_failed_api')
    logErrorFromMessage('msg', 'error')
    await vi.runAllTimersAsync()

    expect(postMock).toHaveBeenCalledWith(
      '/error-logs',
      expect.objectContaining({
        context: expect.objectContaining({ requestId: 'req_from_failed_api' }),
      }),
    )
  })

  it('logErrorFromException accepts level and context', () => {
    expect(() =>
      logErrorFromMessage('msg', 'warning', { key: 'value' }),
    ).not.toThrow()
  })
})
