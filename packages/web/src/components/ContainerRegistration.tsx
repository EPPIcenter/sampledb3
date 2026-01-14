import { useState, useEffect } from 'react'
import CollectionPicker, { type CollectionType } from './CollectionPicker'
import LocationPicker from './LocationPicker'
import api, { settingsApi, type Unit, type ContainerDefaults } from '../lib/api'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export interface ContainerData {
  mode: 'create' | 'link' | 'skip'
  containerType: ContainerType
  containerBarcode?: string
  containerId?: number
  collectionName?: string
  collectionBarcode?: string
  barcode?: string
  position?: string
  label?: string
  statusId?: number
  comment?: string
  unitId?: number
}

interface ContainerRegistrationProps {
  mode: 'required' | 'optional' | 'hidden'
  containerType?: ContainerType
  defaultValue?: ContainerData
  onChange: (data: ContainerData | null) => void
  onValidationChange?: (isValid: boolean) => void
}

export default function ContainerRegistration({
  mode,
  containerType: initialContainerType,
  defaultValue,
  onChange,
  onValidationChange,
}: ContainerRegistrationProps) {
  const [enabled, setEnabled] = useState(mode === 'required' || (mode === 'optional' && !!defaultValue))
  const [containerType, setContainerType] = useState<ContainerType>(initialContainerType || 'micronix_tube')
  const [formData, setFormData] = useState<ContainerData>({
    mode: defaultValue?.mode || 'create',
    containerType: initialContainerType || 'micronix_tube',
    collectionName: defaultValue?.collectionName || '',
    collectionBarcode: defaultValue?.collectionBarcode || '',
    barcode: defaultValue?.barcode || '',
    position: defaultValue?.position || '',
    label: defaultValue?.label || '',
    comment: defaultValue?.comment || '',
    unitId: defaultValue?.unitId,
  })
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [showCreateCollection, setShowCreateCollection] = useState(false)
  const [newCollectionName, setNewCollectionName] = useState('')
  const [newCollectionLocationId, setNewCollectionLocationId] = useState<number | null>(null)
  const [units, setUnits] = useState<Unit[]>([])
  const [defaultUnitSymbol, setDefaultUnitSymbol] = useState<string | null>(null)
  const [selectedUnitId, setSelectedUnitId] = useState<number | undefined>(defaultValue?.unitId)
  const [unitsError, setUnitsError] = useState<string | null>(null)
  const [defaultUnitError, setDefaultUnitError] = useState<string | null>(null)

  useEffect(() => {
    loadUnits()
    loadDefaultUnit()
  }, [containerType])

  const loadUnits = async () => {
    try {
      setUnitsError(null)
      // Load units filtered by container type
      const res = await settingsApi.getContainerTypeUnits(containerType)
      setUnits(res.data.units || [])
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to load units for this container type'
      setUnitsError(errorMessage)
      setUnits([])
      console.error('Failed to load units:', err)
      // Don't fallback - show error to user instead
    }
  }

  const loadDefaultUnit = async () => {
    try {
      setDefaultUnitError(null)
      const res = await settingsApi.get('container_defaults')
      const defaults = res.data.value as ContainerDefaults | null
      if (defaults && defaults[containerType]) {
        const symbol = defaults[containerType].defaultUnitSymbol
        setDefaultUnitSymbol(symbol)
        // Find unit ID for default symbol if no unit is currently selected
        if (!selectedUnitId && !defaultValue?.unitId) {
          const resUnits = await settingsApi.getUnits()
          const defaultUnit = resUnits.data.find(u => u.symbol === symbol)
          if (defaultUnit) {
            setSelectedUnitId(defaultUnit.id)
          }
        }
      }
    } catch (err: any) {
      const errorMessage = err?.response?.data?.error || err?.message || 'Failed to load default unit settings'
      setDefaultUnitError(errorMessage)
      console.error('Failed to load default unit:', err)
      // Show warning but don't block form usage
    }
  }

  useEffect(() => {
    if (mode === 'hidden') {
      onChange(null)
      return
    }

    if (!enabled && mode === 'optional') {
      onChange(null)
      if (onValidationChange) onValidationChange(true)
      return
    }

    updateContainerData()
  }, [enabled, containerType, formData, mode, selectedUnitId])


  const getCollectionType = (): CollectionType => {
    switch (containerType) {
      case 'micronix_tube':
      case 'static_well':
        return 'micronix_plate'
      case 'cryovial_tube':
        return 'cryovial_box'
      case 'paper':
        return 'box'
      default:
        return 'box'
    }
  }

  const validateForm = (): boolean => {
    const errors: Record<string, string> = {}

    if (formData.mode === 'skip') {
      setValidationErrors({})
      return true
    }

    if (formData.mode === 'link') {
      if (containerType === 'micronix_tube' && !formData.containerBarcode) {
        errors.containerBarcode = 'Barcode is required for linking micronix tubes'
      } else if (!formData.containerId && !formData.containerBarcode) {
        errors.container = 'Container identifier is required for linking'
      }
    } else {
      // Mode is 'create'
      if (!formData.collectionName && !formData.collectionBarcode) {
        errors.collection = 'Collection name or barcode is required'
      }

      if (containerType === 'micronix_tube' && !formData.barcode) {
        errors.barcode = 'Barcode is required for micronix tubes'
      }

      if ((containerType === 'micronix_tube' || containerType === 'cryovial_tube') && !formData.position) {
        errors.position = 'Position is required for ' + (containerType === 'micronix_tube' ? 'micronix tubes' : 'cryovial tubes')
      }

      if (containerType === 'paper' && !formData.label) {
        errors.label = 'Label is required for papers'
      }
    }

    setValidationErrors(errors)
    const isValid = Object.keys(errors).length === 0

    if (onValidationChange) {
      onValidationChange(isValid)
    }

    return isValid
  }

  const updateContainerData = () => {
    const data: ContainerData = {
      ...formData,
      unitId: selectedUnitId,
    }

    if (validateForm()) {
      onChange(data)
    } else {
      onChange(null)
    }
  }

  const handleFieldChange = (field: keyof ContainerData, value: any) => {
    setFormData((prev) => {
      const updated = { ...prev, [field]: value }
      return updated
    })
  }

  if (mode === 'hidden') {
    return null
  }

  return (
    <div className="space-y-4 border-t pt-4 mt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900">Container Registration</h3>
        {mode === 'optional' && (
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-100 rounded"
            />
            <span className="text-sm text-gray-700">Add Container</span>
          </label>
        )}
      </div>

      {enabled && (
        <div className="space-y-4 bg-gray-50 p-4 rounded-lg">
          {/* Container Type Selector */}
          {!initialContainerType && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Container Type *
              </label>
              <select
                value={containerType}
                onChange={(e) => {
                  setContainerType(e.target.value as ContainerType)
                  handleFieldChange('containerType', e.target.value)
                }}
                className="form-select"
              >
                <option value="micronix_tube">Micronix Tube</option>
                <option value="cryovial_tube">Cryovial Tube</option>
                <option value="paper">Paper</option>
                <option value="static_well">Static Well</option>
              </select>
            </div>
          )}

          {/* Mode Selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Action *
            </label>
            <select
              value={formData.mode}
              onChange={(e) => {
                handleFieldChange('mode', e.target.value)
              }}
              className="form-select"
            >
              <option value="create">Create New Container</option>
              <option value="link">Link Existing Container</option>
              <option value="skip">Skip (No Container)</option>
            </select>
          </div>

          {formData.mode === 'link' && (
            <div className="space-y-4">
              {containerType === 'micronix_tube' ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Container Barcode *
                  </label>
                  <input
                    type="text"
                    value={formData.containerBarcode || ''}
                    onChange={(e) => handleFieldChange('containerBarcode', e.target.value)}
                    placeholder="Enter barcode"
                    className={`form-input ${validationErrors.containerBarcode ? 'border-red-300' : ''}`}
                  />
                  {validationErrors.containerBarcode && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.containerBarcode}</p>
                  )}
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Container ID *
                  </label>
                  <input
                    type="number"
                    value={formData.containerId || ''}
                    onChange={(e) => handleFieldChange('containerId', parseInt(e.target.value) || undefined)}
                    placeholder="Enter container ID"
                    className={`form-input ${validationErrors.container ? 'border-red-300' : ''}`}
                  />
                  {validationErrors.container && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.container}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {formData.mode === 'create' && (
            <div className="space-y-4">
              {/* Collection Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Collection ({getCollectionType() === 'micronix_plate' ? 'Plate' : 'Box'}) *
                </label>
                <CollectionPicker
                  collectionType={getCollectionType()}
                  value={formData.collectionName || formData.collectionBarcode || ''}
                  onChange={(value) => {
                    // Try to determine if it's a name or barcode
                    // For now, treat as name
                    handleFieldChange('collectionName', value)
                    handleFieldChange('collectionBarcode', '')
                  }}
                  allowCreate={true}
                  onCreateClick={() => setShowCreateCollection(true)}
                />
                {validationErrors.collection && (
                  <p className="mt-1 text-sm text-red-600">{validationErrors.collection}</p>
                )}
              </div>

              {/* Create Collection Modal */}
              {showCreateCollection && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center">
                  <div
                    className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
                    onClick={() => setShowCreateCollection(false)}
                  />
                  <div className="relative z-10 w-full max-w-2xl mx-4 bg-white rounded-lg shadow-xl p-6 max-h-[90vh] overflow-y-auto">
                    <h3 className="text-lg font-semibold mb-4 text-gray-900">
                      Create {getCollectionType() === 'micronix_plate' ? 'Micronix Plate' : 'Cryovial Box'}
                    </h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Name *
                        </label>
                        <input
                          type="text"
                          value={newCollectionName}
                          onChange={(e) => setNewCollectionName(e.target.value)}
                          className="form-input"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Location *
                        </label>
                        <LocationPicker
                          value={newCollectionLocationId}
                          onChange={setNewCollectionLocationId}
                        />
                      </div>
                      <div className="flex justify-end space-x-3">
                        <button
                          type="button"
                          onClick={() => setShowCreateCollection(false)}
                          className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (!newCollectionName || !newCollectionLocationId) return

                            try {
                              const endpoint = getCollectionType() === 'micronix_plate'
                                ? '/collections/plates/micronix'
                                : '/collections/boxes/cryovial'

                              const response = await api.post(endpoint, {
                                name: newCollectionName,
                                locationId: newCollectionLocationId,
                              })

                              handleFieldChange('collectionName', response.data.plate?.name || response.data.box?.name || newCollectionName)
                              setShowCreateCollection(false)
                              setNewCollectionName('')
                              setNewCollectionLocationId(null)
                            } catch (error: any) {
                              console.error('Failed to create collection:', error)
                              alert(error.response?.data?.error || 'Failed to create collection')
                            }
                          }}
                          disabled={!newCollectionName || !newCollectionLocationId}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        >
                          Create
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Container-specific fields */}
              {containerType === 'micronix_tube' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Barcode * (Globally Unique)
                  </label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => handleFieldChange('barcode', e.target.value)}
                    placeholder="Enter barcode"
                    className={`form-input ${validationErrors.barcode ? 'border-red-300' : ''}`}
                  />
                  {validationErrors.barcode && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.barcode}</p>
                  )}
                </div>
              )}

              {containerType === 'cryovial_tube' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Barcode (Optional)
                  </label>
                  <input
                    type="text"
                    value={formData.barcode || ''}
                    onChange={(e) => handleFieldChange('barcode', e.target.value)}
                    placeholder="Enter barcode (optional)"
                    className="form-input"
                  />
                </div>
              )}

              {(containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Position {containerType === 'micronix_tube' || containerType === 'cryovial_tube' ? '*' : '(Optional)'}
                  </label>
                  <input
                    type="text"
                    value={formData.position || ''}
                    onChange={(e) => handleFieldChange('position', e.target.value)}
                    placeholder="e.g., A01, B12"
                    className={`form-input ${validationErrors.position ? 'border-red-300' : ''}`}
                  />
                  {validationErrors.position && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.position}</p>
                  )}
                </div>
              )}

              {containerType === 'paper' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Label *
                  </label>
                  <input
                    type="text"
                    value={formData.label || ''}
                    onChange={(e) => handleFieldChange('label', e.target.value)}
                    placeholder="Enter label"
                    className={`form-input ${validationErrors.label ? 'border-red-300' : ''}`}
                  />
                  {validationErrors.label && (
                    <p className="mt-1 text-sm text-red-600">{validationErrors.label}</p>
                  )}
                </div>
              )}

              {/* Unit Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Unit (Optional)
                </label>
                {unitsError && (
                  <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                    {unitsError}
                  </div>
                )}
                {defaultUnitError && (
                  <div className="mb-2 p-2 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-700">
                    Warning: {defaultUnitError}
                  </div>
                )}
                <select
                  value={selectedUnitId || ''}
                  onChange={(e) => {
                    const unitId = e.target.value ? parseInt(e.target.value) : undefined
                    setSelectedUnitId(unitId)
                  }}
                  className="form-select"
                  disabled={unitsError !== null}
                >
                  <option value="">Use default ({defaultUnitSymbol || 'not set'})</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.symbol} ({unit.name})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-gray-500">
                  Select a unit to override the default. If not specified, the default unit for this container type will be used.
                </p>
              </div>

              {/* Optional comment */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Comment (Optional)
                </label>
                <textarea
                  value={formData.comment || ''}
                  onChange={(e) => handleFieldChange('comment', e.target.value)}
                  rows={2}
                  className="form-textarea"
                  placeholder="Add any notes about this container"
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

