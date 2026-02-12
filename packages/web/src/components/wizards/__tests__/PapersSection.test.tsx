import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import PapersSection from '../PapersSection'
import type { ContainerConfig } from '../../../pages/ControlBatchWizard'

const paperContainers: ContainerConfig[] = [
  {
    id: 'c-1',
    quantity: 1,
    unitSymbol: 'spots',
    barcode: 'BC1',
    position: 'A1',
  },
  {
    id: 'c-2',
    quantity: 2,
    unitSymbol: 'spots',
    barcode: 'BC2',
    position: 'A2',
  },
]

describe('PapersSection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders paper rows with barcode, position, quantity, unit', () => {
    const onUpdate = vi.fn()
    const onAdd = vi.fn()
    const onRemove = vi.fn()

    render(
      <PapersSection
        containers={paperContainers}
        specimenTypeId="st-1"
        onUpdate={onUpdate}
        onAdd={onAdd}
        onRemove={onRemove}
      />
    )

    const barcodeInputs = screen.getAllByPlaceholderText('Barcode')
    expect(barcodeInputs[0]).toHaveValue('BC1')
    expect(barcodeInputs[1]).toHaveValue('BC2')
    expect(screen.getByDisplayValue('A1')).toBeInTheDocument()
    expect(screen.getByDisplayValue('1')).toBeInTheDocument()
    const unitInputs = screen.getAllByPlaceholderText('Unit')
    expect(unitInputs).toHaveLength(2)
    expect(unitInputs[0]).toHaveValue('spots')
  })

  it('calls onAdd when Add Paper button is clicked', async () => {
    const user = userEvent.setup()
    const onAdd = vi.fn()

    render(
      <PapersSection
        containers={paperContainers}
        specimenTypeId="st-1"
        onUpdate={vi.fn()}
        onAdd={onAdd}
        onRemove={vi.fn()}
      />
    )

    const addBtn = screen.getByRole('button', { name: /add paper/i })
    await user.click(addBtn)

    expect(onAdd).toHaveBeenCalledTimes(1)
  })

  it('calls onUpdate when user edits a paper field', () => {
    const onUpdate = vi.fn()

    render(
      <PapersSection
        containers={paperContainers}
        specimenTypeId="st-1"
        onUpdate={onUpdate}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    const barcodeInputs = screen.getAllByPlaceholderText('Barcode')
    fireEvent.change(barcodeInputs[0], { target: { value: 'NEW' } })

    expect(onUpdate).toHaveBeenCalledWith('st-1', 'c-1', { barcode: 'NEW' })
  })

  it('calls onRemove when remove button is clicked', async () => {
    const user = userEvent.setup()
    const onRemove = vi.fn()

    render(
      <PapersSection
        containers={paperContainers}
        specimenTypeId="st-1"
        onUpdate={vi.fn()}
        onAdd={vi.fn()}
        onRemove={onRemove}
      />
    )

    const removeBtns = screen.getAllByTitle(/remove this paper/i)
    await user.click(removeBtns[0])

    expect(onRemove).toHaveBeenCalledWith('st-1', 'c-1')
  })

  it('shows collapsible header with paper count', () => {
    render(
      <PapersSection
        containers={paperContainers}
        specimenTypeId="st-1"
        onUpdate={vi.fn()}
        onAdd={vi.fn()}
        onRemove={vi.fn()}
      />
    )

    expect(screen.getByText(/papers in this sheet \(2\)/i)).toBeInTheDocument()
  })
})
