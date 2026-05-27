import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import CollectionSelectOrCreate from '../CollectionSelectOrCreate'

const DEFAULT_COLLECTIONS = [
  { id: 1, name: 'Alpha Box', locationPath: 'Freezer A / Shelf 1' },
  { id: 2, name: 'Alpha Bag', locationPath: 'Freezer A / Shelf 2' },
  { id: 3, name: 'Beta Box', locationPath: 'Freezer B' },
  { id: 4, name: 'Alphabet Soup', locationPath: null },
  ...Array.from({ length: 30 }, (_, i) => ({
    id: 100 + i,
    name: `Collection ${i}`,
    locationPath: `Location ${i}`,
  })),
]

vi.mock('../LocationPicker', () => ({
  default: ({
    value,
    onChange,
  }: {
    value: number | null
    onChange: (id: number | null) => void
  }) => (
    <div data-testid="location-picker-mock">
      <button type="button" onClick={() => onChange(10)} data-testid="location-picker-select-10">
        Select location 10
      </button>
      <span data-testid="location-value">{value ?? 'none'}</span>
    </div>
  ),
}))

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
  collectionsApi: {
    createBox: vi.fn(),
    createBag: vi.fn(),
    createMicronixPlate: vi.fn(),
    createCryovialBox: vi.fn(),
  },
})
})

import { collectionsApi } from '../../lib/api'

describe('CollectionSelectOrCreate', () => {
  const defaultProps = {
    collectionType: 'box' as const,
    collections: DEFAULT_COLLECTIONS,
    value: null,
    onChange: vi.fn(),
    allowCreate: false,
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders input and no Create new button when allowCreate is false', () => {
    render(<CollectionSelectOrCreate {...defaultProps} />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /create new collection/i })).not.toBeInTheDocument()
  })

  it('renders input and Create new collection button when allowCreate is true', () => {
    render(<CollectionSelectOrCreate {...defaultProps} allowCreate />)
    expect(screen.getByRole('combobox')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /create new collection/i })).toBeInTheDocument()
  })

  it('shows matching collections in dropdown when typing with controlled value', async () => {
    const user = userEvent.setup()
    let value: { id?: number; name: string; locationPath?: string | null } | null = null
    const onChange = vi.fn((v: typeof value) => {
      value = v
    })
    const { rerender } = render(
      <CollectionSelectOrCreate
        {...defaultProps}
        value={value}
        onChange={onChange}
      />
    )
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.type(input, 'alpha')
    rerender(
      <CollectionSelectOrCreate
        {...defaultProps}
        value={value}
        onChange={onChange}
      />
    )
    const listbox = screen.getByRole('listbox')
    const options = listbox.querySelectorAll('[role="option"]')
    expect(options.length).toBeGreaterThan(0)
    expect(listbox).toHaveTextContent('Alpha Box')
  })

  it('filters options: exact match first, then stem, then rest; max 25', async () => {
    const user = userEvent.setup()
    render(<CollectionSelectOrCreate {...defaultProps} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.type(input, 'alpha')
    const listbox = screen.getByRole('listbox')
    const options = listbox.querySelectorAll('[role="option"]')
    expect(options.length).toBeLessThanOrEqual(25)
    const names = Array.from(options).map((el) => el.textContent)
    const stemMatches = ['Alpha Box', 'Alpha Bag', 'Alphabet Soup']
    expect(stemMatches.some((stem) => names[0]?.includes(stem))).toBe(true)
    const exactOrStem = names.filter(
      (n) => n && (n.toLowerCase() === 'alpha' || n.toLowerCase().startsWith('alpha') || stemMatches.some((s) => n.includes(s)))
    )
    expect(exactOrStem.length).toBeGreaterThan(0)
  })

  it('shows name and location path in each option', async () => {
    const user = userEvent.setup()
    render(<CollectionSelectOrCreate {...defaultProps} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.type(input, 'Alpha Box')
    const listbox = screen.getByRole('listbox')
    expect(listbox).toHaveTextContent('Alpha Box')
    expect(listbox).toHaveTextContent('Freezer A / Shelf 1')
  })

  it('calls onChange with id, name, locationPath when option selected', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<CollectionSelectOrCreate {...defaultProps} onChange={onChange} />)
    const input = screen.getByRole('combobox')
    await user.click(input)
    await user.type(input, 'Alpha Box')
    const option = screen.getByRole('option', { name: /Alpha Box/i })
    await user.click(option)
    expect(onChange).toHaveBeenCalledWith({
      id: 1,
      name: 'Alpha Box',
      locationPath: 'Freezer A / Shelf 1',
    })
  })

  it('shows Selected name at path and Clear when value is set', () => {
    render(
      <CollectionSelectOrCreate
        {...defaultProps}
        value={{ id: 1, name: 'Alpha Box', locationPath: 'Freezer A / Shelf 1' }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/Selected:.*Alpha Box.*Freezer A \/ Shelf 1/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /clear/i })).toBeInTheDocument()
  })

  it('shows Selected name only when locationPath is null', () => {
    render(
      <CollectionSelectOrCreate
        {...defaultProps}
        value={{ id: 4, name: 'Alphabet Soup', locationPath: null }}
        onChange={vi.fn()}
      />
    )
    expect(screen.getByText(/Selected:.*Alphabet Soup/i)).toBeInTheDocument()
  })

  it('Clear resets selection and calls onChange(null)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <CollectionSelectOrCreate
        {...defaultProps}
        value={{ id: 1, name: 'Alpha Box', locationPath: 'Freezer A / Shelf 1' }}
        onChange={onChange}
      />
    )
    await user.click(screen.getByRole('button', { name: /clear/i }))
    expect(onChange).toHaveBeenCalledWith(null)
  })

  it('Create new opens modal with name pre-filled and LocationPicker', async () => {
    const user = userEvent.setup()
    render(<CollectionSelectOrCreate {...defaultProps} allowCreate />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'New Box Name')
    await user.click(screen.getByRole('button', { name: /create new collection/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    const nameInput = screen.getByLabelText(/name/i)
    expect(nameInput).toHaveValue('New Box Name')
    expect(screen.getByTestId('location-picker-mock')).toBeInTheDocument()
  })

  it('Create new: selecting location and submitting creates via API and calls onChange', async () => {
    const user = userEvent.setup()
    const createBox = vi.mocked(collectionsApi.createBox)
    createBox.mockResolvedValue({
      data: {
        box: {
          id: 99,
          name: 'New Box Name',
          locationId: 10,
          locationPath: 'Freezer A',
        },
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config: {} as import('axios').InternalAxiosRequestConfig,
    } as Awaited<ReturnType<typeof collectionsApi.createBox>>)
    const onChange = vi.fn()
    render(<CollectionSelectOrCreate {...defaultProps} allowCreate onChange={onChange} />)
    const input = screen.getByRole('combobox')
    await user.type(input, 'New Box Name')
    await user.click(screen.getByRole('button', { name: /create new collection/i }))
    await user.click(screen.getByTestId('location-picker-select-10'))
    const createButton = screen.getByRole('button', { name: /^Create$/i })
    await user.click(createButton)
    expect(createBox).toHaveBeenCalledWith({ name: 'New Box Name', locationId: 10 })
    expect(onChange).toHaveBeenCalledWith({
      id: 99,
      name: 'New Box Name',
      locationPath: 'Freezer A',
    })
  })
})
