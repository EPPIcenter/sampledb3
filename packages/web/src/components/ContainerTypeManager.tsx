import { useState, useEffect } from 'react'
import { specimenTypesApi } from '../lib/api/reference-data';
import { getContainerTypeName } from '../lib/icons'
import { useHotkey } from '../hooks/useHotkey'
import ModalPortal from './ModalPortal'

const CONTAINER_TYPES = ['paper', 'cryovial_tube', 'micronix_tube', 'static_well'] as const

interface ContainerTypeManagerProps {
  isOpen: boolean
  onClose: () => void
  specimenTypeId: number
  specimenTypeName: string
  onSave: () => void
}

export default function ContainerTypeManager({
  isOpen,
  onClose,
  specimenTypeId,
  specimenTypeName,
  onSave,
}: ContainerTypeManagerProps) {
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [selectedContainerTypes, setSelectedContainerTypes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Close on Escape
  useHotkey('escape', () => {
    if (isOpen) {
      onClose()
    }
  }, { enabled: isOpen })

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  // Load current container types when modal opens
  useEffect(() => {
    if (isOpen && specimenTypeId) {
      loadContainerTypes()
    }
  }, [isOpen, specimenTypeId])

  const loadContainerTypes = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await specimenTypesApi.getContainerTypes(specimenTypeId)
      const containerTypes = response.data.containerTypes
      setAllowedContainerTypes(containerTypes)
      setSelectedContainerTypes(new Set(containerTypes))
    } catch (err: any) {
      console.error('Failed to load container types:', err)
      setError(err.response?.data?.error ?? 'Failed to load container types')
    } finally {
      setLoading(false)
    }
  }

  const handleToggle = (containerType: string) => {
    setSelectedContainerTypes((prev) => {
      const next = new Set(prev)
      if (next.has(containerType)) {
        next.delete(containerType)
      } else {
        next.add(containerType)
      }
      return next
    })
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    try {
      // Determine which container types to add and remove
      const toAdd = CONTAINER_TYPES.filter(
        (ct) => selectedContainerTypes.has(ct) && !allowedContainerTypes.includes(ct)
      )
      const toRemove = allowedContainerTypes.filter(
        (ct) => !selectedContainerTypes.has(ct)
      )

      // Perform all add/remove operations
      const operations = [
        ...toAdd.map((ct) => specimenTypesApi.addContainerType(specimenTypeId, ct)),
        ...toRemove.map((ct) => specimenTypesApi.removeContainerType(specimenTypeId, ct)),
      ]

      await Promise.all(operations)

      // Update local state
      setAllowedContainerTypes(Array.from(selectedContainerTypes))
      onSave()
      onClose()
    } catch (err: any) {
      console.error('Failed to save container types:', err)
      setError(err.response?.data?.error || 'Failed to save container types')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          {/* Background overlay */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-md"
            onClick={onClose}
          />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-app-text">Manage Container Types</h3>
                <p className="text-sm text-app-text-muted mt-1">for {specimenTypeName}</p>
              </div>
              <button
                onClick={onClose}
                className="text-app-text-muted hover:text-app-text focus:outline-none focus:ring-2 focus:ring-app-accent rounded"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-8 text-center text-app-text-muted">Loading container types...</div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-app-text-muted mb-4">
                  Select the container types that are allowed for this specimen type:
                </p>
                {CONTAINER_TYPES.map((containerType) => {
                  const isSelected = selectedContainerTypes.has(containerType)
                  return (
                    <label
                      key={containerType}
                      className="flex items-center p-3 border border-app-border rounded-lg hover:bg-app-surface cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(containerType)}
                        className="h-4 w-4 text-app-accent focus:ring-app-accent border-app-border rounded"
                      />
                      <span className="ml-3 text-sm font-medium text-app-text">
                        {getContainerTypeName(containerType)}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-app-border flex justify-end space-x-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading || saving}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

