import axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type AxiosResponse,
} from 'axios'

/** Shared axios instance (raw). Prefer `api` for typed, unwrapped JSON calls. */
export const axiosApi: AxiosInstance = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

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
