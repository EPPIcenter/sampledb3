import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import QpcrExperimentDetail from '../QpcrExperimentDetail'
import { qpcrExperimentsApi } from '../../lib/api/qpcr'
import { settingsApi } from '../../lib/api/settings'
import { containersApi } from '../../lib/api/containers'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return {
    ...actual,
    useParams: () => ({ id: '1' }),
  }
})

vi.mock('../../lib/api/qpcr', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('qpcr', {
    qpcrExperimentsApi: {
      get: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      updateWells: vi.fn(),
      uploadPlate: vi.fn(),
      uploadResults: vi.fn(),
    },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { mockSettingsApiGetValue } = await import('../../__tests__/helpers/settings-mocks')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: mockSettingsApiGetValue(),
    },
  })
})

vi.mock('../../lib/api/containers', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('containers', { containersApi: { get: vi.fn() } })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>(
    '../../contexts/UserContext'
  )
  return { ...actual, useUser: () => ({ canWrite: true }) }
})

const mockDetail = {
  experiment: {
    id: 1,
    name: 'Test Experiment',
    status: 'setup',
    templateFormat: 'biorad',
    instrumentType: 'biorad',
    targets: [],
  },
  wells: [],
}

describe('QpcrExperimentDetail', () => {
  beforeEach(async () => {
    vi.clearAllMocks()
    const { mockSettingsApiGetValue } = await import('../../__tests__/helpers/settings-mocks')
    vi.mocked(qpcrExperimentsApi.get).mockResolvedValue(mockDetail as never)
    vi.mocked(settingsApi.getValue).mockImplementation(mockSettingsApiGetValue())
  })

  it('shows experiment name when loaded', async () => {
    await render(<QpcrExperimentDetail />)
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Test Experiment' })).toBeInTheDocument()
    })
  })

  it('shows PageError with retry when load fails', async () => {
    vi.mocked(qpcrExperimentsApi.get).mockRejectedValue(new Error('Network error'))
    await render(<QpcrExperimentDetail />)
    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeInTheDocument()
      expect(screen.getByText(/Could not load experiment/i)).toBeInTheDocument()
      expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument()
    })
  })

  it("keeps the selected well's container when an earlier well's reply arrives late", async () => {
    const well = (id: number, wellPosition: string, storageContainerId: number) => ({
      id, qpcrExperimentId: 1, wellPosition, barcode: `MT-${wellPosition}`, storageContainerId, specimenId: null,
      contentType: 'unknown', standardDensity: null, cq: null, startingQuantity: null, cqMean: null, rawSampleName: null,
    })
    vi.mocked(qpcrExperimentsApi.get).mockResolvedValue({
      ...mockDetail,
      wells: [well(1, 'A01', 101), well(2, 'B01', 102)],
    } as never)
    const replies = new Map<number, (value: unknown) => void>()
    vi.mocked(containersApi.get).mockImplementation(
      (containerId: number) => new Promise((resolve) => { replies.set(containerId, resolve) }) as never,
    )
    const container = (id: number, plateName: string) => ({
      container: { id, containerType: 'micronix_tube', barcode: `MT-${id}`, collection: { id: 1, name: plateName, position: 'A01' } },
      specimen: null,
      source: null,
    })
    const user = userEvent.setup()
    await render(<QpcrExperimentDetail />)

    await user.click(await screen.findByRole('button', { name: /^Well A01/ }))
    await waitFor(() => expect(replies.has(101)).toBe(true))
    await user.click(screen.getByRole('button', { name: /^Well B01/ }))
    await waitFor(() => expect(replies.has(102)).toBe(true))

    replies.get(102)!(container(102, 'Plate B'))
    expect(await screen.findByText(/Plate B/)).toBeInTheDocument()
    replies.get(101)!(container(101, 'Plate A'))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(/Plate A/)).not.toBeInTheDocument()
    expect(screen.getByText(/Plate B/)).toBeInTheDocument()
  })
})
