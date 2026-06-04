import { useState, useEffect, useRef } from 'react'
import { locationsApi } from '../lib/api/locations';
import { storageTypesApi } from '../lib/api/reference-data';
import { Modal } from '../ui'
import type { Location } from '../lib/api/types';
import type { StorageType } from '../lib/api/reference-data';
import { locationParentId } from '../lib/location-tree'

interface LocationFormProps {
  location?: Location | null
  parentId?: number | null
  parentLocation?: Location | null
  onSave: (data: any) => Promise<void>
  onCancel: () => void
}

export default function LocationForm({ location, parentId, parentLocation, onSave, onCancel }: LocationFormProps) {
  const isEdit = !!location
  // When editing, check location.parentId; when creating, check parentId prop
  const isRoot = isEdit
    ? locationParentId(location) === null
    : parentId == null
  const isChild = !isRoot && !isEdit

  const [formData, setFormData] = useState({
    name: location?.name || '',
    description: location?.description || '',
    storageTypeId: location?.storageTypeId || '',
    canContainCollections: location?.canContainCollections || false,
    parentId: location ? locationParentId(location) : (isChild ? parentId : null),
  })
  const [storageTypes, setStorageTypes] = useState<StorageType[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loadingStorageTypes, setLoadingStorageTypes] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)

  // Load storage types for root locations only
  useEffect(() => {
    if (isRoot) {
      setLoadingStorageTypes(true)
      storageTypesApi
        .list()
        .then((response) => {
          setStorageTypes(response.data)
        })
        .catch((error) => {
          console.error('Failed to load storage types:', error)
        })
        .finally(() => {
          setLoadingStorageTypes(false)
        })
    }
  }, [isRoot])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const submitData: any = {
        name: formData.name.trim(),
        description: formData.description.trim() || null,
        canContainCollections: formData.canContainCollections,
      }

      if (isRoot) {
        // Root location - require storageTypeId
        if (!formData.storageTypeId) {
          setError('Storage type is required for root locations')
          setLoading(false)
          return
        }
        submitData.storageTypeId = formData.storageTypeId
        submitData.parentId = null
      } else {
        // Child location - no storageTypeId, inherit from parent
        submitData.parentId = isChild ? parentId : (location ? locationParentId(location) : null)
        submitData.storageTypeId = null
      }

      await onSave(submitData)
    } catch (err: any) {
      const errorMessage =
        err.response?.data?.error ||
        (err.response?.data?.details &&
          (Array.isArray(err.response.data.details)
            ? err.response.data.details.map((d: any) => d.message || d).join(', ')
            : err.response.data.details)) ||
        err.message ||
        'Failed to save location'
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key: string, value: any) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const modalTitle = isEdit
    ? 'Edit Location'
    : isRoot
      ? 'Add Root Location'
      : 'Add Child Location'

  return (
    <Modal
      isOpen
      onClose={onCancel}
      title={modalTitle}
      size="sm"
      panelClassName="sm:max-h-[90vh]"
      contentClassName="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4 overflow-y-auto max-h-[90vh]"
      closeDisabled={loading}
    >
          {error && (
            <div className="mb-4 bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded">
              {error}
            </div>
          )}

          <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
            {/* Parent Location (read-only for child locations) */}
            {!isRoot && (
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Parent Location
                </label>
                <div className="px-3 py-2 bg-app-surface border border-app-border rounded text-sm text-app-text">
                  {(() => {
                    // When editing, use the location's path to get parent path
                    if (location?.path) {
                      const pathParts = location.path.split(' → ')
                      const parentPath = pathParts.slice(0, -1)
                      return parentPath.length > 0 ? parentPath.join(' → ') : location.name
                    }
                    // When adding a child, use the parentLocation if available
                    if (parentLocation) {
                      return parentLocation.path || parentLocation.name
                    }
                    // Fallback to parentId if parentLocation not available
                    const editParentId = location ? locationParentId(location) : null
                    if (editParentId != null) {
                      return `Location #${editParentId}`
                    }
                    if (parentId) {
                      return `Location #${parentId}`
                    }
                    return 'Root'
                  })()}
                </div>
                <p className="mt-1 text-xs text-app-text-muted">
                  Storage type will be inherited from the parent location.
                </p>
              </div>
            )}

            {/* Name */}
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-app-text mb-2">
                Name <span className="text-app-trend-down">*</span>
              </label>
              <input
                id="name"
                type="text"
                value={formData.name}
                onChange={(e) => handleChange('name', e.target.value)}
                required
                disabled={loading}
                className="form-input w-full disabled:bg-app-surface disabled:cursor-not-allowed"
                autoFocus
              />
            </div>

            {/* Storage Type - editable for root locations, read-only for child locations */}
            {isEdit && locationParentId(location) != null && (
              <div>
                <label className="block text-sm font-medium text-app-text mb-2">
                  Storage Type (inherited)
                </label>
                <div className="px-3 py-2 bg-app-surface border border-app-border rounded text-sm text-app-text">
                  {location.effectiveStorageTypeName || location.storageTypeName || 'N/A'}
                </div>
                <p className="mt-1 text-xs text-app-text-muted">
                  Storage type is inherited from the parent location and cannot be changed.
                </p>
              </div>
            )}
            {isRoot && (
              <div>
                <label htmlFor="storageTypeId" className="block text-sm font-medium text-app-text mb-2">
                  Storage Type <span className="text-app-trend-down">*</span>
                </label>
                {loadingStorageTypes ? (
                  <div className="px-3 py-2 bg-app-surface border border-app-border rounded text-sm text-app-text-muted">
                    Loading storage types...
                  </div>
                ) : (
                  <select
                    id="storageTypeId"
                    value={formData.storageTypeId}
                    onChange={(e) => handleChange('storageTypeId', e.target.value)}
                    required
                    disabled={loading || loadingStorageTypes}
                    className="form-select w-full disabled:bg-app-surface disabled:cursor-not-allowed"
                  >
                    <option value="">Select storage type...</option>
                    {storageTypes.map((st) => (
                      <option key={st.id} value={String(st.id)}>
                        {st.description ? `${st.name} - ${st.description}` : st.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Description */}
            <div>
              <label htmlFor="description" className="block text-sm font-medium text-app-text mb-2">
                Description
              </label>
              <textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleChange('description', e.target.value)}
                disabled={loading}
                rows={3}
                className="form-textarea w-full disabled:bg-app-surface disabled:cursor-not-allowed"
              />
            </div>

            {/* Can Contain Collections */}
            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  checked={formData.canContainCollections}
                  onChange={(e) => handleChange('canContainCollections', e.target.checked)}
                  disabled={loading}
                  className="form-checkbox mr-2 disabled:bg-app-surface disabled:cursor-not-allowed"
                />
                <span className="text-sm font-medium text-app-text">Can Contain Collections</span>
              </label>
              <p className="mt-1 text-xs text-app-text-muted">
                Allow this location to store collections (plates, boxes, bags).
              </p>
            </div>

            <div className="flex justify-end space-x-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface disabled:opacity-50"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : isEdit ? 'Update' : 'Create'}
              </button>
            </div>
          </form>
    </Modal>
  )
}

