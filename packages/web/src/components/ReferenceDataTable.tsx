import { useState } from 'react'
import { useUser } from '../contexts/UserContext'
import SkeletonTable from './SkeletonTable'

export interface Column<T> {
  key: keyof T
  label: string
  render?: (value: any, item: T) => React.ReactNode
}

interface ReferenceDataTableProps<T extends { id: number }> {
  data: T[]
  columns: Column<T>[]
  onEdit: (item: T) => void
  onDelete: (id: number) => Promise<void>
  searchPlaceholder?: string
  emptyMessage?: string
  search?: string
  onSearchChange?: (search: string) => void
  disableClientFilter?: boolean
  loading?: boolean
  readOnly?: boolean
}

export default function ReferenceDataTable<T extends { id: number }>({
  data,
  columns,
  onEdit,
  onDelete,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  search: externalSearch,
  onSearchChange,
  disableClientFilter = false,
  loading = false,
  readOnly = false,
}: ReferenceDataTableProps<T>) {
  const { canManageReferenceData } = useUser()
  const canEdit = !readOnly && canManageReferenceData
  const [internalSearch, setInternalSearch] = useState('')
  const [deletingId, setDeletingId] = useState<number | null>(null)

  // Use external search if provided, otherwise use internal state
  const search = externalSearch !== undefined ? externalSearch : internalSearch
  const setSearch = onSearchChange || setInternalSearch

  const filteredData = disableClientFilter
    ? data // No client-side filtering when backend handles it
    : data.filter((item) => {
      if (!search.trim()) return true

      // Split search into words (handle multiple spaces)
      const searchWords = search.trim().split(/\s+/).filter(word => word.length > 0)
      if (searchWords.length === 0) return true

      // For each word, check if it matches any column
      // ALL words must match (AND logic)
      return searchWords.every(word => {
        const wordLower = word.toLowerCase()
        return columns.some((col) => {
          const value = item[col.key]
          // Use rendered value if render function exists, otherwise use raw value
          const displayValue = col.render
            ? String(col.render(value, item))
            : String(value || '')
          return displayValue.toLowerCase().includes(wordLower)
        })
      })
    })

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this item?')) {
      return
    }

    setDeletingId(id)
    try {
      await onDelete(id)
    } catch (error) {
      console.error('Failed to delete:', error)
      alert('Failed to delete item. It may be in use.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="px-4 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-64"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={5} columns={columns.length + 1} />
      ) : filteredData.length === 0 ? (
        <div className="text-center py-8 text-gray-500">{emptyMessage}</div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    {col.label}
                  </th>
                ))}
                {canEdit && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {col.render ? col.render(item[col.key], item) : String(item[col.key] || '')}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-blue-600 hover:text-blue-900 mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={deletingId === item.id}
                        className="text-red-600 hover:text-red-900 disabled:opacity-50"
                      >
                        {deletingId === item.id ? 'Deleting...' : 'Delete'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

