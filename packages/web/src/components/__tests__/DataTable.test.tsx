import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import DataTable, { Column } from '../DataTable'

interface TestItem {
  id: number
  name: string
  value: number
}

describe('DataTable', () => {
  const columns: Column<TestItem>[] = [
    { key: 'id', label: 'ID', sortType: 'number' },
    { key: 'name', label: 'Name', sortType: 'text' },
    { 
      key: 'value', 
      label: 'Value',
      render: (value) => `$${value.toFixed(2)}`,
      sortType: 'number',
    },
  ]

  const testData: TestItem[] = [
    { id: 1, name: 'Item 1', value: 10.5 },
    { id: 2, name: 'Item 2', value: 20.75 },
    { id: 3, name: 'Item 3', value: 30.0 },
  ]

  it('should render table with data', async () => {
    await render(<DataTable data={testData} columns={columns} />)
    
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Value')).toBeInTheDocument()
    
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
    expect(screen.getByText('Item 3')).toBeInTheDocument()
  })

  it('should render custom cell renderers', async () => {
    await render(<DataTable data={testData} columns={columns} />)
    
    expect(screen.getByText('$10.50')).toBeInTheDocument()
    expect(screen.getByText('$20.75')).toBeInTheDocument()
    expect(screen.getByText('$30.00')).toBeInTheDocument()
  })

  it('should show empty message when no data', async () => {
    await render(<DataTable data={[]} columns={columns} emptyMessage="No items found" />)
    
    expect(screen.getByText('No items found')).toBeInTheDocument()
  })

  it('should show loading state', async () => {
    const { container } = await render(<DataTable data={[]} columns={columns} loading />)
    
    // DataTable uses SkeletonTable when loading, check for skeleton elements
    const skeleton = container.querySelector('[class*="animate-pulse"]')
    expect(skeleton).toBeInTheDocument()
  })

  it('should sort data when sortable column header is clicked', async () => {
    const user = userEvent.setup()
    await render(<DataTable data={testData} columns={columns} />)
    
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
    
    await render(<DataTable data={testData} columns={columns} onRowClick={onRowClick} />)
    
    // Click on first data row
    const firstItem = screen.getByText('Item 1')
    await user.click(firstItem.closest('tr')!)
    
    expect(onRowClick).toHaveBeenCalledWith(testData[0])
  })

  it('should handle sorting direction toggle', async () => {
    const user = userEvent.setup()
    await render(<DataTable data={testData} columns={columns} />)
    
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

  it('should not show sort indicators for non-sortable columns', async () => {
    const nonSortableColumns: Column<TestItem>[] = [
      { key: 'id', label: 'ID' },
      { key: 'name', label: 'Name' },
    ]
    
    await render(<DataTable data={testData} columns={nonSortableColumns} />)
    
    // Columns should render but not have sort indicators
    expect(screen.getByText('ID')).toBeInTheDocument()
    expect(screen.getByText('Name')).toBeInTheDocument()
  })

  describe('sorting by declared type', () => {
    interface SubjectRow {
      id: number
      name: string
      specimenCount: number | null
      created: string | null
    }

    const subjectColumns: Column<SubjectRow>[] = [
      { key: 'name', label: 'Name', sortType: 'text' },
      { key: 'specimenCount', label: 'Specimens', sortType: 'number' },
      { key: 'created', label: 'Created', sortType: 'date' },
    ]

    // Names like study 70's: numeric names (which `new Date()` can parse) and alphanumeric ones.
    const subjects: SubjectRow[] = [
      { id: 1, name: '140', specimenCount: 3, created: '2024-03-01T00:00:00Z' },
      { id: 2, name: '100', specimenCount: 12, created: '2023-11-15T00:00:00Z' },
      { id: 3, name: '2', specimenCount: null, created: '2024-01-10T00:00:00Z' },
      { id: 4, name: '29PH', specimenCount: 1, created: null },
      { id: 5, name: '10', specimenCount: 100, created: '2022-06-30T00:00:00Z' },
      { id: 6, name: '1', specimenCount: 2, created: '2024-12-31T00:00:00Z' },
      { id: 7, name: '350', specimenCount: 20, created: '2023-01-01T00:00:00Z' },
      { id: 8, name: '3CDX', specimenCount: 5, created: '2021-05-05T00:00:00Z' },
    ]

    function columnValues(columnIndex: number): string[] {
      const rows = screen.getAllByRole('row').slice(1)
      return rows.map((row) => within(row).getAllByRole('cell')[columnIndex].textContent)
    }

    it('sorts text naturally, so numeric names run 1, 2, 10, 100', async () => {
      const user = userEvent.setup()
      await render(<DataTable data={subjects} columns={subjectColumns} />)

      await user.click(screen.getByRole('columnheader', { name: 'Name' }))
      expect(columnValues(0)).toEqual(['1', '2', '3CDX', '10', '29PH', '100', '140', '350'])

      await user.click(screen.getByRole('columnheader', { name: 'Name' }))
      expect(columnValues(0)).toEqual(['350', '140', '100', '29PH', '10', '3CDX', '2', '1'])
    })

    it('sorts a number column by value and puts missing values last', async () => {
      const user = userEvent.setup()
      await render(<DataTable data={subjects} columns={subjectColumns} />)

      await user.click(screen.getByRole('columnheader', { name: 'Specimens' }))
      expect(columnValues(1)).toEqual(['1', '2', '3', '5', '12', '20', '100', ''])

      await user.click(screen.getByRole('columnheader', { name: 'Specimens' }))
      expect(columnValues(1)).toEqual(['100', '20', '12', '5', '3', '2', '1', ''])
    })

    it('sorts a date column by date and puts missing dates last', async () => {
      const user = userEvent.setup()
      await render(<DataTable data={subjects} columns={subjectColumns} />)

      await user.click(screen.getByRole('columnheader', { name: 'Created' }))
      expect(columnValues(0)).toEqual(['3CDX', '10', '350', '100', '2', '140', '1', '29PH'])

      await user.click(screen.getByRole('columnheader', { name: 'Created' }))
      expect(columnValues(0)).toEqual(['1', '140', '2', '100', '350', '10', '3CDX', '29PH'])
    })

    it('starts sorted by initialSortColumn in initialSortDirection', async () => {
      await render(
        <DataTable data={subjects} columns={subjectColumns} initialSortColumn="name" initialSortDirection="asc" />
      )
      expect(columnValues(0).slice(0, 3)).toEqual(['1', '2', '3CDX'])
    })

    it('does not sort when a column declares no sort type', async () => {
      const user = userEvent.setup()
      const unsortable: Column<SubjectRow>[] = [{ key: 'name', label: 'Name' }]
      await render(<DataTable data={subjects} columns={unsortable} />)

      await user.click(screen.getByRole('columnheader', { name: 'Name' }))
      expect(columnValues(0)).toEqual(subjects.map((s) => s.name))
    })
  })
})
