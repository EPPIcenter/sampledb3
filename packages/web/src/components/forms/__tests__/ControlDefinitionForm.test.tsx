import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import ControlDefinitionForm from '../ControlDefinitionForm'

vi.mock('../../../lib/api', () => ({
  controlsApi: {
    getDefinitionSummary: vi.fn(),
    create: vi.fn().mockResolvedValue({ data: { id: 1 } }),
    update: vi.fn().mockResolvedValue({ data: {} }),
    suggestName: vi.fn().mockResolvedValue({ data: { name: 'Suggested' } }),
  },
  settingsApi: { getUnits: vi.fn().mockResolvedValue({ data: [{ id: 1, symbol: 'uL', name: 'microliter', category: 'volume' }] }) },
  strainsApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Strain A' }] }) },
}))

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>()
  return { ...actual, useParams: () => ({}), useNavigate: () => vi.fn() }
})

describe('ControlDefinitionForm', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows Create and Cancel buttons', async () => {
    await render(<ControlDefinitionForm />)
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })
})
