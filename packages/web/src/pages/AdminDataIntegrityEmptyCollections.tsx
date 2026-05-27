import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../lib/api/admin'
import type { EmptyCollectionItem, EmptyCollectionsDeleteIds } from '../lib/api/admin'
import { adminKeys, useAdminIntegrityReport } from '../hooks/useAdmin'
import { Modal, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/admin.css'

const COLLECTION_TYPES: EmptyCollectionItem['type'][] = ['micronix_plate', 'cryovial_box', 'box', 'bag']

type SelectionKey = `${EmptyCollectionItem['type']}:${number}`

function selectionKey(c: EmptyCollectionItem): SelectionKey {
  return `${c.type}:${c.id}`
}

function typeLabel(type: EmptyCollectionItem['type']): string {
  switch (type) {
    case 'micronix_plate':
      return 'Micronix plate'
    case 'cryovial_box':
      return 'Cryovial box'
    case 'box':
      return 'Box'
    case 'bag':
      return 'Bag'
    default:
      return type
  }
}

function getCollectionDetailUrl(type: EmptyCollectionItem['type'], id: number): string {
  switch (type) {
    case 'micronix_plate':
      return `/collections/micronix-plates/${id}`
    case 'cryovial_box':
      return `/collections/cryovial-boxes/${id}`
    case 'box':
      return `/collections/boxes/${id}`
    case 'bag':
      return `/collections/bags/${id}`
    default:
      return '#'
  }
}

export default function AdminDataIntegrityEmptyCollections() {
  const queryClient = useQueryClient()
  const reportQuery = useAdminIntegrityReport()
  const reportStatus = fromQuery(reportQuery)
  const collections = reportQuery.data?.emptyCollections ?? []
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<SelectionKey>>(new Set())
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [deleteLoading, setDeleteLoading] = useState(false)
  const [deleteResult, setDeleteResult] = useState<{ deleted: number; errors?: string[] } | null>(null)

  const refreshReport = () => {
    setSelected(new Set())
    void queryClient.invalidateQueries({ queryKey: adminKeys.integrityReport() })
  }

  const toggleOne = (key: SelectionKey) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const toggleAll = () => {
    if (selected.size === collections.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(collections.map(selectionKey)))
    }
  }

  const toggleAllInGroup = (groupItems: EmptyCollectionItem[]) => {
    const keys = new Set(groupItems.map(selectionKey))
    const allSelected = groupItems.every((c) => selected.has(selectionKey(c)))
    setSelected((prev) => {
      const next = new Set(prev)
      if (allSelected) {
        keys.forEach((k) => next.delete(k))
      } else {
        keys.forEach((k) => next.add(k))
      }
      return next
    })
  }

  const selectedItems = collections.filter((c) => selected.has(selectionKey(c)))

  const collectionsByType = useMemo(() => {
    const map = new Map<EmptyCollectionItem['type'], EmptyCollectionItem[]>()
    for (const t of COLLECTION_TYPES) {
      map.set(t, collections.filter((c) => c.type === t))
    }
    return map
  }, [collections])

  const typePlural: Record<EmptyCollectionItem['type'], string> = useMemo(
    () => ({
      micronix_plate: 'micronix plates',
      cryovial_box: 'cryovial boxes',
      box: 'boxes',
      bag: 'bags',
    }),
    []
  )

  const summaryParts = useMemo(() => {
    return COLLECTION_TYPES.map((t) => {
      const n = collectionsByType.get(t)?.length ?? 0
      if (n === 0) return null
      return n === 1 ? `1 ${typeLabel(t)}` : `${n} ${typePlural[t]}`
    }).filter(Boolean) as string[]
  }, [collectionsByType, typePlural])

  const buildIds = (): EmptyCollectionsDeleteIds => {
    const ids: EmptyCollectionsDeleteIds = {}
    for (const c of selectedItems) {
      const arr = ids[c.type] ?? (ids[c.type] = [])
      arr.push(c.id)
    }
    return ids
  }

  const handleDeleteConfirm = async () => {
    if (selectedItems.length === 0) return
    try {
      setDeleteLoading(true)
      setDeleteResult(null)
      const response = await adminApi.deleteEmptyCollections(buildIds())
      setDeleteResult({
        deleted: response.deleted,
        errors: response.errors,
      })
      refreshReport()
      if (!response.errors?.length) {
        setShowDeleteModal(false)
      }
    } catch (err: unknown) {
      const message =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setMutationError(message || 'Failed to delete empty collections')
    } finally {
      setDeleteLoading(false)
    }
  }

  const handleCloseDeleteModal = () => {
    setShowDeleteModal(false)
    setDeleteResult(null)
  }

  if (reportStatus === 'error') {
    return (
      <PageError
        title="Could not load empty collections"
        message={getQueryErrorMessage(reportQuery.error, 'Failed to load empty collections')}
        onRetry={() => void reportQuery.refetch()}
      />
    )
  }

  return (
    <>
      <section className="admin-card p-4 mb-6">
        <h2 className="text-xl font-semibold mb-2" style={{ color: 'rgb(var(--app-text))' }}>
          Empty collections
        </h2>
        <p className="text-sm text-[rgb(var(--app-text-muted))] mb-4">
          Collections (plates, boxes, bags) with no items. You may delete them to keep the database tidy.
        </p>

        {mutationError && (
          <div className="mb-4 rounded-lg bg-app-trend-down/10 border border-app-trend-down p-3">
            <p className="text-sm text-app-trend-down">{mutationError}</p>
          </div>
        )}

        {reportQuery.isPending ? (
          <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">Loading…</div>
        ) : collections.length === 0 ? (
          <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">No empty collections found.</div>
        ) : (
          <>
            {summaryParts.length > 0 && (
              <p className="text-sm text-[rgb(var(--app-text-muted))] mb-4">
                {summaryParts.join(', ')}
              </p>
            )}
            <div className="flex items-center gap-4 mb-4">
              <button
                type="button"
                onClick={toggleAll}
                className="admin-btn-secondary px-3 py-1.5 text-sm"
              >
                {selected.size === collections.length ? 'Deselect all' : 'Select all'}
              </button>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                disabled={selectedItems.length === 0}
                className="admin-btn-primary px-3 py-1.5 text-sm disabled:opacity-50"
              >
                Delete selected ({selectedItems.length})
              </button>
            </div>
            {COLLECTION_TYPES.map((type) => {
              const items = collectionsByType.get(type) ?? []
              if (items.length === 0) return null
              return (
                <div key={type} className="mb-6 last:mb-0">
                  <h3 className="text-sm font-semibold text-[rgb(var(--app-text))] mb-2">
                    {typePlural[type]} ({items.length})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="admin-table min-w-full">
                      <thead>
                        <tr>
                          <th className="px-4 py-3 text-left w-10">
                            <input
                              type="checkbox"
                              checked={items.length > 0 && items.every((c) => selected.has(selectionKey(c)))}
                              onChange={() => toggleAllInGroup(items)}
                              aria-label={`Select all ${typePlural[type]}`}
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                            Type
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                            Name
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                            Location
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-app-card divide-y divide-app-border">
                        {items.map((c) => {
                          const key = selectionKey(c)
                          return (
                            <tr key={key} className="hover:bg-app-surface">
                              <td className="px-4 py-3">
                                <input
                                  type="checkbox"
                                  checked={selected.has(key)}
                                  onChange={() => toggleOne(key)}
                                  aria-label={`Select ${c.name}`}
                                />
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm dashboard-stat-value">
                                {typeLabel(c.type)}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                <Link
                                  to={getCollectionDetailUrl(c.type, c.id)}
                                  className="text-[rgb(var(--app-accent))] hover:underline"
                                >
                                  {c.name}
                                </Link>
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {c.locationId != null ? (
                                  <Link
                                    to={`/locations/${c.locationId}`}
                                    className="text-[rgb(var(--app-accent))] hover:underline"
                                  >
                                    {c.locationPath ?? `Location #${c.locationId}`}
                                  </Link>
                                ) : (
                                  <span className="dashboard-stat-value">—</span>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </>
        )}
      </section>

      <Modal
        isOpen={showDeleteModal}
        onClose={handleCloseDeleteModal}
        layout="centered"
        showCloseButton={false}
        backdropClassName="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay"
        panelClassName="admin-card max-w-md w-full border border-[rgb(var(--app-border))]"
        contentClassName="p-0"
      >
              <div className="px-6 py-4 border-b border-[rgb(var(--app-border))]">
                <h2 className="text-xl font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
                  Delete empty collections
                </h2>
              </div>
              <div className="px-6 py-4">
                {deleteResult === null ? (
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">
                    Delete {selectedItems.length} selected empty collection{selectedItems.length !== 1 ? 's' : ''}? This
                    cannot be undone.
                  </p>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-[rgb(var(--app-text))]">
                      Deleted <strong>{deleteResult.deleted}</strong> collection{deleteResult.deleted !== 1 ? 's' : ''}.
                    </p>
                    {deleteResult.errors && deleteResult.errors.length > 0 && (
                      <div className="rounded border border-amber-200 bg-amber-50 p-2">
                        <p className="text-xs font-medium text-amber-800 mb-1">Some could not be deleted:</p>
                        <ul className="text-xs text-amber-800 list-disc list-inside">
                          {deleteResult.errors.map((e, i) => (
                            <li key={i}>{e}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
              <div className="px-6 py-4 border-t border-[rgb(var(--app-border))] flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseDeleteModal}
                  disabled={deleteLoading}
                  className="admin-btn-secondary px-4 py-2 disabled:opacity-50"
                >
                  {deleteResult !== null ? 'Close' : 'Cancel'}
                </button>
                {deleteResult === null && (
                  <button
                    type="button"
                    onClick={handleDeleteConfirm}
                    disabled={deleteLoading}
                    className="px-4 py-2 bg-app-trend-down text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
                  >
                    {deleteLoading ? 'Deleting…' : 'Delete'}
                  </button>
                )}
              </div>
      </Modal>
    </>
  )
}
