import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionAssignment from '../CollectionAssignment'

vi.mock('../../LocationPicker', () => ({
  default: ({
    value,
    onChange,
    disabled,
  }: {
    value: number | null
    onChange: (id: number | null) => void
    disabled?: boolean
  }) => (
    <div data-testid="location-picker-mock">
      <button
        type="button"
        onClick={() => onChange(1)}
        disabled={disabled}
        data-testid="location-picker-select"
      >
        Select location 1
      </button>
      <span data-testid="location-value">{value ?? 'none'}</span>
    </div>
  ),
}))

describe('CollectionAssignment', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders collection name input and location picker', () => {
    const onChange = vi.fn()

    render(
      <CollectionAssignment
        containerType="paper"
        collectionType="box"
        collectionName=""
        collectionLocationId={null}
        collectionId={undefined}
        onChange={onChange}
      />
    )

    expect(screen.getByPlaceholderText(/enter box name/i)).toBeInTheDocument()
    expect(screen.getByTestId('location-picker-mock')).toBeInTheDocument()
  })

  it('calls onChange when user types in collection name', () => {
    const onChange = vi.fn()

    render(
      <CollectionAssignment
        containerType="paper"
        collectionType="box"
        collectionName=""
        collectionLocationId={null}
        collectionId={undefined}
        onChange={onChange}
      />
    )

    const input = screen.getByPlaceholderText(/enter box name/i)
    fireEvent.change(input, { target: { value: 'My Box' } })

    expect(onChange).toHaveBeenCalledWith({ collectionName: 'My Box' })
  })

  it('shows Selected and Clear when collection already exists and collectionOptions provided', () => {
    render(
      <CollectionAssignment
        containerType="paper"
        collectionType="box"
        collectionName="Existing Box"
        collectionLocationId={1}
        collectionId={42}
        onChange={vi.fn()}
        collectionOptions={[{ id: 42, name: 'Existing Box', locationPath: null }]}
      />
    )

    expect(screen.getByText(/Selected:.*Existing Box/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('shows Collection Type select for paper container type', () => {
    render(
      <CollectionAssignment
        containerType="paper"
        collectionType="box"
        collectionName=""
        collectionLocationId={null}
        collectionId={undefined}
        onChange={vi.fn()}
      />
    )

    expect(screen.getByRole('combobox', { name: /collection type/i })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Box' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Bag' })).toBeInTheDocument()
  })
})
