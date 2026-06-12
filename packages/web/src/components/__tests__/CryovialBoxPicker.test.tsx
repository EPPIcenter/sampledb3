import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within, act } from '../../__tests__/helpers/render'
import CryovialBoxPicker, { type CryovialBox } from '../CryovialBoxPicker'
import type { Location } from '../../lib/api/types'

const mockLocations: Location[] = [
  {
    id: 1,
    name: 'Freezer A',
    parentId: null,
    storageTypeId: null,
    path: 'Freezer A',
    canContainCollections: true,
    created: '',
    lastUpdated: '',
  },
  {
    id: 2,
    name: 'Shelf 1',
    parentId: 1,
    storageTypeId: null,
    path: 'Freezer A / Shelf 1',
    canContainCollections: true,
    created: '',
    lastUpdated: '',
  },
]

const mockBoxes: CryovialBox[] = [
  {
    id: 101,
    name: 'BOX-001',
    barcode: 'BC001',
    locationId: 2,
    itemCount: 12,
    locationPath: 'Freezer A / Shelf 1',
  },
  {
    id: 102,
    name: 'BOX-002',
    barcode: 'BC002',
    locationId: 2,
    itemCount: 0,
    locationPath: 'Freezer A / Shelf 1',
  },
]

describe('CryovialBoxPicker', () => {
  it('opens and selecting a box calls onChange and closes modal', async () => {
    const onChange = vi.fn()
    await render(
      <CryovialBoxPicker
        locations={mockLocations}
        boxes={mockBoxes}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target box/i }))
    await screen.findByRole('heading', { name: 'Select Cryovial Box' })
    fireEvent.click(screen.getByRole('button', { name: /expand freezer a/i }))
    const boxOption = await screen.findByRole('option', { name: /BOX-001/i })
    fireEvent.click(boxOption)
    expect(onChange).toHaveBeenCalledWith('BOX-001')
    expect(screen.queryByRole('heading', { name: 'Select Cryovial Box' })).not.toBeInTheDocument()
  })

  it('debounces search before showing matching boxes list', async () => {
    const onChange = vi.fn()
    await render(
      <CryovialBoxPicker
        locations={mockLocations}
        boxes={mockBoxes}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target box/i }))
    await screen.findByRole('heading', { name: 'Select Cryovial Box' })

    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByPlaceholderText(/search by location/i), {
        target: { value: 'BOX-001' },
      })
      expect(screen.queryByText('Matching boxes')).not.toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(250)
      })
      expect(screen.getByText('Matching boxes')).toBeInTheDocument()
      const listbox = screen.getByRole('listbox', { name: /box list/i })
      fireEvent.click(within(listbox).getByRole('option', { name: /BOX-001/i }))
      expect(onChange).toHaveBeenCalledWith('BOX-001')
    } finally {
      vi.useRealTimers()
    }
  })

  it('allowCreateNew: search with no matches offers create from search text', async () => {
    const onChange = vi.fn()
    await render(
      <CryovialBoxPicker
        locations={mockLocations}
        boxes={mockBoxes}
        onChange={onChange}
        allowCreateNew
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target box/i }))
    await screen.findByRole('heading', { name: 'Select Cryovial Box' })

    vi.useFakeTimers()
    try {
      fireEvent.change(screen.getByPlaceholderText(/search by location/i), {
        target: { value: 'BRAND-NEW' },
      })
      act(() => {
        vi.advanceTimersByTime(250)
      })
      fireEvent.click(screen.getByRole('button', { name: /create new box: brand-new/i }))
      expect(onChange).toHaveBeenCalledWith('BRAND-NEW')
    } finally {
      vi.useRealTimers()
    }
  })

  it('allowCreateNew: user can pick a custom box name', async () => {
    const onChange = vi.fn()
    await render(
      <CryovialBoxPicker
        locations={mockLocations}
        boxes={mockBoxes}
        value="BOX-001"
        onChange={onChange}
        allowCreateNew
        suggestedNewBoxName="BOX-001"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /destination box: box-001/i }))
    await screen.findByRole('heading', { name: 'Select Cryovial Box' })

    fireEvent.change(screen.getByPlaceholderText('Box name'), { target: { value: 'MY-NEW-BOX' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use name' }))

    expect(onChange).toHaveBeenCalledWith('MY-NEW-BOX')
  })

  it('shows new box label when value is not an existing box', async () => {
    await render(
      <CryovialBoxPicker
        locations={mockLocations}
        boxes={mockBoxes}
        value="CUSTOM-BOX"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /destination box: custom-box \(new box\)/i })).toBeInTheDocument()
    expect(screen.getByText('New box')).toBeInTheDocument()
  })
})
