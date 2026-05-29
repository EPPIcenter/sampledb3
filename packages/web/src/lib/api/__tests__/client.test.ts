import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import type { InternalAxiosRequestConfig } from 'axios'
import {
  axiosApi,
  getLastResponseRequestId,
  resetRequestIdStateForTesting,
  REQUEST_ID_HEADER,
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
