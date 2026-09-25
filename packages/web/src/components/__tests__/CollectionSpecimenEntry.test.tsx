import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import CollectionSpecimenEntry from '../CollectionSpecimenEntry'
import { specimensApi } from '../../lib/api/specimens'

vi.mock('../../hooks/useStudies', () => ({
  useStudies: () => ({
    data: { studies: [{ id: 1, shortCode: 'ST1', title: 'Study 1' }] },
    isLoading: false,
    isError: false,
  }),
}))
vi.mock('../../hooks/useReferenceData', () => ({
  useSpecimenTypes: () => ({ data: [{ id: 1, name: 'DNA' }], isLoading: false, isError: false }),
}))
vi.mock('../../lib/api/specimens', () => ({
  specimensApi: { createBulk: vi.fn() },
}))

function renderEntry() {
  return render(
    <CollectionSpecimenEntry
      collectionType="micronix_plate"
      collectionId={7}
      positions={['A01', 'A02']}
      onSuccess={vi.fn()}
      onCancel={vi.fn()}
    />,
  )
}

describe('CollectionSpecimenEntry', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('does not submit when a barcode scanner sends Enter', () => {
    renderEntry()
    const barcode = screen.getAllByPlaceholderText('Barcode')[0]
    fireEvent.change(barcode, { target: { value: 'MT001' } })

    const notPrevented = fireEvent.keyDown(barcode, { key: 'Enter' })

    expect(notPrevented).toBe(false)
    expect(specimensApi.createBulk).not.toHaveBeenCalled()
  })

  it('reports partly filled positions instead of skipping them', async () => {
    renderEntry()
    fireEvent.change(screen.getAllByPlaceholderText('Subject name')[1], { target: { value: 'S2' } })

    fireEvent.click(screen.getByRole('button', { name: /create|add|save/i }))

    expect(await screen.findByText(/Complete or clear these positions.*A02/)).toBeInTheDocument()
    expect(specimensApi.createBulk).not.toHaveBeenCalled()
  })
})
