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

// Default auth + table view mocks so UserProvider and table views resolve without real HTTP.
vi.mock('../lib/api/auth', async () => {
  const { createMockedDomainModule } = await import('./helpers/mock-api')
  return createMockedDomainModule('auth')
})
vi.mock('../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('./helpers/mock-api')
  return createMockedDomainModule('settings')
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
