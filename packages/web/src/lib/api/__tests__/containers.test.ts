import { describe, it, expect, vi, beforeEach } from 'vitest'
import { containersApi, normalizeContainerDetail } from '../containers'
import { ApiContractError } from '../parse-response'
import { api } from '../client'

vi.mock('../client', () => ({
  api: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}))

describe('normalizeContainerDetail', () => {
  const enriched = {
    id: 42,
    specimenId: 1,
    containerType: 'micronix_tube' as const,
    barcode: 'MTX-001',
    locationPath: '/Freezer/Plate',
    collection: { type: 'micronix_plate' as const, id: 2, name: 'Plate1', position: 'A01' },
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
    expect(result.container.containerType).toBe('micronix_tube')
    if (result.container.containerType === 'micronix_tube') {
      expect(result.container.barcode).toBe('MTX-001')
    }
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

    it('parses paper container with sublabel at root', async () => {
      vi.mocked(api.get).mockResolvedValue({
        container: {
          id: 94079,
          containerType: 'paper',
          sublabel: 'Spot-A',
          collection: { type: 'sheet', id: 143, name: '2058121' },
        },
        specimen: null,
        source: null,
      })

      const result = await containersApi.get(94079)

      expect(result.container.containerType).toBe('paper')
      if (result.container.containerType === 'paper') {
        expect(result.container.sublabel).toBe('Spot-A')
      }
      expect(result.container.collection).toEqual({
        type: 'sheet',
        id: 143,
        name: '2058121',
      })
    })

    it('throws ApiContractError when body lacks container id', async () => {
      vi.mocked(api.get).mockResolvedValue({ specimen: null, source: null })

      await expect(containersApi.get(1)).rejects.toThrow(ApiContractError)
    })

    it('throws ApiContractError when wire body includes explicit null placement fields', async () => {
      vi.mocked(api.get).mockResolvedValue({
        container: {
          id: 94079,
          containerType: 'paper',
          collection: {
            type: 'sheet',
            id: 143,
            name: '2058121',
            position: null,
          },
        },
        specimen: null,
        source: null,
      })

      await expect(containersApi.get(94079)).rejects.toThrow(ApiContractError)
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

    it('parses paper containers in list results', async () => {
      vi.mocked(api.get).mockResolvedValue({
        containers: [
          {
            id: 94079,
            containerType: 'paper',
            collection: { type: 'sheet', id: 143, name: '2058121' },
          },
        ],
      })

      const result = await containersApi.list()

      expect(result.containers[0].collection).toEqual({
        type: 'sheet',
        id: 143,
        name: '2058121',
      })
    })
  })

  describe('update', () => {
    it('PATCHes the edit and resolves to the updated container', async () => {
      const container = {
        id: 93926,
        specimenId: 1,
        containerType: 'paper' as const,
        sublabel: '2067376-B',
        collection: { type: 'sheet' as const, id: 3, name: 'Sheet 1' },
      }
      vi.mocked(api.patch).mockResolvedValue({ container })

      const result = await containersApi.update(93926, { sublabel: '2067376-B' })

      expect(api.patch).toHaveBeenCalledWith('/containers/93926', { sublabel: '2067376-B' })
      expect(result).toEqual(container)
    })

    it('throws ApiContractError when the body has no container', async () => {
      vi.mocked(api.patch).mockResolvedValue({ ok: true })

      await expect(containersApi.update(1, { comment: 'x' })).rejects.toBeInstanceOf(ApiContractError)
    })
  })
})
