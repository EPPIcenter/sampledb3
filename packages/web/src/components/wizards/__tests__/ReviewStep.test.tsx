import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ReviewStep from '../ReviewStep'
import type { BatchInfo, CSVFileData, CompositionStrains } from '../../../pages/ControlBatchWizard'
import type { ControlDefinition } from '../../../lib/api/controls'

const mockCreateBatchWithSpecimens = vi.fn()
const mockSuggestBatchName = vi.fn()

vi.mock('../../../lib/api/controls', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  return createMockedDomainModule('controls', {
    controlsApi: {
      createBatchWithSpecimens: (...args: unknown[]) => mockCreateBatchWithSpecimens(...args),
      suggestBatchName: (...args: unknown[]) => mockSuggestBatchName(...args),
    },
  })
})

const containerDefaults = {
  paper: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
  cryovial_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'µL' },
  micronix_tube: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'µL' },
  static_well: { totalQuantity: 1, remainingQuantity: 1, defaultUnitSymbol: 'spots' },
}

vi.mock('../../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: vi.fn(async (key: string) => {
        if (key === 'container_defaults') {
          return containerDefaults
        }
        return null
      }),
    },
  })
})

function makeBatchInfo(overrides: Partial<BatchInfo> = {}): BatchInfo {
  return {
    controlDefinitionId: null,
    controlDefinition: null,
    name: '',
    productionDate: '2024-06-01',
    ...overrides,
  }
}

function makeCsvFile(overrides: Partial<CSVFileData> = {}): CSVFileData {
  return {
    filename: 'test.csv',
    rows: [],
    errors: [],
    collectionId: 1,
    collectionName: 'Test Collection',
    ...overrides,
  }
}

describe('ReviewStep multi-batch CSV', () => {
  const compositionStrains: CompositionStrains = [{ id: 1, percentage: 100 }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggestBatchName.mockResolvedValue({ name: 'Suggested Batch' })
    mockCreateBatchWithSpecimens.mockResolvedValue({ batch: { id: 101 }, specimens: [], createdCollections: [] })
  })

  it('does not call createBatchWithSpecimens when a density has no matching definition', async () => {
    const def5000: ControlDefinition = {
      id: 10,
      name: 'Def 5000',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 5000,
      unitSymbol: 'µL',
    }
    const csvFiles: CSVFileData[] = [
      makeCsvFile({
        rows: [
          { specimen_type_name: 'Whole Blood', density: 5000 },
          { specimen_type_name: 'Whole Blood', density: 99999 },
        ],
      }),
    ]
    const compositionDefinitions: ControlDefinition[] = [def5000]

    render(
      <ReviewStep
        batchInfo={makeBatchInfo()}
        compositionStrains={compositionStrains}
        compositionDefinitions={compositionDefinitions}
        specimenTypes={[]}
        csvFiles={csvFiles}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={() => {}}
        isAddMode={false}
      />
    )

    expect(screen.getByText(/No definition found/i)).toBeInTheDocument()
    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    expect(submitBtn).toBeDisabled()

    fireEvent.click(submitBtn)
    expect(mockCreateBatchWithSpecimens).not.toHaveBeenCalled()
  })

  it('calls createBatchWithSpecimens with correct definition IDs when all densities match', async () => {
    const def5000: ControlDefinition = {
      id: 10,
      name: 'Def 5000',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 5000,
      unitSymbol: 'µL',
    }
    const def0: ControlDefinition = {
      id: 11,
      name: 'Def 0',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 0,
    }
    const csvFiles: CSVFileData[] = [
      makeCsvFile({
        rows: [
          { specimen_type_name: 'Whole Blood', density: 5000 },
          { specimen_type_name: 'Whole Blood', density: 0 },
        ],
      }),
    ]
    const compositionDefinitions: ControlDefinition[] = [def5000, def0]

    const onSuccess = vi.fn()
    render(
      <ReviewStep
        batchInfo={makeBatchInfo()}
        compositionStrains={compositionStrains}
        compositionDefinitions={compositionDefinitions}
        specimenTypes={[]}
        csvFiles={csvFiles}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={onSuccess}
        isAddMode={false}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockCreateBatchWithSpecimens).toHaveBeenCalledTimes(2)
    })
    expect(mockSuggestBatchName).toHaveBeenCalled()
    const createCalls = mockCreateBatchWithSpecimens.mock.calls
    const definitionIds = createCalls.map((c) => c[0].batch.controlDefinitionId)
    expect(definitionIds).toContain(10)
    expect(definitionIds).toContain(11)
  })

  it('shows definition dropdown when multiple definitions match same density and uses selected definition on submit', async () => {
    const defA: ControlDefinition = {
      id: 20,
      name: 'Def A',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 5000,
      unitSymbol: 'p/µL',
    }
    const defB: ControlDefinition = {
      id: 21,
      name: 'Def B',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 5000,
      unitSymbol: '/mL',
    }
    const csvFiles: CSVFileData[] = [
      makeCsvFile({
        rows: [{ specimen_type_name: 'Whole Blood', density: 5000 }],
      }),
    ]
    const compositionDefinitions: ControlDefinition[] = [defA, defB]

    render(
      <ReviewStep
        batchInfo={makeBatchInfo()}
        compositionStrains={compositionStrains}
        compositionDefinitions={compositionDefinitions}
        specimenTypes={[]}
        csvFiles={csvFiles}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={() => {}}
        isAddMode={false}
      />
    )

    const select = screen.getByRole('combobox', { name: /Definition for density 5000/i })
    expect(select).toBeInTheDocument()
    expect(select).toHaveValue('')

    fireEvent.change(select, { target: { value: '21' } })

    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockCreateBatchWithSpecimens).toHaveBeenCalledTimes(1)
    })
    expect(mockCreateBatchWithSpecimens).toHaveBeenCalledWith(
      expect.objectContaining({
        batch: expect.objectContaining({ controlDefinitionId: 21 }),
      })
    )
  })
})

