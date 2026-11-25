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

type SessionExpiredHandler = () => void
let sessionExpiredHandler: SessionExpiredHandler | null = null

/**
 * Called when a data request gets 401 (session expired or revoked). The user context
 * registers a handler that signs the user out, so the app redirects to login instead of
 * showing "Could not load" everywhere.
 */
export function setSessionExpiredHandler(handler: SessionExpiredHandler | null): void {
  sessionExpiredHandler = handler
}

/**
 * Auth requests whose 401 is an answer, not an expired session: bad credentials, a wrong
 * current password, not signed in yet, or a session check. Other /auth/* requests (user
 * and session admin, profile updates) are data requests.
 */
const SELF_REPORTING_AUTH_REQUESTS = new Set([
  'POST /auth/login',
  'POST /auth/self-register',
  'POST /auth/logout',
  'POST /auth/switch',
  'GET /auth/me',
  'GET /auth/current',
  'PATCH /auth/me/password',
])

function reportsOwn401(method: string | undefined, url: string | undefined): boolean {
  if (!url) return false
  const path = url.split('?')[0].replace(/^\/?api(?=\/)/, '').replace(/^\/?/, '/').replace(/\/$/, '')
  return SELF_REPORTING_AUTH_REQUESTS.has(`${(method ?? 'get').toUpperCase()} ${path}`)
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

function attachSessionExpiryInterceptor(instance: AxiosInstance): void {
  instance.interceptors.response.use(undefined, (error: unknown) => {
    if (
      axios.isAxiosError(error) &&
      error.response?.status === 401 &&
      !reportsOwn401(error.config?.method, error.config?.url)
    ) {
      sessionExpiredHandler?.()
    }
    return Promise.reject(error)
  })
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
attachSessionExpiryInterceptor(axiosApi)

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
