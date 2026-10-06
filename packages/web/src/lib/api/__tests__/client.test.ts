import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import {
  axiosApi,
  getLastResponseRequestId,
  resetRequestIdStateForTesting,
  REQUEST_ID_HEADER,
  setSessionExpiredHandler,
} from '../client'

describe('axiosApi request correlation', () => {
  const originalAdapter = axiosApi.defaults.adapter

  beforeEach(() => {
    resetRequestIdStateForTesting()
  })

  afterEach(() => {
    axiosApi.defaults.adapter = originalAdapter
  })

  it('sends X-Request-Id and stores echoed id from successful responses', async () => {
    let outboundRequestId: string | undefined

    axiosApi.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      outboundRequestId = readHeader(config.headers, REQUEST_ID_HEADER)
      return {
        data: { ok: true },
        status: 200,
        statusText: 'OK',
        headers: { [REQUEST_ID_HEADER]: 'req_server_echo' },
        config,
      }
    }

    await axiosApi.get('/health')

    expect(outboundRequestId).toMatch(/^req_\d+_[a-z0-9]+$/)
    expect(getLastResponseRequestId()).toBe('req_server_echo')
  })

  it('stores echoed id from error responses', async () => {
    axiosApi.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const error = new Error('request failed') as Error & {
        response?: { status: number; headers: Record<string, string>; config: InternalAxiosRequestConfig }
        config?: InternalAxiosRequestConfig
        isAxiosError?: boolean
      }
      error.isAxiosError = true
      error.config = config
      error.response = {
        status: 500,
        headers: { [REQUEST_ID_HEADER]: 'req_failed_echo' },
        config,
      }
      throw error
    }

    await expect(axiosApi.get('/fail')).rejects.toThrow()
    expect(getLastResponseRequestId()).toBe('req_failed_echo')
  })

  it('preserves client-provided X-Request-Id', async () => {
    let outboundRequestId: string | undefined

    axiosApi.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      outboundRequestId = readHeader(config.headers, REQUEST_ID_HEADER)
      return {
        data: {},
        status: 200,
        statusText: 'OK',
        headers: { [REQUEST_ID_HEADER]: 'req_client_provided' },
        config,
      }
    }

    await axiosApi.get('/health', {
      headers: { [REQUEST_ID_HEADER]: 'req_client_provided' },
    })

    expect(outboundRequestId).toBe('req_client_provided')
  })
})

function readHeader(headers: unknown, name: string): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  if (typeof (headers as { get?: (key: string) => string }).get === 'function') {
    return (headers as { get: (key: string) => string }).get(name)
  }
  const record = headers as Record<string, string | undefined>
  return record[name] ?? record[name.toLowerCase()]
}

describe('session expiry', () => {
  const originalAdapter = axiosApi.defaults.adapter

  afterEach(() => {
    axiosApi.defaults.adapter = originalAdapter
    setSessionExpiredHandler(null)
  })

  function respond401() {
    axiosApi.defaults.adapter = async (config: InternalAxiosRequestConfig) => {
      const error = Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, headers: {}, config, data: { error: 'Invalid or expired session' } },
      })
      throw error
    }
  }

  it('calls the handler when a data request gets 401', async () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    respond401()

    await expect(axiosApi.get('/studies')).rejects.toThrow()
    expect(handler).toHaveBeenCalledTimes(1)
  })

  it('does not call the handler for auth endpoints (wrong password, not signed in)', async () => {
    const handler = vi.fn()
    setSessionExpiredHandler(handler)
    respond401()

    await expect(axiosApi.post('/auth/login', {})).rejects.toThrow()
    await expect(axiosApi.get('/auth/me')).rejects.toThrow()
    expect(handler).not.toHaveBeenCalled()
  })
})
