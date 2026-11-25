import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../../__tests__/helpers/render'
import { controlsApi } from '../../../lib/api/controls'
import BatchInfoStep from '../BatchInfoStep'

vi.mock('../../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
  controlsApi: {
    list: vi.fn().mockResolvedValue({ controls: [] }),
    getDefinitionSummary: vi.fn(),
  },
  strainsApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  },
})
})

vi.mock('../../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
  controlsApi: {
    list: vi.fn().mockResolvedValue({ controls: [] }),
    get: vi.fn(),
    getDefinitionSummary: vi.fn(),
  },
  strainsApi: {
    list: vi.fn().mockResolvedValue({ data: [] }),
  }
  })
})

vi.mock('../../../ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../ui')>()
  return {
    ...actual,
    Modal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  }
})
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

  it('attaches the loaded definition once, not again when another batch field changes', async () => {
    vi.mocked(controlsApi.get).mockResolvedValue({
      control: { id: 5, name: 'Def 5', controlType: 'blood' },
    } as unknown as Awaited<ReturnType<typeof controlsApi.get>>)
    const onChange = vi.fn()
    const props = { onChange, onNext: vi.fn(), onCancel: vi.fn(), isAddMode: false }
    const batchInfo = { ...defaultBatchInfo, controlDefinitionId: 5 }
    const { rerender } = await render(<BatchInfoStep batchInfo={batchInfo} {...props} />)

    await waitFor(() => expect(onChange).toHaveBeenCalledTimes(1))
    expect(onChange.mock.calls[0]?.[0]).toMatchObject({ controlDefinitionId: 5, controlDefinition: { id: 5 } })

    // The parent hasn't stored the definition yet, but only the name changed.
    rerender(<BatchInfoStep batchInfo={{ ...batchInfo, name: 'Batch A' }} {...props} />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
