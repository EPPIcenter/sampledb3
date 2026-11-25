import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerDetail from '../ContainerDetail'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api/client', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { containerDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { default: clientDefault } = containerDetailPageMock()
  return createMockedDomainModule('client', { default: clientDefault })
})

vi.mock('../../lib/api/derivations', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { containerDetailPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  const { derivationsApi } = containerDetailPageMock()
  return createMockedDomainModule('derivations', { derivationsApi })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({ canWrite: true }),
  }
})

import { api } from '../../lib/api/client'
import { derivationsApi } from '../../lib/api/derivations'

describe('ContainerDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.get).mockResolvedValue({
      container: {
        id: 1,
        containerType: 'micronix_tube',
        barcode: 'MT001',
        collection: { type: 'micronix_plate', id: 1, name: 'Plate1', position: 'A01' },
      },
    })
    vi.mocked(derivationsApi.getSource).mockResolvedValue(null as never)
  })

  it('shows container content after load', async () => {
    await render(<ContainerDetail />)
    await waitFor(() => {
      const matches = screen.getAllByText(/A01|Plate1|MT001|Container/i)
      expect(matches.length).toBeGreaterThan(0)
    }, { timeout: 3000 })
  })

  it('renders source derivation details from wire-shaped getSource response', async () => {
    vi.mocked(derivationsApi.getSource).mockResolvedValue({
      type: 'derivation',
      derivation: {
        id: 42,
        parentContainerId: 9,
        childContainerId: 1,
        derivationType: 'dna_extraction',
        protocol: 'Qiagen Mini',
      },
      parentContainer: {
        id: 9,
        containerType: 'micronix_tube',
        barcode: 'MT-PARENT',
        collection: { type: 'micronix_plate', id: 1, name: 'Plate1', position: 'A02' },
      },
      parentSpecimen: {
        id: 5,
        specimenTypeId: 1,
        created: '2025-01-01T00:00:00Z',
        lastUpdated: '2025-01-01T00:00:00Z',
      },
    })

    await render(<ContainerDetail />)
    expect(await screen.findByText('Source Derivation')).toBeInTheDocument()
    expect(screen.getByText('Qiagen Mini')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /view parent container/i })).toBeInTheDocument()
  })
})
