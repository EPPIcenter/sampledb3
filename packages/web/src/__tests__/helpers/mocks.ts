import { vi } from 'vitest'
import type { AxiosInstance } from 'axios'

/**
 * Mock axios instance for testing
 */
export function createMockApi() {
  const mockGet = vi.fn()
  const mockPost = vi.fn()
  const mockPut = vi.fn()
  const mockPatch = vi.fn()
  const mockDelete = vi.fn()

  const mockApi = {
    get: mockGet,
    post: mockPost,
    put: mockPut,
    patch: mockPatch,
    delete: mockDelete,
    interceptors: {
      request: { use: vi.fn(), eject: vi.fn() },
      response: { use: vi.fn(), eject: vi.fn() },
    },
  } as unknown as AxiosInstance

  return {
    api: mockApi,
    mockGet,
    mockPost,
    mockPut,
    mockPatch,
    mockDelete,
  }
}

/**
 * Helper to mock API responses
 */
export function mockApiResponse<T>(data: T, status = 200) {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config: {} as any,
  }
}



