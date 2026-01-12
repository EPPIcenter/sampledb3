import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceDataForm from '../ReferenceDataForm'

interface TestItem {
  id?: number
  name: string
  description?: string
  value?: number
}

describe('ReferenceDataForm', () => {
  const fields = [
    { key: 'name' as const, label: 'Name', required: true },
    { key: 'description' as const, label: 'Description', type: 'textarea' as const },
    { key: 'value' as const, label: 'Value', type: 'number' as const },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('should render form with fields', () => {
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fields as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    expect(screen.getByText('Add New Item')).toBeInTheDocument()
    expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Description/)).toBeInTheDocument()
    expect(screen.getByLabelText(/^Value/)).toBeInTheDocument()
  })

  it('should populate form when editing existing item', () => {
    const item: TestItem = {
      id: 1,
      name: 'Existing Item',
      description: 'Existing description',
      value: 100,
    }

    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={item}
        fields={fields as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Edit Item"
      />
    )

    expect(screen.getByDisplayValue('Existing Item')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Existing description')).toBeInTheDocument()
    expect(screen.getByDisplayValue('100')).toBeInTheDocument()
  })

  it('should call onSave when form is submitted', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fields as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    // Wait for form to be ready
    await waitFor(() => {
      expect(screen.getByLabelText(/^Name/)).toBeInTheDocument()
    })

    const nameInput = screen.getByLabelText(/^Name/) as HTMLInputElement
    const descriptionInput = screen.getByLabelText(/^Description/) as HTMLTextAreaElement
    const valueInput = screen.getByLabelText(/^Value/) as HTMLInputElement

    // Fill in the form fields
    await user.click(nameInput)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    await user.type(nameInput, 'New Item')
    
    await user.click(descriptionInput)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    await user.type(descriptionInput, 'New description')
    
    await user.click(valueInput)
    await user.keyboard('{Control>}a{/Control}{Delete}')
    await user.type(valueInput, '50')

    // Wait for form state to update
    await waitFor(() => {
      expect(nameInput.value).toBe('New Item')
      expect(descriptionInput.value).toBe('New description')
      expect(valueInput.value).toBe('50')
    })

    const saveButton = screen.getByText('Create')
    expect(saveButton).not.toBeDisabled()
    
    await user.click(saveButton)

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1)
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'New Item',
          description: 'New description',
          value: 50,
        })
      )
    }, { timeout: 3000 })
  })

  it('should call onCancel when cancel button is clicked', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fields as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    const cancelButton = screen.getByText('Cancel')
    await user.click(cancelButton)

    expect(onCancel).toHaveBeenCalled()
  })

  it('should load async options for fields with loadOptions', async () => {
    const fieldsWithOptions = [
      { key: 'name' as const, label: 'Name', required: true },
      {
        key: 'type' as const,
        label: 'Type',
        loadOptions: async () => [
          { value: 'type1', label: 'Type 1' },
          { value: 'type2', label: 'Type 2' },
        ],
      },
    ]

    const onSave = vi.fn().mockResolvedValue(undefined)
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fieldsWithOptions as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    await waitFor(() => {
      expect(screen.getByText('Type 1')).toBeInTheDocument()
      expect(screen.getByText('Type 2')).toBeInTheDocument()
    })
  })

  it('should show error message when save fails', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn().mockRejectedValue(new Error('Save failed'))
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fields as any}
        onSave={onSave}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    const nameInput = screen.getByLabelText(/^Name/)
    await user.clear(nameInput)
    await user.type(nameInput, 'Test')
    const saveButton = screen.getByText('Create')
    await user.click(saveButton)

    await waitFor(() => {
      expect(screen.getByText('Save failed')).toBeInTheDocument()
    })
  })

  it('should show loading state during save', async () => {
    const user = userEvent.setup()
    const onSave = vi.fn(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    )
    const onCancel = vi.fn()

    render(
      <ReferenceDataForm
        item={null}
        fields={fields as any}
        onSave={onSave as any}
        onCancel={onCancel}
        title="Add New Item"
      />
    )

    await user.type(screen.getByLabelText(/^Name/), 'Test')
    const saveButton = screen.getByText('Create')
    await user.click(saveButton)

    // Button should be disabled during save
    await waitFor(() => {
      expect(saveButton).toBeDisabled()
    })
  })
})



