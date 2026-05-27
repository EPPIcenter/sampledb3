import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import SpecimenForm from '../SpecimenForm'

vi.mock('../../../lib/api', async () => {
  const { createMockedApi } = await import('../../../__tests__/helpers/mock-api')
  return createMockedApi({
  collectionsApi: {
    listCollectionsByType: vi.fn().mockResolvedValue({ data: { collections: [] } }),
  },
  studiesApi: {
    list: vi.fn().mockResolvedValue({ studies: [{ id: 1, title: 'Study A', shortCode: 'SA' }] }),
    getSubjects: vi.fn().mockResolvedValue({ subjects: [] }),
  },
  specimenTypesApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Blood' }] }) },
  specimensApi: { create: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
  controlsApi: { list: vi.fn().mockResolvedValue({ data: { controls: [] } }) },
  reagentsApi: { list: vi.fn().mockResolvedValue({ data: { reagents: [] } }) },
  cellLinesApi: { list: vi.fn().mockResolvedValue({ data: { cellLines: [] } }) },
  plasmidsApi: { list: vi.fn().mockResolvedValue({ data: { plasmids: [] } }) },
  standardsApi: { list: vi.fn().mockResolvedValue({ data: { standards: [] } }) },
  subjectsApi: { create: vi.fn().mockResolvedValue({ data: { id: 1 } }) },
  settingsApi: {
    getUnits: vi.fn().mockResolvedValue({ data: [{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }] }),
    getContainerTypeUnits: vi.fn().mockResolvedValue({ data: [] }),
    get: vi.fn().mockResolvedValue({ data: {} }),
  },
})
})

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

describe('SpecimenForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with onCancel', async () => {
    const onCancel = vi.fn()
    await render(<SpecimenForm onCancel={onCancel} />)
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('shows source type and specimen type selection', async () => {
    await render(<SpecimenForm onCancel={vi.fn()} />)
    expect(screen.getByLabelText(/source type \*/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/specimen type \*/i)).toBeInTheDocument()
  })
})
