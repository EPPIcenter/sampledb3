import { useState, useEffect, useRef } from 'react'
import { derivationsApi, specimenTypesApi, unitsApi, collectionsApi, type SpecimenType, type Unit, type CreateDerivationPayload } from '../lib/api'
import LocationPicker from './LocationPicker'

interface ContainerDerivationModalProps {
  isOpen: boolean
  onClose: () => void
  parentContainerId: number
  parentContainer?: {
    remainingQuantity?: number
    unit?: { symbol: string }
    containerType?: string
  }
  onSuccess: () => void
}

const DERIVATION_TYPES = [
  { value: 'dna_extraction', label: 'DNA Extraction' },
  { value: 'dilution', label: 'Dilution' },
  { value: 'aliquot', label: 'Aliquot' },
  { value: 'other', label: 'Other' },
]

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
  { value: 'static_well', label: 'Static Well' },
]

export default function ContainerDerivationModal({
  isOpen,
  onClose,
  parentContainerId,
  parentContainer,
  onSuccess,
}: ContainerDerivationModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [allowedContainerTypes, setAllowedContainerTypes] = useState<string[]>([])
  const [placementMode, setPlacementMode] = useState<'existing' | 'new'>('existing')
  const [newCollectionLocationId, setNewCollectionLocationId] = useState<number | null>(null)
  const [sheetParentType, setSheetParentType] = useState<'box' | 'bag'>('box')
  const [sheetParentName, setSheetParentName] = useState<string>('')
  const [collectionSearch, setCollectionSearch] = useState<string>('')
  const [collectionSearchResults, setCollectionSearchResults] = useState<Array<{ id: number; name: string; barcode?: string; locationPath?: string }>>([])
  const [collectionSearchLoading, setCollectionSearchLoading] = useState(false)
  const [showCollectionResults, setShowCollectionResults] = useState(false)

  const [formData, setFormData] = useState<CreateDerivationPayload>({
    derivationType: 'dna_extraction',
    specimenTypeName: '',
    containerType: 'micronix_tube',
    quantity: 1.0,
    unitSymbol: '',
    quantityUsed: undefined,
    reduceParentQuantity: true,
    derivationDate: new Date().toISOString().split('T')[0],
    protocol: '',
    notes: '',
    properties: undefined,
    collectionId: undefined,
    collectionName: undefined,
    collectionType: undefined,
    collectionLocationId: undefined,
    containerBarcode: '',
    position: '',
  })

  useEffect(() => {
    if (isOpen) {
      loadReferenceData()
      // Reset form when modal opens
      setFormData({
        derivationType: 'dna_extraction',
        specimenTypeName: '',
        containerType: 'micronix_tube',
        quantity: 1.0,
        unitSymbol: '',
        quantityUsed: undefined,
        reduceParentQuantity: true,
        derivationDate: new Date().toISOString().split('T')[0],
        protocol: '',
        notes: '',
        properties: undefined,
        collectionId: undefined,
        collectionName: undefined,
        collectionType: undefined,
        collectionLocationId: undefined,
        containerBarcode: '',
        position: '',
      })
      setPlacementMode('existing')
      setNewCollectionLocationId(null)
      setSheetParentType('box')
      setSheetParentName('')
      setCollectionSearch('')
      setCollectionSearchResults([])
      setShowCollectionResults(false)
      setError(null)
      setWarnings([])
    }
  }, [isOpen])

  // Sync collectionSearch with formData.collectionName when it changes externally
  useEffect(() => {
    if (placementMode === 'existing' && formData.collectionName && formData.collectionName !== collectionSearch) {
      setCollectionSearch(formData.collectionName)
    }
  }, [formData.collectionName, placementMode])

  // Reset collection search when container type or placement mode changes
  useEffect(() => {
    if (placementMode === 'existing') {
      setCollectionSearch('')
      setCollectionSearchResults([])
      setShowCollectionResults(false)
    }
  }, [formData.containerType, placementMode])

  // Fetch allowed container types when specimen type changes
  useEffect(() => {
    const fetchAllowedContainerTypes = async () => {
      if (!formData.specimenTypeName) {
        setAllowedContainerTypes([])
        return
      }

      const selectedSpecimenType = specimenTypes.find(st => st.name === formData.specimenTypeName)
      if (!selectedSpecimenType) {
        setAllowedContainerTypes([])
        return
      }

      try {
        const response = await specimenTypesApi.getContainerTypes(selectedSpecimenType.id)
        const containerTypes = response.data.containerTypes || []
        setAllowedContainerTypes(containerTypes)

        // If current container type is not allowed, reset it
        if (formData.containerType && !containerTypes.includes(formData.containerType)) {
          setFormData(prev => ({
            ...prev,
            containerType: containerTypes.length > 0 ? (containerTypes[0] as any) : 'micronix_tube',
          }))
        }
      } catch (err: any) {
        console.error('Failed to fetch allowed container types:', err)
        // On error, allow all container types (fallback)
        setAllowedContainerTypes([])
      }
    }

    if (isOpen && specimenTypes.length > 0) {
      fetchAllowedContainerTypes()
    }
  }, [isOpen, formData.specimenTypeName, specimenTypes])

  const loadReferenceData = async () => {
    try {
      setLoading(true)
      const [specimenTypesRes, unitsRes] = await Promise.all([
        specimenTypesApi.list(),
        unitsApi.list(),
      ])
      setSpecimenTypes(specimenTypesRes.data)
      setUnits(unitsRes.data)
    } catch (err: any) {
      console.error('Failed to load reference data:', err)
      setError(err.response?.data?.error || 'Failed to load reference data')
    } finally {
      setLoading(false)
    }
  }

  // Search collections as user types
  const collectionSearchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (collectionSearchTimeoutRef.current) {
      clearTimeout(collectionSearchTimeoutRef.current)
    }

    if (!placementMode || placementMode !== 'existing' || !formData.containerType || !collectionSearch.trim()) {
      setCollectionSearchResults([])
      setShowCollectionResults(false)
      return
    }

    // Determine collection type based on container type
    const collectionType =
      formData.containerType === 'micronix_tube'
        ? 'micronix_plate'
        : formData.containerType === 'cryovial_tube'
          ? 'cryovial_box'
          : formData.containerType === 'paper'
            ? 'sheet'
            : null

    if (!collectionType) {
      return
    }

    // Debounce search
    collectionSearchTimeoutRef.current = setTimeout(async () => {
      try {
        setCollectionSearchLoading(true)
        
        // Use listCollectionsByType and filter client-side for all collection types
        // This is more reliable than the search API which doesn't support all types
        const response = await collectionsApi.listCollectionsByType(collectionType as any)
        const allCollections = response.data.collections || []
        const searchLower = collectionSearch.toLowerCase()
        
        // Filter by name, barcode (if available), or location path
        const filtered = allCollections.filter((c: any) => {
          const nameMatch = c.name?.toLowerCase().includes(searchLower) || false
          const barcodeMatch = c.barcode?.toLowerCase().includes(searchLower) || false
          const locationMatch = c.location?.path?.toLowerCase().includes(searchLower) || false
          return nameMatch || barcodeMatch || locationMatch
        })
        
        setCollectionSearchResults(filtered.map((c: any) => ({
          id: c.id,
          name: c.name,
          barcode: c.barcode,
          locationPath: c.location?.path,
        })))
        setShowCollectionResults(true)
      } catch (err: any) {
        console.error('Failed to search collections:', err)
        console.error('Error details:', err.response?.data || err.message)
        setCollectionSearchResults([])
        // Show error state in UI if needed
      } finally {
        setCollectionSearchLoading(false)
      }
    }, 300)

    return () => {
      if (collectionSearchTimeoutRef.current) {
        clearTimeout(collectionSearchTimeoutRef.current)
      }
    }
  }, [collectionSearch, placementMode, formData.containerType])

  const handleCollectionSelect = (collection: { id: number; name: string }) => {
    setFormData(prev => ({
      ...prev,
      collectionName: collection.name,
      collectionId: collection.id,
    }))
    setCollectionSearch(collection.name)
    setShowCollectionResults(false)
  }

  const collectionInputRef = useRef<HTMLDivElement>(null)

  // Close results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (collectionInputRef.current && !collectionInputRef.current.contains(event.target as Node)) {
        setShowCollectionResults(false)
      }
    }

    if (showCollectionResults) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showCollectionResults])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setWarnings([])

    // Validation
    if (!formData.derivationType) {
      setError('Derivation type is required')
      setLoading(false)
      return
    }
    if (!formData.specimenTypeName) {
      setError('Specimen type is required')
      setLoading(false)
      return
    }
    if (!formData.containerType) {
      setError('Container type is required')
      setLoading(false)
      return
    }
    if (formData.quantity !== undefined && formData.quantity <= 0) {
      setError('Quantity must be greater than 0')
      setLoading(false)
      return
    }

    // Validation for new collection mode
    if (placementMode === 'new') {
      if (!newCollectionLocationId) {
        setError('Collection location is required when creating a new collection')
        setLoading(false)
        return
      }
      if (!formData.collectionName) {
        setError('Collection name is required when creating a new collection')
        setLoading(false)
        return
      }
      if (formData.containerType === 'paper') {
        if (!sheetParentName) {
          setError(`${sheetParentType === 'box' ? 'Box' : 'Bag'} name is required for sheet creation`)
          setLoading(false)
          return
        }
      }
    }

    try {
      const payload: CreateDerivationPayload = {
        derivationType: formData.derivationType,
        specimenTypeName: formData.specimenTypeName,
        containerType: formData.containerType,
        quantity: formData.quantity,
        unitSymbol: formData.unitSymbol || undefined,
        quantityUsed: formData.quantityUsed,
        reduceParentQuantity: formData.reduceParentQuantity,
        derivationDate: formData.derivationDate || undefined,
        protocol: formData.protocol || undefined,
        notes: formData.notes || undefined,
        properties: formData.properties,
        // Existing collection: send name/type to resolve, no location
        // New collection: send name/type/location for creation
        collectionId: placementMode === 'existing' ? formData.collectionId : undefined,
        collectionName: formData.collectionName,
        collectionType:
          formData.containerType === 'micronix_tube'
            ? 'micronix_plate'
            : formData.containerType === 'cryovial_tube'
              ? 'cryovial_box'
              : formData.containerType === 'paper'
                ? 'sheet'
                : undefined,
        collectionLocationId:
          placementMode === 'new' && newCollectionLocationId
            ? newCollectionLocationId
            : undefined,
        sheetParentType: formData.containerType === 'paper' && placementMode === 'new' ? sheetParentType : undefined,
        sheetParentName: formData.containerType === 'paper' && placementMode === 'new' ? sheetParentName : undefined,
        containerBarcode: formData.containerBarcode || undefined,
        position: formData.position || undefined,
      }

      const response = await derivationsApi.createFromContainer(parentContainerId, payload)
      
      if (response.data.warnings && response.data.warnings.length > 0) {
        setWarnings(response.data.warnings)
        // Still show success but with warnings
        setTimeout(() => {
          onSuccess()
          onClose()
        }, 2000)
      } else {
        onSuccess()
        onClose()
      }
    } catch (err: any) {
      console.error('Failed to create derivation:', err)
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to create derivation')
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  const parentRemainingQty = parentContainer?.remainingQuantity ?? 0
  const parentUnitSymbol = parentContainer?.unit?.symbol || ''

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold text-gray-900">Create Derivation</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              disabled={loading}
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-700 text-sm">
              <div className="font-semibold mb-1">Warnings:</div>
              <ul className="list-disc list-inside">
                {warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Derivation Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derivation Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.derivationType}
                onChange={(e) => setFormData({ ...formData, derivationType: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              >
                {DERIVATION_TYPES.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Specimen Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Specimen Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.specimenTypeName}
                onChange={(e) => setFormData({ ...formData, specimenTypeName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              >
                <option value="">Select specimen type...</option>
                {specimenTypes.map((st) => (
                  <option key={st.id} value={st.name}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Container Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Container Type <span className="text-red-500">*</span>
              </label>
              <select
                value={formData.containerType}
                onChange={(e) => {
                  const newContainerType = e.target.value as any
                  setFormData({ ...formData, containerType: newContainerType, collectionId: undefined, collectionName: undefined })
                  // Reset sheet parent fields if not paper
                  if (newContainerType !== 'paper') {
                    setSheetParentType('box')
                    setSheetParentName('')
                  }
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                disabled={loading}
              >
                {(allowedContainerTypes.length > 0 ? CONTAINER_TYPES.filter(type => allowedContainerTypes.includes(type.value)) : CONTAINER_TYPES).map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
              {allowedContainerTypes.length > 0 && (
                <div className="text-xs text-gray-500 mt-1">
                  Allowed container types for this specimen type: {allowedContainerTypes.map(ct => CONTAINER_TYPES.find(t => t.value === ct)?.label || ct).join(', ')}
                </div>
              )}
              {allowedContainerTypes.length === 0 && formData.specimenTypeName && (
                <div className="text-xs text-yellow-600 mt-1">
                  ⚠ No container type constraints configured for this specimen type. All container types are allowed.
                </div>
              )}
            </div>

            {/* Quantity and Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.quantity ?? ''}
                  onChange={(e) => setFormData({ ...formData, quantity: e.target.value ? parseFloat(e.target.value) : undefined })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Unit
                </label>
                <select
                  value={formData.unitSymbol}
                  onChange={(e) => setFormData({ ...formData, unitSymbol: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                >
                  <option value="">Auto (default for container type)</option>
                  {units.map((unit) => (
                    <option key={unit.id} value={unit.symbol}>
                      {unit.symbol} ({unit.name})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Quantity Used from Parent */}
            <div className="bg-gray-50 p-4 rounded-md">
              <div className="flex items-center mb-2">
                <input
                  type="checkbox"
                  id="reduceParent"
                  checked={formData.reduceParentQuantity}
                  onChange={(e) => setFormData({ ...formData, reduceParentQuantity: e.target.checked })}
                  className="mr-2"
                  disabled={loading}
                />
                <label htmlFor="reduceParent" className="text-sm font-medium text-gray-700">
                  Reduce parent container quantity
                </label>
              </div>
              {formData.reduceParentQuantity && (
                <div className="mt-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Quantity Used from Parent
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.quantityUsed ?? ''}
                    onChange={(e) => setFormData({ ...formData, quantityUsed: e.target.value ? parseFloat(e.target.value) : undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    disabled={loading}
                  />
                  <div className="mt-1 text-xs text-gray-500">
                    Parent remaining: {parentRemainingQty} {parentUnitSymbol}
                    {formData.quantityUsed && formData.quantityUsed > parentRemainingQty && (
                      <span className="text-yellow-600 ml-2">⚠ Insufficient quantity</span>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Collection Placement */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Collection (Optional)
              </label>
              <div className="space-y-3">
                <div className="flex items-center gap-4 text-sm">
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="mr-2"
                      checked={placementMode === 'existing'}
                      onChange={() => setPlacementMode('existing')}
                      disabled={loading}
                    />
                    <span>Use existing collection</span>
                  </label>
                  <label className="inline-flex items-center">
                    <input
                      type="radio"
                      className="mr-2"
                      checked={placementMode === 'new'}
                      onChange={() => setPlacementMode('new')}
                      disabled={loading}
                    />
                    <span>Create new collection</span>
                  </label>
                </div>

                {placementMode === 'existing' ? (
                  <div className="space-y-1 relative" ref={collectionInputRef}>
                    <input
                      type="text"
                      placeholder={`Search ${formData.containerType === 'micronix_tube' ? 'micronix plate' : formData.containerType === 'cryovial_tube' ? 'cryovial box' : formData.containerType === 'paper' ? 'sheet' : 'collection'} by name or barcode...`}
                      value={collectionSearch}
                      onChange={(e) => {
                        setCollectionSearch(e.target.value)
                        setFormData(prev => ({
                          ...prev,
                          collectionName: e.target.value || undefined,
                          collectionId: undefined,
                        }))
                        if (e.target.value.trim()) {
                          setShowCollectionResults(true)
                        }
                      }}
                      onFocus={() => {
                        if (collectionSearchResults.length > 0) {
                          setShowCollectionResults(true)
                        }
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      disabled={loading || !formData.containerType}
                    />
                    {showCollectionResults && (collectionSearchLoading || collectionSearchResults.length > 0 || collectionSearch.trim()) && (
                      <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
                        {collectionSearchLoading ? (
                          <div className="p-3 text-sm text-gray-500">Searching...</div>
                        ) : collectionSearchResults.length === 0 && collectionSearch.trim() ? (
                          <div className="p-3 text-sm text-gray-500">
                            No collections found matching "{collectionSearch}"
                          </div>
                        ) : collectionSearchResults.length > 0 ? (
                          <ul className="divide-y divide-gray-200">
                            {collectionSearchResults.map((collection) => (
                              <li key={collection.id}>
                                <button
                                  type="button"
                                  className="w-full px-4 py-3 text-left hover:bg-gray-50 focus:outline-none focus:bg-gray-50 transition-colors"
                                  onClick={() => handleCollectionSelect(collection)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium text-gray-900 truncate">{collection.name}</p>
                                      {collection.barcode && (
                                        <p className="text-xs text-gray-500 mt-0.5">Barcode: {collection.barcode}</p>
                                      )}
                                      {collection.locationPath && (
                                        <p className="text-xs text-gray-400 mt-0.5 truncate">{collection.locationPath}</p>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                    )}
                    <div className="text-xs text-gray-500 mt-1">
                      Start typing to search for existing collections. Select from the dropdown to choose a collection.
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div>
                      <span className="block text-xs font-medium text-gray-600 mb-1">
                        Collection Location <span className="text-red-500">*</span>
                      </span>
                      <LocationPicker
                        value={newCollectionLocationId}
                        onChange={(locId) => setNewCollectionLocationId(locId)}
                        filterCollectionsOnly
                        disabled={loading}
                      />
                    </div>
                    {formData.containerType === 'paper' ? (
                      <>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sheet Parent Type <span className="text-red-500">*</span>
                          </label>
                          <select
                            value={sheetParentType}
                            onChange={(e) => {
                              setSheetParentType(e.target.value as 'box' | 'bag')
                              setSheetParentName('')
                            }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          >
                            <option value="box">Box</option>
                            <option value="bag">Bag</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            {sheetParentType === 'box' ? 'Box' : 'Bag'} Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder={`Enter ${sheetParentType} name (will be created if it doesn't exist)`}
                            value={sheetParentName}
                            onChange={(e) => setSheetParentName(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Sheet Name <span className="text-red-500">*</span>
                          </label>
                          <input
                            type="text"
                            placeholder="New sheet name"
                            value={formData.collectionName || ''}
                            onChange={(e) => setFormData({ ...formData, collectionName: e.target.value || undefined })}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                            disabled={loading}
                          />
                          <div className="text-xs text-gray-500 mt-1">
                            A new sheet will be created in the {sheetParentType} at the selected location.
                          </div>
                        </div>
                      </>
                    ) : (
                      <div>
                        <input
                          type="text"
                          placeholder="New collection name"
                          value={formData.collectionName || ''}
                          onChange={(e) => setFormData({ ...formData, collectionName: e.target.value || undefined })}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                          disabled={loading}
                        />
                        <div className="text-xs text-gray-500 mt-1">
                          A new plate/box will be created at the selected location based on the container type.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Container Barcode and Position */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Container Barcode (Optional)
                </label>
                <input
                  type="text"
                  value={formData.containerBarcode}
                  onChange={(e) => setFormData({ ...formData, containerBarcode: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Position (Optional)
                </label>
                <input
                  type="text"
                  value={formData.position}
                  onChange={(e) => setFormData({ ...formData, position: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={loading}
                  placeholder="e.g., A01"
                />
              </div>
            </div>

            {/* Derivation Date */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Derivation Date
              </label>
              <input
                type="date"
                value={formData.derivationDate}
                onChange={(e) => setFormData({ ...formData, derivationDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
              />
            </div>

            {/* Protocol */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Protocol (Optional)
              </label>
              <input
                type="text"
                value={formData.protocol}
                onChange={(e) => setFormData({ ...formData, protocol: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
                placeholder="Protocol name or reference"
              />
            </div>

            {/* Notes */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Notes (Optional)
              </label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={loading}
                placeholder="Additional notes..."
              />
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-3 pt-4 border-t">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
                disabled={loading}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? 'Creating...' : 'Create Derivation'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

