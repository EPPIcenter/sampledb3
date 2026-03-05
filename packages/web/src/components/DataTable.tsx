import { useState, useEffect, useRef } from 'react'
import SkeletonTable from './SkeletonTable'
import Pagination from './Pagination'

export interface Column<T> {
  key: keyof T | string
  label: string
  sortable?: boolean
  render?: (value: any, row: T) => React.ReactNode
}

interface DataTableProps<T> {
  data: T[]
  columns: Column<T>[]
  onRowClick?: (row: T) => void
  loading?: boolean
  emptyMessage?: string
  initialSortColumn?: keyof T | string
  initialSortDirection?: 'asc' | 'desc'
  density?: 'normal' | 'compact'
  pagination?: {
    page: number
    pageSize: number
    onPageChange: (page: number) => void
    showPagination?: boolean
  }
  /** Optional class for the root wrapper (e.g. dashboard-card for themed pages). */
  className?: string
}

export default function DataTable<T extends { id: number }>({
  data,
  columns,
  onRowClick,
  loading = false,
  emptyMessage = 'No data available',
  initialSortColumn = null as any,
  initialSortDirection = 'asc',
  density = 'normal',
  pagination,
  className,
}: DataTableProps<T>) {
  const [sortColumn, setSortColumn] = useState<keyof T | string | null>(initialSortColumn)
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>(initialSortDirection)
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null)
  const tableRef = useRef<HTMLDivElement>(null)
  const rowRefs = useRef<Map<number, HTMLTableRowElement>>(new Map())
  const prevResetDepsRef = useRef([data.length, sortColumn, sortDirection, pagination?.page ?? 0])

  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return
    
    if (sortColumn === column.key) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column.key)
      setSortDirection('asc')
    }
  }

  const sortedData = [...data].sort((a, b) => {
    if (!sortColumn) return 0
    
    const aValue = a[sortColumn as keyof T]
    const bValue = b[sortColumn as keyof T]
    
    if (aValue === bValue) return 0
    if (aValue === null || aValue === undefined) return 1
    if (bValue === null || bValue === undefined) return -1
    
    // Handle numeric comparison for specimenCount and dates
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      const comparison = aValue < bValue ? -1 : 1
      return sortDirection === 'asc' ? comparison : -comparison
    }
    
    // Handle date strings
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      const aDate = new Date(aValue).getTime()
      const bDate = new Date(bValue).getTime()
      if (!isNaN(aDate) && !isNaN(bDate)) {
        const comparison = aDate < bDate ? -1 : 1
        return sortDirection === 'asc' ? comparison : -comparison
      }
    }
    
    // String comparison
    const aStr = String(aValue).toLowerCase()
    const bStr = String(bValue).toLowerCase()
    const comparison = aStr < bStr ? -1 : 1
    return sortDirection === 'asc' ? comparison : -comparison
  })

  // Apply pagination if enabled
  const paginatedData = pagination
    ? sortedData.slice((pagination.page - 1) * pagination.pageSize, pagination.page * pagination.pageSize)
    : sortedData
  
  const totalPages = pagination ? Math.ceil(sortedData.length / pagination.pageSize) : 1

  // Reset selected row when data changes, sort changes, or page changes (during render to avoid extra pass)
  const resetDeps = [data.length, sortColumn, sortDirection, pagination?.page ?? 0]
  if (
    prevResetDepsRef.current[0] !== resetDeps[0] ||
    prevResetDepsRef.current[1] !== resetDeps[1] ||
    prevResetDepsRef.current[2] !== resetDeps[2] ||
    prevResetDepsRef.current[3] !== resetDeps[3]
  ) {
    prevResetDepsRef.current = resetDeps
    setSelectedRowIndex(null)
  }

  // Handle keyboard navigation
  useEffect(() => {
    if (!onRowClick || paginatedData.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle if focus is within the table or no input is focused
      const activeElement = document.activeElement
      const isInputFocused = activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        (activeElement instanceof HTMLElement && activeElement.isContentEditable)
      )

      if (isInputFocused) return

      // Check if focus is within the table
      if (tableRef.current && !tableRef.current.contains(activeElement)) {
        return
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSelectedRowIndex(prev => {
          if (prev === null) return 0
          return Math.min(prev + 1, paginatedData.length - 1)
        })
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSelectedRowIndex(prev => {
          if (prev === null) return paginatedData.length - 1
          return Math.max(prev - 1, 0)
        })
      } else if (e.key === 'Enter' && selectedRowIndex !== null) {
        e.preventDefault()
        const selectedRow = paginatedData[selectedRowIndex]
        onRowClick(selectedRow)
      } else if (e.key === 'Home') {
        e.preventDefault()
        setSelectedRowIndex(0)
      } else if (e.key === 'End') {
        e.preventDefault()
        setSelectedRowIndex(paginatedData.length - 1)
      }
    }

    // Make table focusable
    if (tableRef.current) {
      tableRef.current.setAttribute('tabindex', '0')
      tableRef.current.addEventListener('keydown', handleKeyDown)
    }

    return () => {
      if (tableRef.current) {
        tableRef.current.removeEventListener('keydown', handleKeyDown)
      }
    }
  }, [paginatedData, onRowClick, selectedRowIndex])

  // Scroll selected row into view
  useEffect(() => {
    if (selectedRowIndex !== null && paginatedData[selectedRowIndex]) {
      const rowId = paginatedData[selectedRowIndex].id
      const rowElement = rowRefs.current.get(rowId)
      if (rowElement) {
        rowElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      }
    }
  }, [selectedRowIndex, paginatedData])

  if (loading) {
    return <SkeletonTable rows={5} columns={columns.length} density={density} />
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">{emptyMessage}</div>
    )
  }

  const wrapperClass = className ?? 'bg-white rounded-lg shadow overflow-hidden'

  return (
    <div ref={tableRef} className={wrapperClass} tabIndex={0}>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  onClick={() => handleSort(column)}
                  className={`${density === 'compact' ? 'px-3 py-2' : 'px-6 py-3'} text-left text-xs font-medium text-gray-500 uppercase ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  }`}
                >
                  <div className="flex items-center space-x-1">
                    <span>{column.label}</span>
                    {column.sortable && sortColumn === column.key && (
                      <svg
                        className={`h-4 w-4 ${sortDirection === 'asc' ? '' : 'transform rotate-180'}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 15l7-7 7 7"
                        />
                      </svg>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedData.map((row, index) => {
              const isSelected = selectedRowIndex === index
              return (
                <tr
                  key={row.id}
                  ref={(el) => {
                    if (el) {
                      rowRefs.current.set(row.id, el)
                    } else {
                      rowRefs.current.delete(row.id)
                    }
                  }}
                  onClick={() => onRowClick?.(row)}
                  className={onRowClick ? `cursor-pointer hover:bg-gray-50 ${isSelected ? 'bg-blue-50' : ''}` : ''}
                >
                {columns.map((column) => (
                  <td key={String(column.key)} className={`${density === 'compact' ? 'px-3 py-2 text-xs' : 'px-6 py-4 text-sm'} whitespace-nowrap text-gray-900`}>
                    {column.render
                      ? column.render(row[column.key as keyof T], row)
                      : String(row[column.key as keyof T] || '')}
                  </td>
                ))}
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {pagination && pagination.showPagination !== false && totalPages > 1 && (
        <div className="px-6 py-4 border-t border-gray-100">
          <Pagination
            currentPage={pagination.page}
            totalPages={totalPages}
            onPageChange={pagination.onPageChange}
            totalItems={sortedData.length}
            itemsPerPage={pagination.pageSize}
          />
        </div>
      )}
    </div>
  )
}
