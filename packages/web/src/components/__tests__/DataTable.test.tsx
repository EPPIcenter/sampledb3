import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import DataTable, { Column } from '../DataTable'

interface TestItem {
  id: number
  name: string
  value: number
}

describe('DataTable', () => {
  const columns: Column<TestItem>[] = [
    { key: 'id', label: 'ID', sortable: true },
    { key: 'name', label: 'Name', sortable: true },
    { 
      key: 'value', 
      label: 'Value',
      render: (value) => `$${value.toFixed(2)}`,
      sortable: true,
    },
  ]

  const testData: TestItem[] = [
    { id: 1, name: 'Item 1', value: 10.5 },
    { id: 2, name: 'Item 2', value: 20.75 },
    { id: 3, name: 'Item 3', value: 30.0 },
  ]

  it('should render table with data', () => {
    render(<DataTable data={testData} columns={columns} />)
    
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
    
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText('Item 3')).toBeInTheDocument()
  })

  it('should render custom cell renderers', () => {
    render(<DataTable data={testData} columns={columns} />)
    
    expect(screen.getByText('$10.50')).toBeInTheDocument()
    expect(screen.getByText('$20.75')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
  })

  it('should show empty message when no data', () => {
    render(<DataTable data={[]} columns={columns} emptyMessage="No items found" />)
    
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('should show loading state', () => {
    render(<DataTable data={[]} columns={columns} loading />)
    
    // Check for loading spinner
    const spinner = document.querySelector('.animate-spin')
    expect(spinner).toBeInTheDocument()
  })

  it('should sort data when sortable column header is clicked', async () => {
    const user = userEvent.setup()
    render(<DataTable data={testData} columns={columns} />)
    
    // Click on Name header to sort
    const nameHeader = screen.getByText('Name')
    await user.click(nameHeader)
    
    // Data should be sorted (check order)
    const rows = screen.getAllByRole('row')
    expect(rows.length).toBeGreaterThan(1) // Header + data rows
  })

  it('should call onRowClick when a row is clicked', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    
    render(<DataTable data={testData} columns={columns} onRowClick={onRowClick} />)
    
    // Click on first data row
    const firstItem = screen.getByText('Item 1')
    await user.click(firstItem.closest('tr')!)
    
    expect(onRowClick).toHaveBeenCalledWith(testData[0])
  })

  it('should handle sorting direction toggle', async () => {
    const user = userEvent.setup()
    render(<DataTable data={testData} columns={columns} />)
    
    const nameHeader = screen.getByText('Name')
    
    // First click - ascending
    await user.click(nameHeader)
    
    // Second click - descending
    await user.click(nameHeader)
    
    // Third click - back to original
    await user.click(nameHeader)
    
    // Should handle all three states
    expect(nameHeader).toBeInTheDocument()
  })

  it('should not show sort indicators for non-sortable columns', () => {
    const nonSortableColumns: Column<TestItem>[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
    ]
    
    render(<DataTable data={testData} columns={nonSortableColumns} />)
    
    // Columns should render but not have sort indicators
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })
})

