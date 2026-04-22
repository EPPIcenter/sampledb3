import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import BatchInfoStep from '../BatchInfoStep'

vi.mock('../../../lib/api', () => ({
  controlsApi: {
    list: vi.fn().mockResolvedValue({ data: { controls: [] } }),
    getDefinitionSummary: vi.fn(),
  },
  strainsApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
}))

vi.mock('../../ModalPortal', () => ({ default: ({ children }: { children: React.ReactNode }) => children }))
vi.mock('../../forms/ControlDefinitionForm', () => ({ default: () => <div>Form</div> }))

const defaultBatchInfo = {
  controlDefinitionId: 0,
  name: '',
  productionDate: '',
  controlDefinition: null,
}

describe('BatchInfoStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders with Next and Cancel', async () => {
    const onChange = vi.fn()
    const onNext = vi.fn()
    const onCancel = vi.fn()
    await render(
      <BatchInfoStep
        batchInfo={defaultBatchInfo}
        onChange={onChange}
        onNext={onNext}
        onCancel={onCancel}
        isAddMode={false}
      />
    )
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next|continue/i })).toBeInTheDocument()
  })
})
