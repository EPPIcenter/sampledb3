import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ApiContractError } from '../parse-response'

vi.mock('../client', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  return createMockedDomainModule('client', {
    default: {
      get: vi.fn(),
      post: vi.fn(),
    },
  })
})

import { api } from '../client'
import { derivationsApi } from '../derivations'

const validWireContainer = {
  id: 10,
  specimenId: 1,
  containerType: 'micronix_tube' as const,
  barcode: 'MT-001',
  collection: { type: 'micronix_plate' as const, id: 2, name: 'Plate1', position: 'A01' },
}

const validDerivation = {
  id: 1,
  parentContainerId: 10,
  childContainerId: 11,
  derivationType: 'dna_extraction',
}

const validSpecimenSummary = {
  id: 1,
  specimenTypeId: 2,
  created: '2025-01-01T00:00:00Z',
  lastUpdated: '2025-01-01T00:00:00Z',
}

describe('derivationsApi runtime wire parsing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('getChain', () => {
    it('parses valid wire containers and normalizes omitted containers to null', async () => {
      vi.mocked(api.get).mockResolvedValue({
        ancestors: [{ container: validWireContainer, derivation: validDerivation }],
        descendants: [{ derivation: { ...validDerivation, id: 2 } }],
        current: { ...validWireContainer, id: 11, barcode: 'MT-002' },
      })

      const result = await derivationsApi.getChain(11)
      expect(result.ancestors[0]?.container?.id).toBe(10)
      expect(result.descendants[0]?.container).toBeNull()
      expect(result.current?.id).toBe(11)
    })

    it('throws ApiContractError when a chain container is a raw DB row without containerType', async () => {
      vi.mocked(api.get).mockResolvedValue({
        ancestors: [{ container: { id: 10, specimenId: 1, unitId: 1 }, derivation: validDerivation }],
        descendants: [],
        current: validWireContainer,
      })

      await expect(derivationsApi.getChain(11)).rejects.toThrow(ApiContractError)
    })
  })

  describe('createFromContainer', () => {
    it('parses wire containers and specimen summary', async () => {
      vi.mocked(api.post).mockResolvedValue({
        derivation: validDerivation,
        parentContainer: validWireContainer,
        childContainer: { ...validWireContainer, id: 11, barcode: 'MT-002' },
        specimen: validSpecimenSummary,
        warnings: [],
      })

      const result = await derivationsApi.createFromContainer(10, {
        derivationType: 'dna_extraction',
        specimenTypeName: 'DNA',
        container: {
          containerType: 'micronix_tube',
          barcode: 'MT-002',
          collection: { type: 'micronix_plate', id: 2, position: 'A02' },
        },
      })
      expect(result.parentContainer.id).toBe(10)
      expect(result.childContainer.id).toBe(11)
      expect(result.specimen?.id).toBe(1)
    })

    it('throws ApiContractError when specimen leaks createdBy', async () => {
      vi.mocked(api.post).mockResolvedValue({
        derivation: validDerivation,
        parentContainer: validWireContainer,
        childContainer: { ...validWireContainer, id: 11, barcode: 'MT-002' },
        specimen: { ...validSpecimenSummary, createdBy: 1 },
        warnings: [],
      })

      await expect(
        derivationsApi.createFromContainer(10, {
          derivationType: 'dna_extraction',
          specimenTypeName: 'DNA',
          container: {
            containerType: 'micronix_tube',
            barcode: 'MT-002',
            collection: { type: 'micronix_plate', id: 2, position: 'A02' },
          },
        }),
      ).rejects.toThrow(ApiContractError)
    })
  })

  describe('getSource', () => {
    it('parses derivation source wire response', async () => {
      vi.mocked(api.get).mockResolvedValue({
        type: 'derivation',
        derivation: validDerivation,
        parentContainer: validWireContainer,
        parentSpecimen: validSpecimenSummary,
      })

      const result = await derivationsApi.getSource(11)
      expect(result.type).toBe('derivation')
      if (result.type === 'derivation') {
        expect(result.parentContainer.id).toBe(10)
        expect(result.parentSpecimen?.id).toBe(1)
      }
    })

    it('parses original source wire response', async () => {
      vi.mocked(api.get).mockResolvedValue({
        type: 'original',
        source: { type: 'subject', id: 1, name: 'SUBJ-1' },
        container: validWireContainer,
        specimen: validSpecimenSummary,
      })

      const result = await derivationsApi.getSource(10)
      expect(result.type).toBe('original')
      if (result.type === 'original') {
        expect(result.container.id).toBe(10)
        expect(result.specimen.id).toBe(1)
      }
    })

    it('throws ApiContractError when parentContainer is not a wire container', async () => {
      vi.mocked(api.get).mockResolvedValue({
        type: 'derivation',
        derivation: validDerivation,
        parentContainer: { id: 10, specimenId: 1, createdBy: 1 },
        parentSpecimen: validSpecimenSummary,
      })

      await expect(derivationsApi.getSource(11)).rejects.toThrow(ApiContractError)
    })
  })
})
