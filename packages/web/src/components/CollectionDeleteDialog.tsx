import { useState, useCallback } from 'react'
import axios from 'axios'
import type { CollectionDeletePreflight } from '@sampledb/contract'
import { collectionsApi } from '../lib/api/collections'

type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
type CollectionDeleteBlocker = CollectionDeletePreflight['blockers'][number]

type Props = {
  isOpen: boolean
  onClose: () => void
  collectionType: CollectionType
  id: number
  /** Verbatim name the user must type to confirm. */
  collectionName: string
  /** e.g. "Micronix plate" for the prompt (human-readable, title case) */
  kindLabel: string
  onDeleted: () => void
}

export default function CollectionDeleteDialog({
  isOpen,
  onClose,
  collectionType,
  id,
  collectionName,
  kindLabel,
  onDeleted,
}: Props) {
  const [confirmText, setConfirmText] = useState('')
  const [removeEmptySubjects, setRemoveEmptySubjects] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [errorSummary, setErrorSummary] = useState<string | null>(null)
  const [blockers, setBlockers] = useState<CollectionDeleteBlocker[]>([])

  const reset = useCallback(() => {
    setConfirmText('')
    setRemoveEmptySubjects(false)
    setErrorSummary(null)
    setBlockers([])
    setDeleting(false)
  }, [])

  const handleClose = useCallback(() => {
    if (!deleting) {
      reset()
      onClose()
    }
  }, [deleting, onClose, reset])

  const nameMatches = confirmText.trim() === collectionName

  if (!isOpen) return null

  const doDelete = async () => {
    if (!nameMatches) return
    setDeleting(true)
    setErrorSummary(null)
    setBlockers([])
    try {
      await collectionsApi.deleteWithContents({
        collectionType,
        id,
        removeEmptySubjects,
      })
      reset()
      onClose()
      onDeleted()
    } catch (e: unknown) {
      if (axios.isAxiosError(e) && e.response?.status === 409) {
        const d = e.response.data as { error?: string; blockers?: CollectionDeleteBlocker[] }
        setErrorSummary(d.error ?? 'This collection could not be deleted.')
        setBlockers(Array.isArray(d.blockers) ? d.blockers : [])
        setDeleting(false)
        return
      }
      setErrorSummary(axios.isAxiosError(e) && e.message ? e.message : 'Request failed')
      setDeleting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="collection-delete-title"
    >
      <div
        className="bg-app-card border border-app-border rounded-lg max-w-lg w-full max-h-[90vh] overflow-y-auto p-5 shadow-lg"
        onClick={(ev) => ev.stopPropagation()}
      >
        <h2 id="collection-delete-title" className="text-lg font-semibold text-app-trend-down">
          Delete {kindLabel}?
        </h2>
        <p className="mt-2 text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
          This removes the collection, every container in it, and any specimen that would have no storage left. This cannot
          be undone. If a specimen still has other containers outside this collection, that specimen is kept. Use this when
          fixing a bad import or emptying a plate or box.
        </p>
        <label className="mt-4 flex items-start gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={removeEmptySubjects}
            onChange={(ev) => setRemoveEmptySubjects(ev.target.checked)}
            className="mt-0.5"
          />
          <span>Also remove study participants (subjects) that have no specimens left after this</span>
        </label>
        <p className="mt-4 text-sm">
          Type the exact collection name <span className="font-mono font-medium">{collectionName}</span> to confirm:
        </p>
        <input
          type="text"
          className="mt-1 w-full border border-app-border rounded px-2 py-1.5 text-sm bg-app-surface"
          value={confirmText}
          onChange={(ev) => setConfirmText(ev.target.value)}
          placeholder={collectionName}
          autoComplete="off"
        />
        {errorSummary && (
          <div
            className="mt-4 p-3 rounded text-sm border border-app-trend-down/40 bg-app-trend-down/10"
            style={{ color: 'rgb(var(--app-text))' }}
          >
            <p className="font-medium">{errorSummary}</p>
            {blockers.length > 0 && (
              <ul className="mt-2 list-disc pl-4 space-y-1">
                {blockers.map((b, i) => (
                  <li key={i} className="pl-0.5">
                    {b.message}
                    {b.code && (
                      <span className="ml-1 text-xs opacity-70 font-mono" title="Support code">
                        ({b.code})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={deleting}
            className="px-3 py-1.5 text-sm border border-app-border rounded hover:bg-app-surface"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={doDelete}
            disabled={!nameMatches || deleting}
            className="px-3 py-1.5 text-sm rounded text-white font-medium"
            style={{ backgroundColor: 'rgb(var(--app-trend-down))' }}
          >
            {deleting ? 'Deleting…' : 'Delete collection'}
          </button>
        </div>
      </div>
    </div>
  )
}