describe('ReviewStep multi-batch CSV createCollections', () => {
  const compositionStrains: CompositionStrains = [{ id: 1, percentage: 100 }]

  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggestBatchName.mockResolvedValue({ name: 'Suggested Batch' })
    mockCreateBatchWithSpecimens.mockResolvedValue({ batch: { id: 103 }, specimens: [], createdCollections: [] })
  })

  it('passes createCollections when CSV file has collectionName but no collectionId', async () => {
    const def5000: ControlDefinition = {
      id: 10,
      name: 'Def 5000',
      controlType: 'blood',
      created: '',
      lastUpdated: '',
      targetDensity: 5000,
      unitSymbol: 'µL',
    }
    const csvFiles: CSVFileData[] = [
      makeCsvFile({
        collectionId: undefined,
        collectionName: 'New Box',
        collectionLocationId: 42,
        collectionType: 'box',
        containerType: 'paper',
        sheetName: 'Sheet 1',
        rows: [
          { specimen_type_name: 'Whole Blood', density: 5000 },
        ],
      }),
    ]
    const compositionDefinitions: ControlDefinition[] = [def5000]

    const onSuccess = vi.fn()
    render(
      <ReviewStep
        batchInfo={makeBatchInfo()}
        compositionStrains={compositionStrains}
        compositionDefinitions={compositionDefinitions}
        specimenTypes={[]}
        csvFiles={csvFiles}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={onSuccess}
        isAddMode={false}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockCreateBatchWithSpecimens).toHaveBeenCalledTimes(1)
    })
    const payload = mockCreateBatchWithSpecimens.mock.calls[0][0]
    expect(payload.createCollections).toEqual([
      { type: 'box', name: 'New Box', locationId: 42 },
    ])
  })
})

describe('ReviewStep single-batch submitting state', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggestBatchName.mockResolvedValue({ name: 'Suggested Batch' })
  })

  it('re-enables submit button after API error', async () => {
    mockCreateBatchWithSpecimens.mockRejectedValueOnce(new Error('Server error'))

    render(
      <ReviewStep
        batchInfo={makeBatchInfo({ controlDefinitionId: 1, name: 'Batch 1' })}
        specimenTypes={[{
          id: 'st1',
          specimenTypeId: 1,
          specimenTypeName: 'Whole Blood',
          containerType: 'cryovial_tube',
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'µL', position: 'A1' }],
        }]}
        csvFiles={[]}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={() => {}}
        isAddMode={false}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled()
    })
  })

  it('re-enables submit button when onSuccess callback throws', async () => {
    mockCreateBatchWithSpecimens.mockResolvedValueOnce({ batch: { id: 200 }, specimens: [], createdCollections: [] })

    const onSuccess = vi.fn(() => { throw new Error('Navigation failed') })

    render(
      <ReviewStep
        batchInfo={makeBatchInfo({ controlDefinitionId: 1, name: 'Batch 1' })}
        specimenTypes={[{
          id: 'st1',
          specimenTypeId: 1,
          specimenTypeName: 'Whole Blood',
          containerType: 'cryovial_tube',
          containers: [{ id: 'c1', quantity: 1, unitSymbol: 'µL', position: 'A1' }],
        }]}
        csvFiles={[]}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={onSuccess}
        isAddMode={false}
      />
    )

    const submitBtn = screen.getByRole('button', { name: /Create Batch/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalled()
    })

    await waitFor(() => {
      expect(submitBtn).not.toBeDisabled()
    })
  })
})

describe('ReviewStep CSV unit fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockSuggestBatchName.mockResolvedValue({ name: 'Suggested Batch' })
    mockCreateBatchWithSpecimens.mockResolvedValue({ batch: { id: 102 }, specimens: [], createdCollections: [] })
  })

  it('uses container default unit when CSV row omits unit_symbol', async () => {
    render(
      <ReviewStep
        batchInfo={makeBatchInfo({ controlDefinitionId: 1 })}
        specimenTypes={[]}
        csvFiles={[
          makeCsvFile({
            containerType: 'micronix_tube',
            rows: [{ specimen_type_name: 'Whole Blood', position: 'A1' }],
          }),
        ]}
        onBack={() => {}}
        onCancel={() => {}}
        onSuccess={() => {}}
        isAddMode={true}
      />
    )

    const submitBtn = await screen.findByRole('button', { name: /Add Specimens/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(mockCreateBatchWithSpecimens).toHaveBeenCalledTimes(1)
    })
    const payload = mockCreateBatchWithSpecimens.mock.calls[0][0]
    const container = payload.specimens[0].containers[0]
    expect(container.unitSymbol).toBe('µL')
  })
})
