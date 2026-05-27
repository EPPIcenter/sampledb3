import { describe, it, expect, vi, beforeEach } from 'vitest'
import { containersApi, normalizeContainerDetail } from '../containers'
import { ApiContractError } from '../parse-response'
import { api } from '../client'

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
  },
}))

describe('normalizeContainerDetail', () => {
  const enriched = {
    id: 42,
    specimenId: 1,
    containerType: 'micronix_tube' as const,
    locationPath: '/Freezer/Plate',
    collection: { type: 'micronix_plate', id: 2, name: 'Plate1', position: 'A01' },
  }
  const specimen = {
    id: 1,
    specimenTypeId: 1,
    collectionDate: null,
    created: '2024-01-01',
    lastUpdated: '2024-01-01',
    specimenType: { id: 1, name: 'Blood' },
  }

  it('normalizes nested wire shape', () => {
    const result = normalizeContainerDetail({
      container: enriched,
      specimen,
      source: null,
    })
    expect(result.container.id).toBe(42)
    expect(result.specimen?.specimenType?.name).toBe('Blood')
  })

  it('normalizes legacy flattened wire shape', () => {
    const result = normalizeContainerDetail({
      container: enriched,
      specimen,
      source: null,
      ...enriched,
    })
    expect(result.container.id).toBe(42)
  })
})

describe('containersApi', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('get', () => {
    it('returns normalized detail from GET /containers/:id', async () => {
      vi.mocked(api.get).mockResolvedValue({
        container: {
          id: 1,
          specimenId: 10,
          containerType: 'cryovial_tube',
        },
        specimen: null,
        source: null,
      })

      const result = await containersApi.get(1)

      expect(api.get).toHaveBeenCalledWith('/containers/1')
      expect(result.container.id).toBe(1)
    })

    it('throws ApiContractError when body lacks container id', async () => {
      vi.mocked(api.get).mockResolvedValue({ specimen: null, source: null })

      await expect(containersApi.get(1)).rejects.toThrow(ApiContractError)
    })
  })

  describe('list', () => {
    it('calls GET /containers with query params', async () => {
      vi.mocked(api.get).mockResolvedValue({
        containers: [],
        pagination: { page: 1, limit: 1, total: 0, totalPages: 0 },
      })

      await containersApi.list({ specimen_id: 5, limit: 1 })

      expect(api.get).toHaveBeenCalledWith('/containers', {
        params: { specimen_id: 5, limit: 1 },
      })
    })
  })
})
