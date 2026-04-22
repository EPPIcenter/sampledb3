import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceDataTable from '../ReferenceDataTable'

// Mock the UserContext
const mockUser = {
  id: 1,
  email: 'admin@example.com',
  name: 'Admin User',
  username: 'admin',
  role: 'admin' as const,
}

vi.mock('../../contexts/UserContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/UserContext')>('../../contexts/UserContext')
  return {
    ...actual,
    useUser: () => ({
      user: mockUser,
      setUser: vi.fn(),
      refreshUser: vi.fn(),
      loading: false,
      error: null,
      canManageReferenceData: true,
    }),
  }
})

interface TestItem {
  id: number
  name: string
  value: number
}

describe('ReferenceDataTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const columns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'value' as const, label: 'Value' },
  ]

  const testData: TestItem[] = [
    { id: 1, name: 'Item 1', value: 10 },
    { id: 2, name: 'Item 2', value: 20 },
    { id: 3, name: 'Item 3', value: 30 },
  ]

  it('should render table with data', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText('Item 3')).toBeInTheDocument()
  })

  it('should call onEdit when edit button is clicked', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    const editButtons = screen.getAllByText('Edit')
    await user.click(editButtons[0])

    expect(onEdit).toHaveBeenCalledWith(testData[0])
  })

  it('should call onDelete when delete button is clicked and confirmed', async () => {
    const user = userEvent.setup()
    const onEdit = vi.fn()
    const onDelete = vi.fn().mockResolvedValue(undefined)

    // Mock window.confirm
    window.confirm = vi.fn(() => true)

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    const deleteButtons = screen.getAllByText('Delete')
    await user.click(deleteButtons[0])

    await waitFor(() => {
      expect(onDelete).toHaveBeenCalledWith(testData[0].id)
    })
  })

  it('should filter data when search is provided', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        search="Item 1"
      />
    )

    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.queryByText('Item 2')).not.toBeInTheDocument()
    expect(screen.queryByText('Item 3')).not.toBeInTheDocument()
  })

  it('should show empty message when no data', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={[]}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        emptyMessage="No items found"
      />
    )

    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('should show loading state', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    const { container } = await render(
      <ReferenceDataTable
        data={[]}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        loading
      />
    )

    // ReferenceDataTable uses SkeletonTable when loading, check for skeleton elements
    const skeleton = container.querySelector('[class*="animate-pulse"]')
    expect(skeleton).toBeInTheDocument()
  })

  it('should use custom render function for columns', async () => {
    const columnsWithRender = [
      { key: 'name' as const, label: 'Name' },
      {
        key: 'value' as const,
        label: 'Value',
        render: (value: number) => `$${value}`,
      },
    ]

    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columnsWithRender}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    )

    expect(screen.getByText('$10')).toBeInTheDocument()
    expect(screen.getByText('$20')).toBeInTheDocument()
  })

  it('should disable client filter when disableClientFilter is true', async () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    await render(
      <ReferenceDataTable
        data={testData}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        search="Item 1"
        disableClientFilter
      />
    )

    // All items should be visible when client filter is disabled
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText('Item 3')).toBeInTheDocument()
  })
})



