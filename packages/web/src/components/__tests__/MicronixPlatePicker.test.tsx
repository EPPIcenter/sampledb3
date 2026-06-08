import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, within } from '../../__tests__/helpers/render'
import MicronixPlatePicker, { type MicronixPlate } from '../MicronixPlatePicker'
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

const mockPlates: MicronixPlate[] = [
  {
    id: 101,
    name: 'PLATE-001',
    barcode: 'BC001',
    locationId: 2,
    itemCount: 12,
    locationPath: 'Freezer A / Shelf 1',
  },
  {
    id: 102,
    name: 'PLATE-002',
    barcode: 'BC002',
    locationId: 2,
    itemCount: 0,
    locationPath: 'Freezer A / Shelf 1',
  },
  {
    id: 103,
    name: 'PLATE-003-OTHER',
    barcode: 'BC003',
    locationId: 2,
    itemCount: 5,
    locationPath: 'Freezer A / Shelf 1',
  },
]

describe('MicronixPlatePicker', () => {
  it('opens and selecting a plate calls onChange and closes modal', async () => {
    const onChange = vi.fn()
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={onChange}
      />
    )
    const trigger = screen.getByRole('button', { name: /select target plate/i })
    fireEvent.click(trigger)
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    // Expand Freezer A so Shelf 1 and its plates are visible (expand control must be full-row or easy to hit)
    fireEvent.click(screen.getByRole('button', { name: /expand freezer a/i }))
    const plateOption = await screen.findByRole('option', { name: /PLATE-001/i })
    fireEvent.click(plateOption)
    expect(onChange).toHaveBeenCalledWith('PLATE-001')
    expect(screen.queryByRole('heading', { name: 'Select Micronix Plate' })).not.toBeInTheDocument()
  })

  it('expand/collapse control is a full-row button with accessible name', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    const expandButton = screen.getByRole('button', { name: /expand freezer a/i })
    expect(expandButton).toHaveAttribute('aria-expanded', 'false')
    // Full-row pattern: button has min height for touch target
    expect(expandButton.className).toMatch(/min-h-\[44px\]/)
    fireEvent.click(expandButton)
    expect(expandButton).toHaveAttribute('aria-expanded', 'true')
  })

  it('modal does not close when clicking inside modal content', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={vi.fn()}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    const heading = await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    const searchInput = screen.getByPlaceholderText(/search by location/i)
    fireEvent.click(searchInput)
    fireEvent.change(searchInput, { target: { value: 'PLATE' } })
    expect(heading).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Select Micronix Plate' })).toBeInTheDocument()
  })

  it('when searching, shows flat list of matching plates above tree and selection works', async () => {
    const onChange = vi.fn()
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    const searchInput = screen.getByPlaceholderText(/search by location/i)
    fireEvent.change(searchInput, { target: { value: 'PLATE-001' } })
    await screen.findByText('Matching plates')
    const listbox = screen.getByRole('listbox', { name: /plate list/i })
    expect(listbox).toBeInTheDocument()
    const plateOption = within(listbox).getByRole('option', { name: /PLATE-001/i })
    fireEvent.click(plateOption)
    expect(onChange).toHaveBeenCalledWith('PLATE-001')
    expect(screen.queryByRole('heading', { name: 'Select Micronix Plate' })).not.toBeInTheDocument()
  })

  it('shows Suggested from scan in inference order when multiple suggestions and no value', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={vi.fn()}
        suggestedPlates={[
          { id: 102, name: 'PLATE-002', matchType: 'contains' },
          { id: 101, name: 'PLATE-001', matchType: 'contains' },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    const suggested = screen.getByRole('listbox', { name: /suggested plates from scan/i })
    const options = within(suggested).getAllByRole('option')
    expect(options).toHaveLength(2)
    expect(options[0]).toHaveAccessibleName(/PLATE-002/i)
    expect(options[1]).toHaveAccessibleName(/PLATE-001/i)
  })

  it('when searching, lists suggested plates before other matches', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={vi.fn()}
        suggestedPlates={[
          { id: 102, name: 'PLATE-002', matchType: 'contains' },
          { id: 101, name: 'PLATE-001', matchType: 'contains' },
        ]}
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    fireEvent.change(screen.getByPlaceholderText(/search by location/i), {
      target: { value: 'PLATE' },
    })
    await screen.findByText('Matching plates')
    const listbox = screen.getByRole('listbox', { name: /plate list/i })
    const options = within(listbox).getAllByRole('option')
    expect(options[0]).toHaveAccessibleName(/PLATE-002/i)
    expect(options[1]).toHaveAccessibleName(/PLATE-001/i)
    expect(options[options.length - 1]).toHaveAccessibleName(/PLATE-003-OTHER/i)
  })

  it('shows new plate label when value is not an existing plate', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        value="CUSTOM-PLATE"
        onChange={vi.fn()}
      />
    )
    expect(screen.getByRole('button', { name: /destination plate: custom-plate \(new plate\)/i })).toBeInTheDocument()
    expect(screen.getByText('New plate')).toBeInTheDocument()
  })

  it('allowCreateNew: user can pick a custom plate name', async () => {
    const onChange = vi.fn()
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        value="PLATE-001"
        onChange={onChange}
        allowCreateNew
        suggestedNewPlateName="PLATE-001"
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /destination plate: plate-001/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })

    const nameInput = screen.getByPlaceholderText('Plate name')
    fireEvent.change(nameInput, { target: { value: 'MY-NEW-PLATE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use name' }))

    expect(onChange).toHaveBeenCalledWith('MY-NEW-PLATE')
    expect(screen.queryByRole('heading', { name: 'Select Micronix Plate' })).not.toBeInTheDocument()
  })

  it('allowCreateNew: disables use name when plate already exists', async () => {
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={vi.fn()}
        allowCreateNew
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })

    fireEvent.change(screen.getByPlaceholderText('Plate name'), { target: { value: 'PLATE-002' } })
    expect(screen.getByRole('button', { name: 'Use name' })).toBeDisabled()
    expect(screen.getByText(/already exists/i)).toBeInTheDocument()
  })

  it('allowCreateNew: search with no matches offers create from search text', async () => {
    const onChange = vi.fn()
    await render(
      <MicronixPlatePicker
        locations={mockLocations}
        plates={mockPlates}
        onChange={onChange}
        allowCreateNew
      />
    )
    fireEvent.click(screen.getByRole('button', { name: /select target plate/i }))
    await screen.findByRole('heading', { name: 'Select Micronix Plate' })
    fireEvent.change(screen.getByPlaceholderText(/search by location/i), {
      target: { value: 'BRAND-NEW' },
    })
    fireEvent.click(screen.getByRole('button', { name: /create new plate: brand-new/i }))
    expect(onChange).toHaveBeenCalledWith('BRAND-NEW')
  })
})
