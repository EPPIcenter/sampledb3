import { useState, useEffect, useRef } from 'react'
import { tagsApi, settingsApi, type Tag, type Unit } from '../lib/api'
import { useHotkey, useModifierHotkey } from '../hooks/useHotkey'
import ModalPortal from './ModalPortal'

interface ContainerEditModalProps {
  isOpen: boolean
  onClose: () => void
  container: {
    id: number
    comment?: string | null
    remainingQuantity?: number
    tags?: Array<{ id: number; name: string }>
    unit?: { id: number; symbol: string }
    containerType?: string
  }
  onSuccess: () => void
}

type ContainerForEdit = ContainerEditModalProps['container']

function ContainerEditModalForm({
  container,
  onClose,
  onSuccess,
}: {
  container: ContainerForEdit
  onClose: () => void
  onSuccess: () => void
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [availableTags, setAvailableTags] = useState<Tag[]>([])
  const [availableUnits, setAvailableUnits] = useState<Unit[]>([])
  const [loadingTags, setLoadingTags] = useState(false)
  const [loadingUnits, setLoadingUnits] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  const [formData, setFormData] = useState({
    comment: container.comment || '',
    remainingQuantity: container.remainingQuantity?.toString() || '',
    unitId: container.unit?.id || undefined,
    tagIds: container.tags?.map(t => t.id) || [],
  })

  // Load tags and units when form mounts (key={container.id} resets form per container)
  useEffect(() => {
    loadTags()
    if (container.containerType) {
      loadUnits(container.containerType)
    }
  }, [container.id, container.containerType])

  const loadTags = async () => {
    try {
      setLoadingTags(true)
      const response = await tagsApi.list()
      setAvailableTags(response.data)
    } catch (err: any) {
      console.error('Failed to load tags:', err)
      // Don't block form if tags fail to load
    } finally {
      setLoadingTags(false)
    }
  }

  const loadUnits = async (containerType: string) => {
    try {
      setLoadingUnits(true)
      const response = await settingsApi.getContainerTypeUnits(containerType)
      setAvailableUnits(response.data.units || [])
    } catch (err: any) {
      console.error('Failed to load units:', err)
      // Don't block form if units fail to load
    } finally {
      setLoadingUnits(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const updateData: {
        comment?: string
        remainingQuantity?: number
        unitId?: number
        tagIds?: number[]
      } = {}

      // Only include fields that have changed
      if (formData.comment !== (container.comment || '')) {
        updateData.comment = formData.comment || undefined
      }

      // Check if remainingQuantity changed
      const currentQuantity = container.remainingQuantity?.toString() || ''
      if (formData.remainingQuantity !== currentQuantity) {
        if (formData.remainingQuantity === '') {
          // Empty string - don't update (keep current value)
        } else {
          const quantity = parseFloat(formData.remainingQuantity)
          if (!isNaN(quantity) && quantity >= 0) {
            updateData.remainingQuantity = quantity
          } else {
            throw new Error('Remaining quantity must be a valid number >= 0')
          }
        }
      }

      // Check if unit changed
      if (formData.unitId !== undefined && formData.unitId !== container.unit?.id) {
        updateData.unitId = formData.unitId
      }

      // Check if tags changed
      const currentTagIds = container.tags?.map(t => t.id).sort() || []
      const newTagIds = [...formData.tagIds].sort()
      const tagsChanged = 
        currentTagIds.length !== newTagIds.length ||
        currentTagIds.some((id, idx) => id !== newTagIds[idx])

      if (tagsChanged) {
        updateData.tagIds = formData.tagIds
      }

      // Only send request if there are changes
      if (Object.keys(updateData).length === 0) {
        onClose()
        return
      }

      const response = await fetch(`/api/containers/${container.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(updateData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        throw new Error(errorData.error || 'Failed to update container')
      }

      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.message || 'Failed to update container')
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl+Enter to submit
  useModifierHotkey('enter', (e) => {
    if (!loading && formRef.current) {
      e.preventDefault()
      formRef.current.requestSubmit()
    }
  }, { preventDefault: true, enableOnFormTags: true })

  // Escape to close (only when not loading)
  useHotkey('escape', () => {
    if (!loading) {
      onClose()
    }
  }, { enableOnFormTags: true })

  return (
        <div
          className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Edit Container</h2>
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="text-gray-400 hover:text-gray-500 focus:outline-none disabled:opacity-50"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {error}
              </div>
            )}

            <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
              {/* Unit */}
              {container.containerType && (
                <div>
                  <label htmlFor="unitId" className="block text-sm font-medium text-gray-700 mb-1">
                    Unit
                  </label>
                  {loadingUnits ? (
                    <div className="text-sm text-gray-500 py-2">Loading units...</div>
                  ) : (
                    <select
                      id="unitId"
                      value={formData.unitId || ''}
                      onChange={(e) => setFormData({ ...formData, unitId: e.target.value ? parseInt(e.target.value) : undefined })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                      disabled={loading}
                    >
                      <option value="">Select unit...</option>
                      {availableUnits.map((unit) => (
                        <option key={unit.id} value={unit.id}>
                          {unit.symbol} ({unit.name})
                        </option>
                      ))}
                    </select>
                  )}
                  <p className="mt-1 text-xs text-gray-500">
                    Change the unit type for this container
                  </p>
                </div>
              )}

              {/* Remaining Quantity */}
              <div>
                <label htmlFor="remainingQuantity" className="block text-sm font-medium text-gray-700 mb-1">
                  Remaining Quantity
                  {container.unit && (
                    <span className="text-gray-500 font-normal ml-1">({container.unit.symbol})</span>
                  )}
                </label>
                <input
                  type="number"
                  id="remainingQuantity"
                  step="0.01"
                  min="0"
                  value={formData.remainingQuantity}
                  onChange={(e) => setFormData({ ...formData, remainingQuantity: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                />
                <p className="mt-1 text-xs text-gray-500">
                  Update the remaining quantity for this container
                </p>
              </div>

              {/* Comment */}
              <div>
                <label htmlFor="comment" className="block text-sm font-medium text-gray-700 mb-1">
                  Comment
                </label>
                <textarea
                  id="comment"
                  rows={4}
                  value={formData.comment}
                  onChange={(e) => setFormData({ ...formData, comment: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                  disabled={loading}
                  placeholder="Add a comment or notes about this container..."
                />
              </div>

              {/* Tags */}
              <div>
                <label htmlFor="tags" className="block text-sm font-medium text-gray-700 mb-1">
                  Tags
                </label>
                {loadingTags ? (
                  <div className="text-sm text-gray-500 py-2">Loading tags...</div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto border border-gray-200 rounded-md p-3">
                    {availableTags.length === 0 ? (
                      <p className="text-sm text-gray-500">No tags available. Create tags in Reference Data.</p>
                    ) : (
                      availableTags.map((tag) => (
                        <label key={tag.id} className="flex items-center space-x-2 cursor-pointer hover:bg-gray-50 p-2 rounded">
                          <input
                            type="checkbox"
                            checked={formData.tagIds.includes(tag.id)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setFormData({
                                  ...formData,
                                  tagIds: [...formData.tagIds, tag.id],
                                })
                              } else {
                                setFormData({
                                  ...formData,
                                  tagIds: formData.tagIds.filter(id => id !== tag.id),
                                })
                              }
                            }}
                            disabled={loading}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">{tag.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Saving...
                    </span>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
  )
}

export default function ContainerEditModal({
  isOpen,
  onClose,
  container,
  onSuccess,
}: ContainerEditModalProps) {
  if (!isOpen) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[100] overflow-y-auto">
        <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
          <div
            className="fixed inset-0 bg-gray-900/40 backdrop-blur-md"
            onClick={onClose}
            aria-hidden
          />
          <span className="hidden sm:inline-block sm:align-middle sm:h-screen" aria-hidden="true">&#8203;</span>
          <ContainerEditModalForm
            key={container.id}
            container={container}
            onClose={onClose}
            onSuccess={onSuccess}
          />
        </div>
      </div>
    </ModalPortal>
  )
}
