import '@testing-library/jest-dom'
import { cleanup } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// In-memory localStorage so addRecentUser in UserContext never throws and console stays clean.
const storage: Record<string, string> = {}
const localStorageMock = {
  getItem: (key: string) => storage[key] ?? null,
  setItem: (key: string, value: string) => {
    storage[key] = value
  },
  removeItem: (key: string) => {
    delete storage[key]
  },
}
if (typeof globalThis !== 'undefined') {
  (globalThis as { localStorage?: typeof localStorageMock }).localStorage = localStorageMock
}
if (typeof window !== 'undefined') {
  (window as { localStorage?: typeof localStorageMock }).localStorage = localStorageMock
}

// Default mock for authApi.getCurrentUser so UserProvider (in renderWithProviders) resolves without real API.
// Returns a thenable that resolves synchronously so the state update runs in the same tick as the effect (inside act).
// Test files that mock ../../lib/api replace the module and must include authApi in their mock.
vi.mock('../lib/api', async () => {
  const actual = await vi.importActual<typeof import('../lib/api')>('../lib/api')
  const defaultUser = { id: 1, email: 'test@test.com', name: 'Test User', role: 'admin' as const }
  const syncThenable = (value: { data: { user: typeof defaultUser } }) => ({
    then: (onFulfilled: (v: typeof value) => void) => {
      onFulfilled(value)
      return { catch: () => ({ then: (f: () => void) => f() }) }
    },
    catch: () => ({ then: (f: () => void) => f() }),
  })
  return {
    ...actual,
    authApi: {
      ...actual.authApi,
      getCurrentUser: vi.fn().mockImplementation(() => syncThenable({ data: { user: defaultUser } })),
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



