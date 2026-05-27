import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ExportConfigurationsManager from '../ExportConfigurationsManager'
import { exportConfigurationsApi } from '../../lib/api/settings'

const sharedConfigs = [
  { name: 'Shared One', columns: ['container_id', 'barcode'], isDefault: true },
  { name: 'Shared Two', columns: ['barcode', 'position'], isDefault: false },
]

vi.mock('../../lib/api/settings', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('settings', {
  exportConfigurationsApi: {
    getShared: vi.fn(),
    getPersonal: vi.fn(),
    update: vi.fn(),
    updatePersonal: vi.fn(),
  }
  })
})

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: { id: 1, name: 'Admin', email: 'admin@test.com', role: 'admin' as const },
    }),
  }
})

describe('ExportConfigurationsManager', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(exportConfigurationsApi.getShared).mockResolvedValue({
      configurations: sharedConfigs,
    })
    vi.mocked(exportConfigurationsApi.getPersonal).mockResolvedValue({
      configurations: [],
    })
    vi.mocked(exportConfigurationsApi.update).mockResolvedValue({} as never)
    vi.mocked(exportConfigurationsApi.updatePersonal).mockResolvedValue({} as never)
  })

  it('loads shared and personal configurations on mount', async () => {
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(exportConfigurationsApi.getShared).toHaveBeenCalled()
      expect(exportConfigurationsApi.getPersonal).toHaveBeenCalled()
    })
  })

  it('when admin submits edit form for shared config, calls exportConfigurationsApi.update and form closes', async () => {
    const user = userEvent.setup()
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(screen.getByText('Shared One')).toBeInTheDocument()
    })

    const editButtons = screen.getAllByRole('button', { name: 'Edit' })
    await user.click(editButtons[0])

    await waitFor(() => {
      expect(screen.getByDisplayValue('Shared One')).toBeInTheDocument()
    })

    const nameInput = screen.getByDisplayValue('Shared One')
    await user.clear(nameInput)
    await user.type(nameInput, 'Shared One Updated')

    const saveButton = screen.getByRole('button', { name: 'Save' })
    await user.click(saveButton)

    await waitFor(() => {
      expect(exportConfigurationsApi.update).toHaveBeenCalledWith(
        {
          configurations: [
            { name: 'Shared One Updated', columns: ['container_id', 'barcode'], isDefault: true },
            { name: 'Shared Two', columns: ['barcode', 'position'], isDefault: false },
          ],
        },
        null
      )
    })
    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Save' })).not.toBeInTheDocument()
    })
  })

  it('when admin adds shared config, calls exportConfigurationsApi.update with new list', async () => {
    const user = userEvent.setup()
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(screen.getByText('Shared One')).toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: '+ Add Shared Configuration' }))
    await waitFor(() => {
      expect(screen.getByPlaceholderText(/e.g., Basic Export/)).toBeInTheDocument()
    })

    await user.type(screen.getByPlaceholderText(/e.g., Basic Export/), 'New Shared Config')
    const addButton = screen.getByRole('button', { name: 'Add' })
    await user.click(addButton)

    await waitFor(() => {
      expect(exportConfigurationsApi.update).toHaveBeenCalledWith(
        expect.objectContaining({
          configurations: expect.arrayContaining([
            expect.objectContaining({ name: 'New Shared Config' }),
          ]),
        }),
        null
      )
    })
  })

  it('when admin deletes shared config, calls exportConfigurationsApi.update with updated list', async () => {
    const user = userEvent.setup()
    window.confirm = vi.fn().mockReturnValue(true)
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(screen.getByText('Shared Two')).toBeInTheDocument()
    })

    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' })
    await user.click(deleteButtons[1])

    await waitFor(() => {
      expect(exportConfigurationsApi.update).toHaveBeenCalledWith(
        {
          configurations: [
            { name: 'Shared One', columns: ['container_id', 'barcode'], isDefault: true },
          ],
        },
        null
      )
    })
  })

  it('when admin sets shared config as default, calls exportConfigurationsApi.update', async () => {
    const user = userEvent.setup()
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(screen.getByText('Shared Two')).toBeInTheDocument()
    })

    const setDefaultButtons = screen.getAllByRole('button', { name: 'Set as Default' })
    await user.click(setDefaultButtons[0])

    await waitFor(() => {
      expect(exportConfigurationsApi.update).toHaveBeenCalledWith(
        {
          configurations: [
            { name: 'Shared One', columns: ['container_id', 'barcode'], isDefault: false },
            { name: 'Shared Two', columns: ['barcode', 'position'], isDefault: true },
          ],
        },
        null
      )
    })
  })

  it('does not show Save Shared Configurations button when on shared tab as admin', async () => {
    await render(<ExportConfigurationsManager data={null} />)
    await waitFor(() => {
      expect(screen.getByText('Shared One')).toBeInTheDocument()
    })

    expect(screen.queryByRole('button', { name: 'Save Shared Configurations' })).not.toBeInTheDocument()
  })
})
