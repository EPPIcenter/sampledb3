import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// Default mock for authApi.getCurrentUser so UserProvider (in renderWithProviders) resolves without real API.
// Test files that mock ../../lib/api replace the module and must include authApi in their mock.
vi.mock('../lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api')>()
  const defaultUser = { id: 1, email: 'test@test.com', name: 'Test User', role: 'admin' as const }
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getCurrentUser: vi.fn().mockResolvedValue({ data: { user: defaultUser } }),
    },
  }
})

// jsdom does not provide IntersectionObserver; mock it for components that use it (must be a constructor)
class MockIntersectionObserver {
  observe = vi.fn()
  disconnect = vi.fn()
  unobserve = vi.fn()
  root = null
  rootMargin = ''
  thresholds: number[] = []
}
const MockIO = MockIntersectionObserver as unknown as typeof IntersectionObserver
if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = MockIO
}
if (typeof window !== 'undefined' && typeof window.IntersectionObserver === 'undefined') {
  window.IntersectionObserver = MockIO
}

// Cleanup after each test
afterEach(() => {
  cleanup()
})



