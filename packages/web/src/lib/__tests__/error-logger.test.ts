import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const { postMock, getLastResponseRequestIdMock } = vi.hoisted(() => ({
  postMock: vi.fn().mockResolvedValue({ data: { ok: true } }),
  getLastResponseRequestIdMock: vi.fn(),
}))

vi.mock('../api/client', () => ({
  axiosApi: { post: postMock },
  getLastResponseRequestId: getLastResponseRequestIdMock,
}))

import { ERROR_REPORT_LIMITS, errorReportSchema } from '@sampledb/contract'
import { logErrorFromException, logErrorFromMessage } from '../error-logger'

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

  it('cuts an oversized report to the API size caps before posting it', async () => {
    logErrorFromMessage('m'.repeat(ERROR_REPORT_LIMITS.message * 2), 'error', {
      requestId: 'req_big',
      blob: 'b'.repeat(ERROR_REPORT_LIMITS.contextJson * 2),
    })
    await vi.runAllTimersAsync()

    // The module-level queue may still hold reports from earlier tests; pick this one out.
    const sent = postMock.mock.calls
      .map((call) => call[1] as { message: string; context: Record<string, unknown> })
      .find((report) => report.context.requestId === 'req_big')
    if (!sent) throw new Error('report was not posted')
    expect(errorReportSchema.safeParse(sent).success).toBe(true)
    expect(sent.message).toHaveLength(ERROR_REPORT_LIMITS.message)
    expect(sent.context).toEqual(
      expect.objectContaining({ contextTruncated: true, requestId: 'req_big', url: window.location.href }),
    )
    expect(sent.context).not.toHaveProperty('blob')
  })

  it('includes failed HTTP request method, path, status, error, and details without bodies or headers (#93)', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: {
        method: 'post',
        baseURL: '/api',
        url: '/specimens/bulk/validate?token=secret-query',
        data: JSON.stringify({ secretBody: 'do-not-log' }),
        headers: { Authorization: 'Bearer secret-header', Cookie: 'session=secret-cookie' },
      },
      response: {
        status: 400,
        headers: { 'set-cookie': 'session=nope' },
        data: {
          error: 'Validation error',
          details: [{ path: ['specimens', 0, 'container', 'barcode'], message: 'Required' }],
        },
      },
    })

    logErrorFromException(axiosError, 'error', { requestId: 'req_http_fail', type: 'unhandledRejection' })
    await vi.runAllTimersAsync()

    const sent = postMock.mock.calls
      .map((call) => call[1] as { message: string; context: Record<string, unknown> })
      .find((report) => report.context.requestId === 'req_http_fail')
    if (!sent) throw new Error('report was not posted')

    expect(errorReportSchema.safeParse(sent).success).toBe(true)
    expect(sent.context).toMatchObject({
      requestMethod: 'POST',
      requestPath: '/api/specimens/bulk/validate',
      responseStatus: 400,
      responseError: 'Validation error',
      responseDetails: [{ path: ['specimens', 0, 'container', 'barcode'], message: 'Required' }],
    })
    const serialized = JSON.stringify(sent)
    expect(serialized).not.toContain('secret-query')
    expect(serialized).not.toContain('secret-header')
    expect(serialized).not.toContain('secret-cookie')
    expect(serialized).not.toContain('do-not-log')
  })

  it('keeps failed HTTP request reports within size caps when response details are oversized', async () => {
    const axiosError = Object.assign(new Error('Request failed with status code 400'), {
      name: 'AxiosError',
      isAxiosError: true,
      config: { method: 'post', baseURL: '/api', url: '/specimens/bulk/validate' },
      response: {
        status: 400,
        data: {
          error: 'Validation error',
          details: Array.from({ length: 500 }, (_, i) => ({
            path: ['specimens', i, 'container', 'barcode'],
            message: 'Too small: expected string to have >=1 characters',
          })),
        },
      },
    })

    logErrorFromException(axiosError, 'error', { requestId: 'req_http_huge' })
    await vi.runAllTimersAsync()

    const sent = postMock.mock.calls
      .map((call) => call[1] as { message: string; context: Record<string, unknown> })
      .find((report) => report.context.requestId === 'req_http_huge')
    if (!sent) throw new Error('report was not posted')

    expect(errorReportSchema.safeParse(sent).success).toBe(true)
    expect(sent.context.requestMethod).toBe('POST')
    expect(sent.context.requestPath).toBe('/api/specimens/bulk/validate')
    expect(sent.context.responseStatus).toBe(400)
    expect(sent.context.responseError).toBe('Validation error')
  })
})
