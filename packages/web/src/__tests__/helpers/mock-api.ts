import { vi } from 'vitest'
import type { AxiosInstance } from 'axios'

const defaultUser = {
  id: 1,
  email: 'test@test.com',
  name: 'Test User',
  role: 'admin' as const,
}

/** Resolves in the same tick so UserProvider updates run inside React act. */
function syncThenable<T>(value: T) {
  return {
    then: (onFulfilled: (v: T) => void) => {
      onFulfilled(value)
      return { catch: () => ({ then: (f: () => void) => f() }) }
    },
    catch: () => ({ then: (f: () => void) => f() }),
  }
}

function globalApiDefaults(actual: typeof import('../../lib/api')) {
  return {
    authApi: {
      ...actual.authApi,
      getCurrentUser: vi.fn().mockImplementation(() =>
        syncThenable({ data: { user: defaultUser } })
      ),
    },
    tableViewConfigurationsApi: {
      get: vi.fn().mockResolvedValue({
        data: {
          key: 'table_view_configurations',
          value: {
            configurations: [
              {
                name: 'Default',
                columns: [
                  'position',
                  'barcode',
                  'subject_name',
                  'study_code',
                  'specimen_type',
                  'collection_date',
                  'comment',
                  'status',
                  'created',
                  'last_updated',
                ],
                isDefault: true,
              },
            ],
          },
        },
      }),
      update: vi.fn().mockResolvedValue({ data: {} }),
    },
  }
}

/**
 * Overrides for `vi.mock('../../lib/api', async () => createMockedApi({ ... }))`.
 * Each `*Api` key replaces the whole export object. `default` replaces the axios instance stub.
 * Non-overridden exports keep `importActual` implementations plus global auth/table-view defaults.
 */
export type MockApiOverrides = {
  default?: Partial<Pick<AxiosInstance, 'get' | 'post' | 'put' | 'patch' | 'delete'>>
} & Record<string, unknown>

/**
 * Build a partial mock of `lib/api` for Vitest. Use in setup and per-file `vi.mock` factories.
 */
export async function createMockedApi(overrides: MockApiOverrides = {}) {
  const actual = await vi.importActual<typeof import('../../lib/api')>('../../lib/api')
  const mocked = {
    ...actual,
    ...globalApiDefaults(actual),
    ...overrides,
  }
  return mocked
}
