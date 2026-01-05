import { useState, useEffect } from 'react'
import { specimenTypesApi } from '../lib/api'
import { getContainerTypeName } from '../lib/icons'
import { useHotkey } from '../hooks/useHotkey'

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
      const containerTypes = response.data.containerTypes || []
      setAllowedContainerTypes(containerTypes)
      setSelectedContainerTypes(new Set(containerTypes))
    } catch (err: any) {
      console.error('Failed to load container types:', err)
      setError(err.response?.data?.error || 'Failed to load container types')
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
    <div className="fixed inset-0 z-[100] overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
          onClick={onClose}
        />

        {/* Modal panel */}
        <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-2xl font-bold text-gray-900">Manage Container Types</h3>
                <p className="text-sm text-gray-600 mt-1">for {specimenTypeName}</p>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
                aria-label="Close"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            {loading ? (
              <div className="py-8 text-center text-gray-500">Loading container types...</div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-gray-600 mb-4">
                  Select the container types that are allowed for this specimen type:
                </p>
                {CONTAINER_TYPES.map((containerType) => {
                  const isSelected = selectedContainerTypes.has(containerType)
                  return (
                    <label
                      key={containerType}
                      className="flex items-center p-3 border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(containerType)}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      />
                      <span className="ml-3 text-sm font-medium text-gray-900">
                        {getContainerTypeName(containerType)}
                      </span>
                    </label>
                  )
                })}
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={loading || saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

