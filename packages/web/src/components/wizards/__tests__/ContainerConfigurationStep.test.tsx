import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '../../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ContainerConfigurationStep from '../ContainerConfigurationStep'
import type { SpecimenTypeConfig, CSVFileData } from '../../../pages/ControlBatchWizard'

const locationPickerPropsCapture: Array<{ filterCollectionsOnly?: boolean }> = []

vi.mock('../../LocationPicker', () => ({
  default: (props: { filterCollectionsOnly?: boolean }) => {
    locationPickerPropsCapture.push({ filterCollectionsOnly: props.filterCollectionsOnly })
    return (
      <div data-testid="location-picker-mock">
        Location Picker (filterCollectionsOnly={String(props.filterCollectionsOnly)})
      </div>
    )
  },
}))

const mockUnitsByType: Record<string, Array<{ id: number; symbol: string; name: string; category: string }>> = {
  paper: [{ id: 1, symbol: 'spots', name: 'DBS spots', category: 'count' }],
  micronix_tube: [
    { id: 2, symbol: 'µL', name: 'Microliter', category: 'volume' },
    { id: 3, symbol: 'items', name: 'Items', category: 'count' },
  ],
  cryovial_tube: [
    { id: 4, symbol: 'µL', name: 'Microliter', category: 'volume' },
    { id: 5, symbol: 'items', name: 'Items', category: 'count' },
  ],
}

vi.mock('../../../lib/api', async () => {
  const { createMockedApi } = await import('../../../__tests__/helpers/mock-api')
  return createMockedApi({
  collectionsApi: {
    listCollectionsByType: vi.fn().mockResolvedValue({ data: { collections: [] } }),
  },
  settingsApi: {
    getContainerTypeUnits: vi.fn((ct: string) =>
      Promise.resolve({ data: { units: mockUnitsByType[ct] ?? [] } })
    ),
  },
})
})

const specimenTypesWithCollectionConfig: SpecimenTypeConfig[] = [
  {
    id: 'st-1',
    specimenTypeId: 1,
    specimenTypeName: 'DBS',
    containerType: 'micronix_tube',
    containers: [
      {
        id: 'c-1',
        quantity: 1,
        unitSymbol: 'µL',
        collectionName: 'New Plate',
      },
    ],
  },
]

const csvFileWithCollectionConfig: CSVFileData[] = [
  {
    filename: 'test.csv',
    rows: [{ specimen_type_name: 'DBS' }],
    containerType: 'cryovial_tube',
    containerCategoryInferred: 'tube',
    collectionName: 'New Box',
    errors: [],
  },
]

