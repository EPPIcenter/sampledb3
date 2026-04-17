import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ControlDefinitionForm from '../ControlDefinitionForm'

const mockCreate = vi.hoisted(() => vi.fn().mockResolvedValue({ data: { control: { id: 1, name: 'Def 1', targetDensity: 100 } } }))
const mockCreateDefinitionsBulk = vi.hoisted(() =>
  vi.fn().mockResolvedValue({
    data: {
      controls: [
        { id: 1, name: 'Def 100', targetDensity: 100 },
        { id: 2, name: 'Def 500', targetDensity: 500 },
      ],
    },
  })
)

vi.mock('../../../lib/api', () => ({
  controlsApi: {
    getDefinitionSummary: vi.fn(),
    create: mockCreate,
    createDefinitionsBulk: mockCreateDefinitionsBulk,
    update: vi.fn().mockResolvedValue({ data: {} }),
    suggestName: vi.fn().mockResolvedValue({ data: { suggestedName: 'Suggested', exists: false } }),
  },
  settingsApi: { getUnits: vi.fn().mockResolvedValue({ data: [{ id: 1, symbol: 'p/ul', name: 'parasites per microliter', category: 'concentration' }] }) },
  strainsApi: { list: vi.fn().mockResolvedValue({ data: [{ id: 1, name: 'Strain A' }] }) },
}))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return { ...actual, useParams: () => ({}), useNavigate: () => vi.fn() }
})

describe('ControlDefinitionForm', () => {
  const noopCancel = () => {}

  beforeEach(() => {
    vi.clearAllMocks()
    mockCreate.mockResolvedValue({ data: { control: { id: 1, name: 'Def 1', targetDensity: 100 } } })
    mockCreateDefinitionsBulk.mockResolvedValue({
      data: {
        controls: [
          { id: 1, name: 'Def 100', targetDensity: 100 },
          { id: 2, name: 'Def 500', targetDensity: 500 },
        ],
      },
    })
  })

  it('shows Create and Cancel buttons', async () => {
    await render(<ControlDefinitionForm onCancel={noopCancel} />)
    expect(screen.getByRole('button', { name: /create/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
  })

  it('calls create and onSuccess with single definition when only one density is provided', async () => {
    const onSuccess = vi.fn()
    await render(<ControlDefinitionForm onCancel={noopCancel} onSuccess={onSuccess} />)
    const user = userEvent.setup()
    const densityInput = screen.getByLabelText(/target density/i)
    await user.clear(densityInput)
    await user.type(densityInput, '1000')
    const submit = screen.getByRole('button', { name: /create/i })
    await user.click(submit)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreateDefinitionsBulk).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(expect.objectContaining({ id: 1, targetDensity: 100 }))
  })

  it('calls createDefinitionsBulk and onSuccess with array when multiple densities are provided', async () => {
    const onSuccess = vi.fn()
    await render(<ControlDefinitionForm onCancel={noopCancel} onSuccess={onSuccess} />)
    const user = userEvent.setup()
    const densityInput = screen.getByLabelText(/target density/i)
    await user.clear(densityInput)
    await user.type(densityInput, '100')
    const addDensityButton = screen.getByRole('button', { name: /add.*density/i })
    await user.click(addDensityButton)
    const densityInputs = screen.getAllByLabelText(/target density|^density \d+$/i)
    const secondInput = densityInputs.find((el) => (el as HTMLInputElement).value === '') ?? densityInputs[1]
    await user.type(secondInput, '500')
    const submit = screen.getByRole('button', { name: /create/i })
    await user.click(submit)
    expect(mockCreateDefinitionsBulk).toHaveBeenCalledTimes(1)
    expect(mockCreateDefinitionsBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        strains: [{ strainId: 1, percentage: 100 }],
        targetDensities: [100, 500],
      })
    )
    expect(mockCreate).not.toHaveBeenCalled()
    expect(onSuccess).toHaveBeenCalledTimes(1)
    expect(onSuccess).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ targetDensity: 100 }),
        expect.objectContaining({ targetDensity: 500 }),
      ])
    )
  })

  it('create mode shows strain composition section first', async () => {
    await render(<ControlDefinitionForm onCancel={noopCancel} />)
    const section = screen.getByRole('heading', { name: /strain composition/i })
    expect(section).toBeInTheDocument()
    const densitySection = screen.getByRole('heading', { name: /target densities/i })
    expect(densitySection).toBeInTheDocument()
    const compositionIndex = section.compareDocumentPosition(densitySection)
    expect(compositionIndex).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
  })

  it('create mode shows one density input and Add density button', async () => {
    await render(<ControlDefinitionForm onCancel={noopCancel} />)
    expect(screen.getByLabelText(/target density/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add density/i })).toBeInTheDocument()
  })

  it('edit mode shows single density and unit without Add density button', async () => {
    const def = {
      id: 1,
      name: 'Test Def',
      controlType: 'blood' as const,
      targetDensity: 500,
      targetDensityUnitId: 1,
      strains: [{ id: 1, name: 'Strain A', percentage: 100 }],
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
    }
    await render(<ControlDefinitionForm controlDefinition={def} onCancel={noopCancel} />)
    expect(screen.getByLabelText(/target density/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /add density/i })).not.toBeInTheDocument()
  })

  it('when multiple densities are provided, shows editable name for each definition and passes names to createDefinitionsBulk', async () => {
    const { controlsApi } = await import('../../../lib/api')
    const suggestNameMock = controlsApi.suggestName as ReturnType<typeof vi.fn>
    suggestNameMock
      .mockResolvedValueOnce({ data: { suggestedName: '100_StrainA', exists: false } })
      .mockResolvedValueOnce({ data: { suggestedName: '500_StrainA', exists: false } })
    const onSuccess = vi.fn()
    await render(<ControlDefinitionForm onCancel={noopCancel} onSuccess={onSuccess} />)
    const user = userEvent.setup()
    const densityInput = screen.getByLabelText(/target density/i)
    await user.clear(densityInput)
    await user.type(densityInput, '100')
    await user.click(screen.getByRole('button', { name: /add.*density/i }))
    const densityInputs = screen.getAllByLabelText(/target density|^density \d+$/i)
    const secondInput = densityInputs.find((el) => (el as HTMLInputElement).value === '') ?? densityInputs[1]
    await user.type(secondInput, '500')
    await screen.findByLabelText(/name.*100|definition.*name/i)
    const nameInputs = screen.getAllByLabelText(/name.*\d+|definition.*name/i)
    expect(nameInputs.length).toBeGreaterThanOrEqual(2)
    await user.clear(nameInputs[0])
    await user.type(nameInputs[0], 'My 100')
    await user.clear(nameInputs[1])
    await user.type(nameInputs[1], 'My 500')
    await user.click(screen.getByRole('button', { name: /create/i }))
    expect(mockCreateDefinitionsBulk).toHaveBeenCalledWith(
      expect.objectContaining({
        strains: [{ strainId: 1, percentage: 100 }],
        targetDensities: [100, 500],
        names: ['My 100', 'My 500'],
      })
    )
  })
})
