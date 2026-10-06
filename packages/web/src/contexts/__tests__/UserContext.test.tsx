import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { UserProvider, useUser, resetUserContextForTesting } from '../UserContext'
import { authApi } from '../../lib/api/auth'
import { axiosApi } from '../../lib/api/client'

const alice = { id: 1, email: 'alice@lab.org', name: 'Alice', role: 'member' as const }
const bob = { id: 2, email: 'bob@lab.org', name: 'Bob', role: 'member' as const }

describe('UserProvider', () => {
  let queryClient: QueryClient

  beforeEach(() => {
    resetUserContextForTesting()
    vi.mocked(authApi.getCurrentUser).mockResolvedValue({ user: alice } as never)
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  })

  function renderUser() {
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>
        <UserProvider>{children}</UserProvider>
      </QueryClientProvider>
    )
    return renderHook(() => useUser(), { wrapper })
  }

  it("clears cached queries when a different user signs in, so the next user never sees the last one's data", async () => {
    const { result } = renderUser()
    await waitFor(() => expect(result.current.user?.id).toBe(alice.id))
    queryClient.setQueryData(['export-workflow', 'configurations'], ['Alice personal config'])

    act(() => result.current.setUser(alice))
    expect(queryClient.getQueryData(['export-workflow', 'configurations'])).toBeDefined()

    act(() => result.current.setUser(bob))
    expect(queryClient.getQueryData(['export-workflow', 'configurations'])).toBeUndefined()
  })

  it('signs the user out when a data request returns 401', async () => {
    const { result } = renderUser()
    await waitFor(() => expect(result.current.user?.id).toBe(alice.id))
    const originalAdapter = axiosApi.defaults.adapter
    axiosApi.defaults.adapter = async (config) => {
      throw Object.assign(new Error('Unauthorized'), {
        isAxiosError: true,
        config,
        response: { status: 401, headers: {}, config, data: {} },
      })
    }

    await act(async () => {
      await axiosApi.get('/studies').catch(() => undefined)
    })

    axiosApi.defaults.adapter = originalAdapter
    expect(result.current.user).toBeNull()
  })
})
