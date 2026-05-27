import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { setupApi } from '../../lib/api/settings'
import { authApi } from '../../lib/api/auth'
import {
  getLoginErrorMessage,
  useInitializeSetup,
  useLogin,
  useSetupStatus,
} from '../useAuthWorkflow'

vi.mock('../../lib/api/settings', () => ({
  setupApi: {
    status: vi.fn(),
    initialize: vi.fn(),
  },
}))

vi.mock('../../lib/api/auth', () => ({
  authApi: {
    login: vi.fn(),
    selfRegister: vi.fn(),
  },
}))

vi.mock('../../contexts/ToastContext', () => ({
  useToast: () => ({ success: vi.fn(), error: vi.fn() }),
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe('useAuthWorkflow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(setupApi.status).mockResolvedValue({ initialized: false })
  })

  describe('useSetupStatus', () => {
    it('loads setup status', async () => {
      const { result } = renderHook(() => useSetupStatus(), { wrapper: createWrapper() })
      await waitFor(() => expect(result.current.data?.initialized).toBe(false))
      expect(setupApi.status).toHaveBeenCalled()
    })
  })

  describe('useInitializeSetup', () => {
    it('calls initialize API', async () => {
      vi.mocked(setupApi.initialize).mockResolvedValue({ success: true, message: 'ok' })
      const { result } = renderHook(() => useInitializeSetup({ silent: true }), {
        wrapper: createWrapper(),
      })
      await result.current.mutateAsync({
        adminName: 'Admin',
        adminEmail: 'a@example.com',
        adminPassword: 'password123',
      })
      expect(setupApi.initialize).toHaveBeenCalled()
    })
  })

  describe('useLogin', () => {
    it('calls login API', async () => {
      vi.mocked(authApi.login).mockResolvedValue({
        user: { id: 1, email: 'a@b.com', name: 'A', role: 'member' },
      } as never)
      const { result } = renderHook(() => useLogin({ silent: true }), { wrapper: createWrapper() })
      await result.current.mutateAsync({ emailOrUsername: 'user', password: 'pass' })
      expect(authApi.login).toHaveBeenCalledWith('user', 'pass')
    })
  })

  describe('getLoginErrorMessage', () => {
    it('maps pending approval to user-facing message', () => {
      const msg = getLoginErrorMessage({
        response: { data: { error: 'Account pending approval' } },
      })
      expect(msg).toContain('pending approval')
    })

    it('falls back for unknown errors', () => {
      expect(getLoginErrorMessage(null)).toMatch(/login failed/i)
    })
  })
})
