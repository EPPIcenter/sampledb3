import type { RefObject } from 'react'
import { useState } from 'react'
import { useToast } from '../contexts/ToastContext'
import { useUser } from '../contexts/UserContext'
import { Button, Modal, SkeletonTable, getQueryErrorMessage } from '../ui'

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
  loading?: boolean
  readOnly?: boolean
  searchInputRef?: RefObject<HTMLInputElement | null>
}

export default function ReferenceDataTable<T extends { id: number }>({
  data,
  columns,
  onEdit,
  onDelete,
  searchPlaceholder = 'Search...',
  emptyMessage = 'No items found',
  loading = false,
  readOnly = false,
  searchInputRef,
}: ReferenceDataTableProps<T>) {
  const { canManageReferenceData } = useUser()
  const { error: showError } = useToast()
  const canEdit = !readOnly && canManageReferenceData
  const [search, setSearch] = useState('')
  /** The item whose delete the user is asked to confirm. */
  const [pendingDelete, setPendingDelete] = useState<T | null>(null)
  const [deletingId, setDeletingId] = useState<number | null>(null)

  const filteredData = data.filter((item) => {
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

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return

    setDeletingId(pendingDelete.id)
    try {
      await onDelete(pendingDelete.id)
    } catch (error) {
      // The API says what still uses the item.
      showError(getQueryErrorMessage(error, 'Failed to delete item'))
    } finally {
      setDeletingId(null)
      setPendingDelete(null)
    }
  }

  const pendingDeleteName = (pendingDelete as { name?: unknown } | null)?.name

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="px-4 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent w-64"
        />
      </div>

      {loading ? (
        <SkeletonTable rows={5} columns={columns.length + 1} />
      ) : filteredData.length === 0 ? (
        <div className="text-center py-8 text-app-text-muted">{emptyMessage}</div>
      ) : (
        <div className="bg-app-card rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-app-border">
            <thead className="bg-app-surface">
              <tr>
                {columns.map((col) => (
                  <th
                    key={String(col.key)}
                    className="px-6 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider"
                  >
                    {col.label}
                  </th>
                ))}
                {canEdit && (
                  <th className="px-6 py-3 text-right text-xs font-medium text-app-text-muted uppercase tracking-wider">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {filteredData.map((item) => (
                <tr key={item.id} className="hover:bg-app-surface">
                  {columns.map((col) => (
                    <td key={String(col.key)} className="px-6 py-4 whitespace-nowrap text-sm text-app-text">
                      {col.render ? col.render(item[col.key], item) : String(item[col.key] || '')}
                    </td>
                  ))}
                  {canEdit && (
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => onEdit(item)}
                        className="text-app-accent hover:text-app-accent-hover mr-4"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setPendingDelete(item)}
                        disabled={deletingId === item.id}
                        className="text-app-trend-down hover:opacity-90 disabled:opacity-50"
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

      {pendingDelete && (
        <Modal
          isOpen
          onClose={() => setPendingDelete(null)}
          title="Delete item"
          size="sm"
          closeDisabled={deletingId !== null}
          footer={
            <>
              <Button variant="secondary" onClick={() => setPendingDelete(null)} disabled={deletingId !== null}>
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void handleConfirmDelete()} disabled={deletingId !== null}>
                {deletingId !== null ? 'Deleting...' : 'Delete'}
              </Button>
            </>
          }
        >
          <p className="text-sm text-app-text">
            Are you sure you want to delete{' '}
            {typeof pendingDeleteName === 'string' && pendingDeleteName ? (
              <strong>{pendingDeleteName}</strong>
            ) : (
              'this item'
            )}
            ?
          </p>
          <p className="mt-2 text-sm text-app-text-muted">This action cannot be undone.</p>
        </Modal>
      )}
    </div>
  )
}

