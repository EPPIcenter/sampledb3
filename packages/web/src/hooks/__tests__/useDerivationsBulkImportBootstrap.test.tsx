import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { ToastProvider } from '../../contexts/ToastContext'
import { specimenTypesApi, unitsApi } from '../../lib/api/reference-data'
import { useDerivationsBulkImportBootstrap } from '../useDerivationsBulkImportBootstrap'

vi.mock('../../lib/api/reference-data', () => ({
  specimenTypesApi: {
    list: vi.fn(),
    getContainerTypes: vi.fn(),
  },
  unitsApi: {
    listAll: vi.fn(),
  },
}))

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

describe('useDerivationsBulkImportBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(specimenTypesApi.list).mockResolvedValue({
      data: [{ id: 1, name: 'DNA', created: '', lastUpdated: '' }],
    } as never)
    vi.mocked(unitsApi.listAll).mockResolvedValue([{ id: 1, name: 'µL', symbol: 'µL', category: 'volume' }] as never)
    vi.mocked(specimenTypesApi.getContainerTypes).mockResolvedValue({
      containerTypes: ['micronix_tube'],
    })
  })

  it('loads specimen types and units', async () => {
    const { result } = renderHook(() => useDerivationsBulkImportBootstrap(''), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.bootstrapLoading).toBe(false))
    expect(result.current.specimenTypes).toHaveLength(1)
    expect(result.current.units).toHaveLength(1)
  })

  it('loads allowed container types when specimen type name is set', async () => {
    const { result } = renderHook(() => useDerivationsBulkImportBootstrap('DNA'), {
      wrapper: createWrapper(),
    })
    await waitFor(() => expect(result.current.allowedContainerTypes).toContain('micronix_tube'))
    expect(specimenTypesApi.getContainerTypes).toHaveBeenCalledWith(1)
  })
})
