import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { containerKeys, useUpdateContainer } from '../useContainers'
import { containersApi } from '../../lib/api/containers'

vi.mock('../../lib/api/containers', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('containers', {
    containersApi: { list: vi.fn(), get: vi.fn(), update: vi.fn() },
  })
})

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { queryClient, wrapper }
}

describe('useUpdateContainer', () => {
  it('saves the edit and invalidates every container query', async () => {
    const updated = { id: 5, containerType: 'paper' as const, sublabel: 'NEW' }
    vi.mocked(containersApi.update).mockResolvedValue(updated as never)
    const { queryClient, wrapper } = setup()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateContainer(), { wrapper })
    result.current.mutate({ id: 5, data: { sublabel: 'NEW' } })

    await waitFor(() => expect(result.current.isSuccess).toBe(true))
    expect(containersApi.update).toHaveBeenCalledWith(5, { sublabel: 'NEW' })
    expect(result.current.data).toEqual(updated)
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: containerKeys.all })
  })

  it('invalidates nothing when the save fails', async () => {
    vi.mocked(containersApi.update).mockRejectedValue(new Error('Unknown tag id: 9'))
    const { queryClient, wrapper } = setup()
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries')

    const { result } = renderHook(() => useUpdateContainer(), { wrapper })
    result.current.mutate({ id: 5, data: { tagIds: [9] } })

    await waitFor(() => expect(result.current.isError).toBe(true))
    expect(invalidateSpy).not.toHaveBeenCalled()
  })
})
