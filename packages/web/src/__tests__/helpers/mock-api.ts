import { vi } from 'vitest'
import type { AxiosInstance } from 'axios'
import { moduleApiKeys, type ApiModuleId } from './mock-api-domains'

const defaultUser = {
  id: 1,
  email: 'test@test.com',
  name: 'Test User',
  role: 'admin' as const,
}

const API_ROOT = '../../lib/api'

function syncThenable<T>(value: T) {
  return {
    then: (onFulfilled: (v: T) => void) => {
      onFulfilled(value)
      return { catch: () => ({ then: (f: () => void) => f() }) }
    },
    catch: () => ({ then: (f: () => void) => f() }),
  }
}

/** Overrides for domain mocks. Each `*Api` key replaces the whole export object. `default` stubs axios client. */
export type MockApiOverrides = {
  default?: Partial<Pick<AxiosInstance, 'get' | 'post' | 'put' | 'patch' | 'delete'>>
} & Record<string, unknown>

function applyAuthDefaults(
  actual: Record<string, unknown>,
  overrides: MockApiOverrides
): Record<string, unknown> {
  const authApi = actual.authApi as Record<string, unknown>
  return {
    ...actual,
    authApi: overrides.authApi ?? {
      ...authApi,
      getCurrentUser: vi.fn().mockImplementation(() =>
        syncThenable({ user: defaultUser })
      ),
    },
  }
}

/**
 * Vitest factory for `vi.mock('../../lib/api/<domain>', ...)`.
 * Loads only the target module (avoids loading the full API graph per mock).
 */
export async function createMockedDomainModule(
  moduleId: ApiModuleId,
  overrides: MockApiOverrides = {}
): Promise<Record<string, unknown>> {
  const actual = await vi.importActual<Record<string, unknown>>(`${API_ROOT}/${moduleId}`)
  const out: Record<string, unknown> = { ...actual }

  for (const key of moduleApiKeys(moduleId)) {
    if (key in overrides) {
      out[key] = overrides[key]
    }
  }

  if (moduleId === 'client') {
    const clientApi = actual.api as AxiosInstance
    out.api = overrides.default
      ? ({ ...clientApi, ...overrides.default } as AxiosInstance)
      : clientApi
  }

  if (moduleId === 'auth') return applyAuthDefaults(out, overrides)

  return out
}

export { modulesForOverrides, type ApiModuleId } from './mock-api-domains'