describe('ContainerConfigurationStep', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    locationPickerPropsCapture.length = 0
  })

  it('passes filterCollectionsOnly to LocationPicker when selecting location for new collection (manual tab)', async () => {
    const onChange = vi.fn()
    const onNext = vi.fn()
    const onBack = vi.fn()
    const onCancel = vi.fn()

    await render(
      <ContainerConfigurationStep
        specimenTypes={specimenTypesWithCollectionConfig}
        csvFiles={[]}
        onChangeSpecimenTypes={onChange}
        onChangeCsvFiles={vi.fn()}
        onNext={onNext}
        onBack={onBack}
        onCancel={onCancel}
      />
    )

    // ContainerConfigurationStep renders LocationPicker for collection location in manual tab
    // when specimen type has containers and containerType needs collection (micronix/cryovial)
    const pickers = await screen.findAllByTestId('location-picker-mock')
    expect(pickers.length).toBeGreaterThan(0)

    // All LocationPickers used for collection location must have filterCollectionsOnly
    const collectionLocationPickers = locationPickerPropsCapture
    expect(collectionLocationPickers.length).toBeGreaterThan(0)
    expect(collectionLocationPickers.every((p) => p.filterCollectionsOnly === true)).toBe(true)
  })

  it('passes filterCollectionsOnly to LocationPicker when selecting location for new collection (CSV tab)', async () => {
    const onChange = vi.fn()
    const onNext = vi.fn()
    const onBack = vi.fn()
    const onCancel = vi.fn()

    await render(
      <ContainerConfigurationStep
        specimenTypes={[]}
        csvFiles={csvFileWithCollectionConfig}
        onChangeSpecimenTypes={onChange}
        onChangeCsvFiles={vi.fn()}
        onNext={onNext}
        onBack={onBack}
        onCancel={onCancel}
      />
    )

    // CSV tab shows LocationPicker for collection location
    const pickers = await screen.findAllByTestId('location-picker-mock')
    expect(pickers.length).toBeGreaterThan(0)
    expect(locationPickerPropsCapture.every((p) => p.filterCollectionsOnly === true)).toBe(true)
  })

  it('disables Next button when DBS sheet has no sheet name', async () => {
    const dbsSpecimenType: SpecimenTypeConfig[] = [
      {
        id: 'st-dbs',
        specimenTypeId: 2,
        specimenTypeName: 'DBS',
        containerType: 'paper',
        containers: [
          {
            id: 'c-1',
            quantity: 1,
            unitSymbol: 'spots',
            sheetId: 'sheet-1',
            sheetName: '',
          },
        ],
      },
    ]

    await render(
      <ContainerConfigurationStep
        specimenTypes={dbsSpecimenType}
        csvFiles={[]}
        onChangeSpecimenTypes={vi.fn()}
        onChangeCsvFiles={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const nextBtn = screen.getByRole('button', { name: /next: review/i })
    expect(nextBtn).toBeDisabled()
  })

  it('calls onChangeSpecimenTypes when Add Sheet is clicked for DBS specimen type', async () => {
    const user = userEvent.setup()
    const onChangeSpecimenTypes = vi.fn()
    const dbsSpecimenType: SpecimenTypeConfig[] = [
      {
        id: 'st-dbs',
        specimenTypeId: 2,
        specimenTypeName: 'DBS',
        containerType: 'paper',
        containers: [],
      },
    ]

    await render(
      <ContainerConfigurationStep
        specimenTypes={dbsSpecimenType}
        csvFiles={[]}
        onChangeSpecimenTypes={onChangeSpecimenTypes}
        onChangeCsvFiles={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const addSheetBtn = screen.getByRole('button', { name: /add sheet/i })
    await user.click(addSheetBtn)

    expect(onChangeSpecimenTypes).toHaveBeenCalledTimes(1)
    const updated = onChangeSpecimenTypes.mock.calls[0][0]
    expect(updated).toHaveLength(1)
    expect(updated[0].containers).toHaveLength(1)
    expect(updated[0].containers[0]).toMatchObject({
      unitSymbol: 'spots',
      sheetName: '',
    })
  })

  it('renders unit as select with allowed units for tube specimen types when units are loaded', async () => {
    await render(
      <ContainerConfigurationStep
        specimenTypes={specimenTypesWithCollectionConfig}
        csvFiles={[]}
        onChangeSpecimenTypes={vi.fn()}
        onChangeCsvFiles={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const unitSelect = await screen.findByRole('combobox', { name: /unit/i })
    expect(unitSelect).toBeInTheDocument()
    const options = screen.getAllByRole('option')
    const symbols = options.map((o) => (o as HTMLOptionElement).value)
    expect(symbols).toEqual(expect.arrayContaining(['µL', 'items']))
  })

  it('calls onChangeSpecimenTypes when Add Paper is clicked for a sheet', async () => {
    const user = userEvent.setup()
    const onChangeSpecimenTypes = vi.fn()
    const dbsWithSheet: SpecimenTypeConfig[] = [
      {
        id: 'st-dbs',
        specimenTypeId: 2,
        specimenTypeName: 'DBS',
        containerType: 'paper',
        containers: [
          {
            id: 'c-1',
            quantity: 1,
            unitSymbol: 'spots',
            sheetId: 'sheet-1',
            sheetName: 'Sheet A',
          },
        ],
      },
    ]

    await render(
      <ContainerConfigurationStep
        specimenTypes={dbsWithSheet}
        csvFiles={[]}
        onChangeSpecimenTypes={onChangeSpecimenTypes}
        onChangeCsvFiles={vi.fn()}
        onNext={vi.fn()}
        onBack={vi.fn()}
        onCancel={vi.fn()}
      />
    )

    const addPaperBtn = screen.getByRole('button', { name: /add paper/i })
    await user.click(addPaperBtn)

    expect(onChangeSpecimenTypes).toHaveBeenCalledTimes(1)
    const updated = onChangeSpecimenTypes.mock.calls[0][0]
    expect(updated[0].containers).toHaveLength(2)
    expect(updated[0].containers[1]).toMatchObject({
      sheetName: 'Sheet A',
      sheetId: 'sheet-1',
    })
  })
})
