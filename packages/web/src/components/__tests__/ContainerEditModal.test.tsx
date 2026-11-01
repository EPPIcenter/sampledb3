import { describe, it, expect, vi, beforeEach } from 'vitest'
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import ContainerEditModal from '../ContainerEditModal'
import { containersApi } from '../../lib/api/containers'

vi.mock('../../lib/api/reference-data', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('reference-data', {
    tagsApi: { list: vi.fn().mockResolvedValue({ data: [] }) },
  })
})

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
    settingsApi: { getContainerTypeUnits: vi.fn().mockResolvedValue({ units: [] }) },
  })
})

vi.mock('../../lib/api/containers', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('containers', {
    containersApi: { list: vi.fn(), get: vi.fn(), update: vi.fn() },
  })
})

describe('ContainerEditModal', () => {
  beforeEach(() => {
    vi.mocked(containersApi.update).mockReset()
    vi.mocked(containersApi.update).mockResolvedValue({ id: 7, containerType: 'static_well' } as never)
  })

  it('saves a cleared comment', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    await render(
      <ContainerEditModal
        isOpen
        onClose={() => {}}
        onSuccess={onSuccess}
        container={{ id: 7, comment: 'Thawed once', containerType: 'static_well' }}
      />,
    )

    await user.clear(screen.getByLabelText('Comment'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(containersApi.update).toHaveBeenCalledTimes(1)
    expect(containersApi.update).toHaveBeenCalledWith(7, { comment: '' })
  })

  it('edits a Paper sublabel and sends it as the sublabel', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    await render(
      <ContainerEditModal
        isOpen
        onClose={() => {}}
        onSuccess={onSuccess}
        container={{ id: 93926, containerType: 'paper', sublabel: '2067376' }}
      />,
    )

    expect(screen.queryByLabelText(/Barcode/)).not.toBeInTheDocument()
    const sublabel = screen.getByLabelText('Sublabel')
    expect(sublabel).toHaveValue('2067376')
    await user.clear(sublabel)
    await user.type(sublabel, ' 2067376-B ')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(containersApi.update).toHaveBeenCalledWith(93926, { sublabel: '2067376-B' })
  })

  it('clears a Paper sublabel by sending null', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    await render(
      <ContainerEditModal
        isOpen
        onClose={() => {}}
        onSuccess={onSuccess}
        container={{ id: 93926, containerType: 'paper', sublabel: '2067376' }}
      />,
    )

    await user.clear(screen.getByLabelText('Sublabel'))
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(containersApi.update).toHaveBeenCalledWith(93926, { sublabel: null })
  })

  it('shows the API error and stays open when the save fails', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    const onClose = vi.fn()
    vi.mocked(containersApi.update).mockRejectedValue(
      Object.assign(new Error('Request failed with status code 400'), {
        response: { status: 400, data: { error: "Sublabel '2067377' is already in use" } },
      }),
    )
    await render(
      <ContainerEditModal
        isOpen
        onClose={onClose}
        onSuccess={onSuccess}
        container={{ id: 93926, containerType: 'paper', sublabel: '2067376' }}
      />,
    )

    await user.clear(screen.getByLabelText('Sublabel'))
    await user.type(screen.getByLabelText('Sublabel'), '2067377')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    expect(await screen.findByText("Sublabel '2067377' is already in use")).toBeInTheDocument()
    expect(onSuccess).not.toHaveBeenCalled()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('edits a tube barcode and shows no Sublabel field', async () => {
    const user = userEvent.setup()
    const onSuccess = vi.fn()
    await render(
      <ContainerEditModal
        isOpen
        onClose={() => {}}
        onSuccess={onSuccess}
        container={{ id: 8, containerType: 'cryovial_tube', barcode: 'CRYO-1' }}
      />,
    )

    expect(screen.queryByLabelText('Sublabel')).not.toBeInTheDocument()
    await user.clear(screen.getByLabelText('Barcode'))
    await user.type(screen.getByLabelText('Barcode'), 'CRYO-2')
    await user.click(screen.getByRole('button', { name: 'Save Changes' }))

    await waitFor(() => expect(onSuccess).toHaveBeenCalled())
    expect(containersApi.update).toHaveBeenCalledWith(8, { barcode: 'CRYO-2' })
  })

  describe('remaining quantity bounds', () => {
    async function renderQuantity(onSuccess = vi.fn()) {
      await render(
        <ContainerEditModal
          isOpen
          onClose={() => {}}
          onSuccess={onSuccess}
          container={{ id: 94, containerType: 'static_well', remainingQuantity: 4, totalQuantity: 10 }}
        />,
      )
      return onSuccess
    }

    async function saveRemaining(value: string) {
      const user = userEvent.setup()
      const input = screen.getByLabelText(/Remaining Quantity/)
      await user.clear(input)
      await user.type(input, value)
      await user.click(screen.getByRole('button', { name: 'Save Changes' }))
    }

    it('shows the total as the upper bound', async () => {
      await renderQuantity()

      expect(screen.getByLabelText(/Remaining Quantity/)).toHaveAttribute('max', '10')
      expect(screen.getByText('Between 0 and the total quantity, 10')).toBeInTheDocument()
    })

    it('shows an error and does not save a remaining quantity greater than total', async () => {
      const onSuccess = await renderQuantity()

      await saveRemaining('11')

      expect(await screen.findByText('Remaining quantity (11) cannot exceed total quantity (10).')).toBeInTheDocument()
      expect(containersApi.update).not.toHaveBeenCalled()
      expect(onSuccess).not.toHaveBeenCalled()
    })

    it('shows an error and does not save a negative remaining quantity', async () => {
      await renderQuantity()

      await saveRemaining('-5')

      expect(await screen.findByText('Remaining quantity must be 0 or more (got -5).')).toBeInTheDocument()
      expect(containersApi.update).not.toHaveBeenCalled()
    })

    it('saves a remaining quantity equal to total', async () => {
      const onSuccess = await renderQuantity()

      await saveRemaining('10')

      await waitFor(() => expect(onSuccess).toHaveBeenCalled())
      expect(containersApi.update).toHaveBeenCalledWith(94, { remainingQuantity: 10 })
    })

    it('shows the API bounds error', async () => {
      vi.mocked(containersApi.update).mockRejectedValue(
        Object.assign(new Error('Request failed with status code 400'), {
          response: { status: 400, data: { error: 'Remaining quantity (8) cannot exceed total quantity (7).' } },
        }),
      )
      await renderQuantity()

      await saveRemaining('8')

      expect(await screen.findByText('Remaining quantity (8) cannot exceed total quantity (7).')).toBeInTheDocument()
    })
  })
})
