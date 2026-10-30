import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, within } from '../../__tests__/helpers/render'
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
vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', { specimensApi: { createBulk: vi.fn() } })
})

async function renderEntry() {
  await render(
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

  it('does not submit when a barcode scanner sends Enter', async () => {
    const user = userEvent.setup()
    await renderEntry()

    await user.type(screen.getAllByPlaceholderText('Barcode')[0], 'MT001{Enter}')

    // A submit would validate the half-filled row and show this message.
    expect(screen.queryByText(/Complete or clear these positions/)).not.toBeInTheDocument()
    expect(specimensApi.createBulk).not.toHaveBeenCalled()
  })

  it('reports partly filled positions instead of skipping them', async () => {
    const user = userEvent.setup()
    await renderEntry()
    await user.type(screen.getAllByPlaceholderText('Subject name')[1], 'S2')

    await user.click(screen.getByRole('button', { name: /create|add|save/i }))

    expect(await screen.findByText(/Complete or clear these positions.*A02/)).toBeInTheDocument()
    expect(specimensApi.createBulk).not.toHaveBeenCalled()
  })

  it('keeps the study picked for a position', async () => {
    const user = userEvent.setup()
    await renderEntry()
    const [studyA01] = screen
      .getAllByRole('combobox')
      .filter((select) => within(select).queryByRole('option', { name: 'Select study' }))

    await user.selectOptions(studyA01, 'ST1')

    expect(studyA01).toHaveValue('ST1')
  })
})
