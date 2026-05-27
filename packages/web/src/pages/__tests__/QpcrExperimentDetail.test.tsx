import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import QpcrExperimentDetail from '../QpcrExperimentDetail'
import { qpcrExperimentsApi } from '../../lib/api/qpcr'
import { settingsApi } from '../../lib/api/settings'
import { mockSettingsApiGetValue } from '../../__tests__/helpers/settings-mocks'

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
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: mockSettingsApiGetValue(),
    },
  })
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
  beforeEach(() => {
    vi.clearAllMocks()
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
})
