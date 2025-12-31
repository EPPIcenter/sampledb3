import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import ReferenceDataTable from '../ReferenceDataTable'

interface TestItem {
  id: number
  name: string
  value: number
}

describe('ReferenceDataTable', () => {
  const columns = [
    { key: 'name' as const, label: 'Name' },
    { key: 'value' as const, label: 'Value' },
  ]

  const testData: TestItem[] = [
    { id: 1, name: 'Item 1', value: 10 },
    { id: 2, name: 'Item 2', value: 20 },
    { id: 3, name: 'Item 3', value: 30 },
  ]

  it('should render table with data', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
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

    render(
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

    render(
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

  it('should filter data when search is provided', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
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

  it('should show empty message when no data', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
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

  it('should show loading state', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
      <ReferenceDataTable
        data={[]}
        columns={columns}
        onEdit={onEdit}
        onDelete={onDelete}
        loading
      />
    )

    // Check for loading indicator
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('should use custom render function for columns', () => {
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

    render(
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

  it('should disable client filter when disableClientFilter is true', () => {
    const onEdit = vi.fn()
    const onDelete = vi.fn()

    render(
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



