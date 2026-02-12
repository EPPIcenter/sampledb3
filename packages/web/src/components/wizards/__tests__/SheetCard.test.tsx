import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SheetCard from '../SheetCard'
import type { ContainerConfig } from '../../../pages/ControlBatchWizard'

vi.mock('../../LocationPicker', () => ({
  default: () => <div data-testid="location-picker-mock">Location Picker</div>,
}))

vi.mock('../../../lib/api', () => ({
  collectionsApi: {
    listCollectionsByType: vi.fn().mockResolvedValue({ data: { collections: [] } }),
  },
}))

const sheetContainers: ContainerConfig[] = [
  {
    id: 'c-1',
    quantity: 1,
    unitSymbol: 'spots',
    sheetName: 'Sheet A',
    sheetId: 'sheet-1',
    collectionType: 'box',
    collectionName: '',
  },
]

describe('SheetCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders sheet name input and papers section', () => {
    render(
      <SheetCard
        sheetId="sheet-1"
        containers={sheetContainers}
        specimenTypeId="st-1"
        onUpdateSheetName={vi.fn()}
        onUpdateContainer={vi.fn()}
        onRemoveSheet={vi.fn()}
        onAddPaper={vi.fn()}
        onRemoveContainer={vi.fn()}
        onCollectionChange={vi.fn()}
        onCreateCollection={vi.fn()}
        existingCollections={{ boxes: new Map(), bags: new Map() }}
      />
    )

    expect(screen.getByDisplayValue('Sheet A')).toBeInTheDocument()
    expect(screen.getByText(/papers in this sheet \(1\)/i)).toBeInTheDocument()
  })

  it('calls onUpdateSheetName when sheet name is edited', () => {
    const onUpdateSheetName = vi.fn()
    render(
      <SheetCard
        sheetId="sheet-1"
        containers={sheetContainers}
        specimenTypeId="st-1"
        onUpdateSheetName={onUpdateSheetName}
        onUpdateContainer={vi.fn()}
        onRemoveSheet={vi.fn()}
        onAddPaper={vi.fn()}
        onRemoveContainer={vi.fn()}
        onCollectionChange={vi.fn()}
        onCreateCollection={vi.fn()}
        existingCollections={{ boxes: new Map(), bags: new Map() }}
      />
    )

    const input = screen.getByDisplayValue('Sheet A')
    fireEvent.change(input, { target: { value: 'New Name' } })

    expect(onUpdateSheetName).toHaveBeenCalledWith('New Name')
  })

  it('calls onRemoveSheet when Remove Sheet button is clicked', async () => {
    const user = userEvent.setup()
    const onRemoveSheet = vi.fn()
    render(
      <SheetCard
        sheetId="sheet-1"
        containers={sheetContainers}
        specimenTypeId="st-1"
        onUpdateSheetName={vi.fn()}
        onUpdateContainer={vi.fn()}
        onRemoveSheet={onRemoveSheet}
        onAddPaper={vi.fn()}
        onRemoveContainer={vi.fn()}
        onCollectionChange={vi.fn()}
        onCreateCollection={vi.fn()}
        existingCollections={{ boxes: new Map(), bags: new Map() }}
      />
    )

    const removeBtn = screen.getByRole('button', { name: /remove sheet/i })
    await user.click(removeBtn)

    expect(onRemoveSheet).toHaveBeenCalledTimes(1)
  })
})
