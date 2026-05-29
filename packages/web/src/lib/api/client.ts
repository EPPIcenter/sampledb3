import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

export const REQUEST_ID_HEADER = 'X-Request-Id'

/** Most recent request ID echoed by the API (from success or error responses). */
let lastResponseRequestId: string | undefined

export function getLastResponseRequestId(): string | undefined {
  return lastResponseRequestId
}

/** For tests — reset module state between cases. */
export function resetRequestIdStateForTesting(): void {
  lastResponseRequestId = undefined
}

function generateClientRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
}

function readRequestIdHeader(headers: unknown): string | undefined {
  if (!headers || typeof headers !== 'object') return undefined
  const record = headers as Record<string, string | string[] | undefined>
  const value = record[REQUEST_ID_HEADER] ?? record[REQUEST_ID_HEADER.toLowerCase()]
  if (typeof value === 'string' && value.length > 0) return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return undefined
}

function attachRequestIdInterceptor(instance: AxiosInstance): void {
  instance.interceptors.request.use((config) => {
    const headers = config.headers ?? {}
    const existing = readRequestIdHeader(headers)
    if (!existing) {
      ;(headers as Record<string, string>)[REQUEST_ID_HEADER] = generateClientRequestId()
      config.headers = headers
    }
    return config
  })

  instance.interceptors.response.use(
    (response) => {
      const id = readRequestIdHeader(response.headers)
      if (id) lastResponseRequestId = id
      return response
    },
    (error: unknown) => {
      if (axios.isAxiosError(error)) {
        const id = readRequestIdHeader(error.response?.headers)
        if (id) lastResponseRequestId = id
      }
      return Promise.reject(error)
    },
  )
}

/** Shared axios instance (raw). Prefer `api` for typed, unwrapped JSON calls. */
export const axiosApi: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

attachRequestIdInterceptor(axiosApi)

async function unwrap<T>(promise: Promise<AxiosResponse<T>>): Promise<T> {
  const response = await promise
  return response.data
}

/**
 * HTTP client whose methods resolve to the response body (not AxiosResponse).
 * Domain modules and hooks should use this instead of reading `.data` on every call.
 */
export const api = {
  get: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap(axiosApi.get<T>(url, config)),
  post: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap(axiosApi.post<T>(url, data, config)),
  put: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap(axiosApi.put<T>(url, data, config)),
  patch: <T>(url: string, data?: unknown, config?: AxiosRequestConfig) =>
    unwrap(axiosApi.patch<T>(url, data, config)),
  delete: <T>(url: string, config?: AxiosRequestConfig) =>
    unwrap(axiosApi.delete<T>(url, config)),
}

export type ApiClient = typeof api

export function extractRequestIdFromAxiosError(error: unknown): string | undefined {
  if (!axios.isAxiosError(error)) return undefined
  return readRequestIdHeader(error.response?.headers)
}
