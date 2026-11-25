import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import AddContainerForSpecimenModal from '../AddContainerForSpecimenModal'
import { specimensApi } from '../../lib/api/specimens'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    specimenTypesApi: {
      getContainerTypes: vi.fn().mockResolvedValue({ containerTypes: ['micronix_tube', 'paper'] }),
    },
    unitsApi: {
      listAll: vi.fn().mockResolvedValue([]),
    },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: {
      getValue: vi.fn().mockResolvedValue(null),
      getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }),
    },
  })
})

vi.mock('../../lib/api/collections', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('collections', {
    collectionsApi: {
      listCollectionsByType: vi.fn().mockResolvedValue({ collections: [] }),
    },
  })
})

vi.mock('../../lib/api/specimens', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('specimens', {
    specimensApi: {
      addContainer: vi.fn().mockResolvedValue({ containerId: 42 }),
    },
  })
})

describe('AddContainerForSpecimenModal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(specimensApi.addContainer).mockResolvedValue({ containerId: 42 })
  })

  it('shows the required barcode error and keeps submit disabled for a whitespace-only barcode', async () => {
    const user = userEvent.setup()
    await render(
      <AddContainerForSpecimenModal isOpen onClose={vi.fn()} specimenId={7} specimenTypeId={1} />
    )

    const plateInput = await screen.findByPlaceholderText(/type to search or enter plate name/i)
    await user.type(plateInput, 'Plate-1')
    await user.type(screen.getByPlaceholderText(/enter barcode/i), '   ')
    await user.type(screen.getByPlaceholderText(/a01, b12/i), 'A01')

    expect(screen.getByText('Barcode is required for micronix tubes')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add container/i })).toBeDisabled()
    expect(specimensApi.addContainer).not.toHaveBeenCalled()
  })

  it('sends trimmed identifier strings when submitting', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    await render(
      <AddContainerForSpecimenModal isOpen onClose={onClose} specimenId={7} specimenTypeId={1} />
    )

    const plateInput = await screen.findByPlaceholderText(/type to search or enter plate name/i)
    await user.type(plateInput, '  Plate-1  ')
    await user.type(screen.getByPlaceholderText(/enter barcode/i), '  MT-001  ')
    await user.type(screen.getByPlaceholderText(/a01, b12/i), ' A01 ')

    const submit = screen.getByRole('button', { name: /add container/i })
    await waitFor(() => expect(submit).toBeEnabled())
    await user.click(submit)

    await waitFor(() => {
      expect(specimensApi.addContainer).toHaveBeenCalledWith(7, {
        containerType: 'micronix_tube',
        barcode: 'MT-001',
        collection: {
          type: 'micronix_plate',
          name: 'Plate-1',
          position: 'A01',
        },
      })
    })
    expect(onClose).toHaveBeenCalled()
  })

  it('shows the API error message in the modal and stays open when the request fails', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    vi.mocked(specimensApi.addContainer).mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: { error: 'Barcode is required for micronix tubes' },
        },
      })
    )

    await render(
      <AddContainerForSpecimenModal isOpen onClose={onClose} specimenId={7} specimenTypeId={1} />
    )

    const plateInput = await screen.findByPlaceholderText(/type to search or enter plate name/i)
    await user.type(plateInput, 'Plate-1')
    await user.type(screen.getByPlaceholderText(/enter barcode/i), 'MT-001')
    await user.type(screen.getByPlaceholderText(/a01, b12/i), 'A01')

    await user.click(screen.getByRole('button', { name: /add container/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Barcode is required for micronix tubes')
    expect(onClose).not.toHaveBeenCalled()
  })

  it('shows Zod validation detail messages when the API returns a 400 Validation error', async () => {
    const user = userEvent.setup()
    vi.mocked(specimensApi.addContainer).mockRejectedValueOnce(
      Object.assign(new Error('Request failed with status code 400'), {
        response: {
          status: 400,
          data: {
            error: 'Validation error',
            details: [{ path: ['barcode'], message: 'String must contain at least 1 character(s)' }],
          },
        },
      })
    )

    await render(
      <AddContainerForSpecimenModal isOpen onClose={vi.fn()} specimenId={7} specimenTypeId={1} />
    )

    const plateInput = await screen.findByPlaceholderText(/type to search or enter plate name/i)
    await user.type(plateInput, 'Plate-1')
    await user.type(screen.getByPlaceholderText(/enter barcode/i), 'MT-001')
    await user.type(screen.getByPlaceholderText(/a01, b12/i), 'A01')

    await user.click(screen.getByRole('button', { name: /add container/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/barcode.*at least 1 character/i)
  })
})
