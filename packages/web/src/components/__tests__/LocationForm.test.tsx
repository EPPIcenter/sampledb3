import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import { fireEvent } from '@testing-library/react'
import LocationForm from '../LocationForm'
import * as api from '../../lib/api'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  locationsApi: {},
  storageTypesApi: {
    list: vi.fn().mockResolvedValue({
      data: [
        { id: 1, name: 'Freezer', description: '-80°C' },
        { id: 2, name: 'Fridge', description: '4°C' },
      ],
    }),
  },
})
})

describe('LocationForm', () => {
  const onSave = vi.fn()
  const onCancel = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(api.storageTypesApi.list).mockResolvedValue({
      data: [
        { id: 1, name: 'Freezer', description: '-80°C' },
        { id: 2, name: 'Fridge', description: '4°C' },
      ],
    } as never)
  })

  it('renders Add Root Location when no location and no parentId', async () => {
    await render(
      <LocationForm onSave={onSave} onCancel={onCancel} />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add root location/i })).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/^name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/storage type/i)).toBeInTheDocument()
  })

  it('calls onCancel when Cancel is clicked', async () => {
    const user = userEvent.setup()
    await render(
      <LocationForm onSave={onSave} onCancel={onCancel} />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add root location/i })).toBeInTheDocument()
    })
    await user.click(screen.getByRole('button', { name: /cancel/i }))
    expect(onCancel).toHaveBeenCalled()
  })

  it('calls onSave with form data when root location is submitted', async () => {
    onSave.mockResolvedValue(undefined)
    const user = userEvent.setup()
    await render(
      <LocationForm onSave={onSave} onCancel={onCancel} />
    )
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /storage type/i })).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/^name/i), 'Building A')
    await user.selectOptions(screen.getByRole('combobox', { name: /storage type/i }), '1')
    await user.click(screen.getByRole('button', { name: /create/i }))
    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Building A',
          storageTypeId: '1',
          parentId: null,
          canContainCollections: false,
        })
      )
    })
  })

  it('shows error when root location is submitted without storage type', async () => {
    const user = userEvent.setup()
    await render(
      <LocationForm onSave={onSave} onCancel={onCancel} />
    )
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /storage type/i })).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/^name/i), 'Building A')
    const form = screen.getByRole('button', { name: /create/i }).closest('form')
    expect(form).toBeInTheDocument()
    fireEvent.submit(form!)
    await waitFor(() => {
      expect(screen.getByText(/storage type is required for root locations/i)).toBeInTheDocument()
    })
    expect(onSave).not.toHaveBeenCalled()
  })

  it('renders Add Child Location when parentId is provided', async () => {
    await render(
      <LocationForm
        parentId={10}
        parentLocation={{ id: 10, name: 'Building A', path: 'Building A' } as never}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /add child location/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/Parent Location/)).toBeInTheDocument()
    expect(screen.getByText(/Building A/)).toBeInTheDocument()
    expect(screen.queryByLabelText(/storage type/i)).not.toBeInTheDocument()
  })

  it('renders Edit Location when location is provided', async () => {
    await render(
      <LocationForm
        location={{
          id: 5,
          name: 'Room 101',
          description: 'Lab room',
          storageTypeId: 1,
          parentId: null,
          canContainCollections: true,
        } as never}
        onSave={onSave}
        onCancel={onCancel}
      />
    )
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /edit location/i })).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/^name/i)).toHaveValue('Room 101')
    expect(screen.getByLabelText(/description/i)).toHaveValue('Lab room')
  })
})
