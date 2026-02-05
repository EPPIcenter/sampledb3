import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { collectionsApi, locationsApi, type Location } from '../lib/api'
import CollectionMoveTreePicker, { type Collection } from '../components/CollectionMoveTreePicker'
import LocationTreePicker, { type LocationSelection } from '../components/LocationTreePicker'
import { useUser } from '../contexts/UserContext'
import '../styles/storage.css'

export type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
type Step = 'select-collections' | 'select-destination' | 'confirm' | 'execute'

function toKey(c: { type: CollectionType; id: number }): string {
  return `${c.type}:${c.id}`
}

function fromKey(key: string): { type: CollectionType; id: number } {
  const [type, idStr] = key.split(':')
  return { type: type as CollectionType, id: Number(idStr) }
}

export default function CollectionMove() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [currentStep, setCurrentStep] = useState<Step>('select-collections')
  
  // Redirect if user doesn't have write permissions
  useEffect(() => {
    if (!canWrite) {
      navigate('/', { replace: true })
    }
  }, [canWrite, navigate])
  
  if (!canWrite) {
    return null
  }
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<string>>(new Set())
  const [targetLocationId, setTargetLocationId] = useState<number | null>(null)
  const [targetLocationPath, setTargetLocationPath] = useState<string>('')
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    errors?: Array<{ row: number; error: string }>
  } | null>(null)

  // Load locations
  useEffect(() => {
    const loadLocations = async () => {
      try {
        const response = await locationsApi.list()
        setLocations(response.data.locations || [])
      } catch (error) {
        console.error('Failed to load locations:', error)
      }
    }
    loadLocations()
  }, [])

  // Load collections on mount
  useEffect(() => {
    if (currentStep === 'select-collections') {
      loadCollections()
    }
  }, [currentStep])

  const loadCollections = async () => {
    setLoading(true)
    try {
      // Use optimized endpoint that loads all collections in a single request
      const response = await collectionsApi.listAllCollections()
      const collectionsData = response.data?.collections || []

      const allCollections: Collection[] = collectionsData.map((c: any) => ({
        id: c.id,
        name: c.name,
        type: c.type,
        itemCount: c.itemCount || 0,
        locationId: c.locationId,
        location: c.location
          ? {
              id: c.location.id,
              path: c.location.path || '',
            }
          : null,
        barcode: c.barcode || null,
      }))

      setCollections(allCollections)
    } catch (error) {
      console.error('Failed to load collections:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCollectionToggle = (id: number, type: CollectionType) => {
    const key = toKey({ type, id })
    const newSelected = new Set(selectedCollectionIds)
    if (newSelected.has(key)) {
      newSelected.delete(key)
    } else {
      newSelected.add(key)
    }
    setSelectedCollectionIds(newSelected)
  }

  const handleSelectAll = () => {
    setSelectedCollectionIds(new Set(collections.map((c) => toKey(c))))
  }

  const handleDeselectAll = () => {
    setSelectedCollectionIds(new Set())
  }

  const handleSelectAllAtLocation = (locationId: number) => {
    const collectionsAtLocation = collections.filter((c) => c.locationId === locationId)
    const allSelected = collectionsAtLocation.every((c) => selectedCollectionIds.has(toKey(c)))
    
    const newSelected = new Set(selectedCollectionIds)
    if (allSelected) {
      collectionsAtLocation.forEach((c) => newSelected.delete(toKey(c)))
    } else {
      collectionsAtLocation.forEach((c) => newSelected.add(toKey(c)))
    }
    setSelectedCollectionIds(newSelected)
  }

  const handleDestinationSelect = (selections: LocationSelection[]) => {
    if (selections.length === 0) {
      setTargetLocationId(null)
      setTargetLocationPath('')
      return
    }

    // Use the last selection (most specific)
    const selection = selections[selections.length - 1]
    if (selection.locationId) {
      // Find the location to get its path
      const location = locations.find((loc) => loc.id === selection.locationId)
      if (location) {
        setTargetLocationId(selection.locationId)
        setTargetLocationPath(location.path || selection.path || location.name)
        setCurrentStep('confirm')
      }
    }
  }

  const handleExecuteMove = async () => {
    if (selectedCollectionIds.size === 0 || !targetLocationId) {
      return
    }

    setLoading(true)
    setMoveResult(null)

    try {
      // Group selected collections by type (each key is "type:id")
      const collectionsByType = new Map<CollectionType, Array<{ id: number; collection: Collection }>>()
      
      Array.from(selectedCollectionIds).forEach((key) => {
        const { type, id } = fromKey(key)
        const collection = collections.find((c) => c.type === type && c.id === id)
        if (collection) {
          if (!collectionsByType.has(type)) {
            collectionsByType.set(type, [])
          }
          collectionsByType.get(type)!.push({ id, collection })
        }
      })

      // Execute moves for each type
      const allErrors: Array<{ row: number; error: string }> = []
      let totalMoved = 0
      let allSuccess = true

      for (const [collectionType, typeCollections] of collectionsByType.entries()) {
        const moves = typeCollections.map(({ id }) => ({
          identifier: {
            type: 'id' as const,
            id,
          },
          targetLocationId,
        }))

        try {
          const response = await collectionsApi.moveCollections({
            collectionType,
            moves,
          })

          if (response.data.success) {
            totalMoved += response.data.moved
          } else {
            allSuccess = false
            totalMoved += response.data.moved || 0
            if (response.data.errors) {
              // Adjust row numbers to account for previous moves
              const baseRow = allErrors.length
              allErrors.push(
                ...response.data.errors.map((err) => ({
                  row: err.row + baseRow,
                  error: err.error,
                }))
              )
            }
          }
        } catch (error: any) {
          allSuccess = false
          const apiErrors = error.response?.data?.errors
          if (Array.isArray(apiErrors) && apiErrors.length > 0) {
            const baseRow = allErrors.length
            apiErrors.forEach((e: { row: number; error: string }) => {
              allErrors.push({ row: baseRow + e.row, error: e.error })
            })
          } else {
            allErrors.push({
              row: allErrors.length,
              error: error.response?.data?.error || error.message || `Failed to move ${collectionType} collections`,
            })
          }
        }
      }

      setMoveResult({
        success: allSuccess,
        moved: totalMoved,
        errors: allErrors.length > 0 ? allErrors : undefined,
      })
      setCurrentStep('execute')
    } catch (error: any) {
      const apiErrors = error.response?.data?.errors
      setMoveResult({
        success: false,
        moved: 0,
        errors:
          Array.isArray(apiErrors) && apiErrors.length > 0
            ? apiErrors.map((e: { row: number; error: string }) => ({ row: e.row, error: e.error }))
            : [
                {
                  row: 0,
                  error: error.response?.data?.error || error.message || 'Failed to move collections',
                },
              ],
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStartOver = () => {
    setCurrentStep('select-collections')
    setSelectedCollectionIds(new Set<string>())
    setTargetLocationId(null)
    setTargetLocationPath('')
    setMoveResult(null)
    // Reload collections
    loadCollections()
  }

  const getCollectionTypeLabel = (type: CollectionType) => {
    switch (type) {
      case 'micronix_plate':
        return 'Micronix Plates'
      case 'cryovial_box':
        return 'Cryovial Boxes'
      case 'box':
        return 'Boxes'
      case 'bag':
        return 'Bags'
    }
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Collections</h1>

        {/* Step indicator */}
        <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
          <div className="storage-step-indicator">
            <div className={`storage-step-item ${currentStep === 'select-collections' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">1</span>
              <span>Select Collections</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'select-destination' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">2</span>
              <span>Choose Destination</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'confirm' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">3</span>
              <span>Review & Confirm</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'execute' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">4</span>
              <span>Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Select Collections */}
        {currentStep === 'select-collections' && (
          <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Select Collections to Move</h2>
              <p className="text-sm text-gray-600 mt-1">
                Select any collections you want to move together, regardless of type.
              </p>
            </div>

            {loading ? (
              <div className="text-center py-8">Loading collections...</div>
            ) : collections.length === 0 ? (
              <p className="text-sm text-gray-500">No collections of this type found.</p>
            ) : (
              <CollectionMoveTreePicker
                locations={locations}
                collections={collections}
                selectedKeys={selectedCollectionIds}
                onToggle={handleCollectionToggle}
                onSelectAll={handleSelectAll}
                onDeselectAll={handleDeselectAll}
                onSelectAllAtLocation={handleSelectAllAtLocation}
                loading={loading}
                filterEmptyLocations={true}
              />
            )}

            {selectedCollectionIds.size > 0 && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => setCurrentStep('select-destination')}
                  className="storage-btn-primary"
                >
                  Continue with {selectedCollectionIds.size} collection
                  {selectedCollectionIds.size !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 2: Select Destination Location */}
        {currentStep === 'select-destination' && (
          <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
            <h2 className="text-xl font-semibold mb-4">Choose Destination Location</h2>
            <p className="text-gray-700 mb-6">
              Select the target location where the collections will be moved.
            </p>

            <LocationTreePicker
              selected={
                targetLocationId
                  ? (() => {
                      const loc = locations.find(l => l.id === targetLocationId)
                      return [
                        {
                          locationId: targetLocationId,
                          path: targetLocationPath,
                          name: loc?.name || '',
                          effectiveStorageTypeName: loc?.effectiveStorageTypeName ?? loc?.storageTypeName ?? null,
                        },
                      ]
                    })()
                  : []
              }
              onChange={handleDestinationSelect}
              filterCollectionsOnly={true}
            />
          </div>
        )}

        {/* Step 3: Confirm */}
        {currentStep === 'confirm' && (
          <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
            <h2 className="text-xl font-semibold mb-4">Review & Confirm</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Collections to Move:</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {Array.from(selectedCollectionIds).map((key) => {
                    const { type, id } = fromKey(key)
                    const collection = collections.find((c) => c.type === type && c.id === id)
                    if (!collection) return null
                    const collectionLoc = collection.locationId ? locations.find(l => l.id === collection.locationId) : null
                    const storageTypeLabel = collectionLoc?.effectiveStorageTypeName || collectionLoc?.storageTypeName
                    const locationDisplay = collection.location?.path
                      ? (storageTypeLabel ? ` - ${collection.location.path} (${storageTypeLabel})` : ` - ${collection.location.path}`)
                      : ''
                    return (
                      <li key={key}>
                        {collection.name} <span className="text-gray-500">({getCollectionTypeLabel(collection.type)})</span>
                        {locationDisplay && <span className="text-gray-400">{locationDisplay}</span>}
                      </li>
                    )
                  })}
                </ul>
                <p className="text-xs text-gray-500 mt-2">
                  Total: {selectedCollectionIds.size} collection
                  {selectedCollectionIds.size !== 1 ? 's' : ''}
                </p>
              </div>

              <div>
                <h3 className="font-medium text-gray-700 mb-2">Destination Location:</h3>
                {(() => {
                  const destLoc = targetLocationId ? locations.find(l => l.id === targetLocationId) : null
                  if (!destLoc) {
                    return <p className="text-sm text-gray-600">{targetLocationPath || `Location ID: ${targetLocationId}`}</p>
                  }
                  const storageTypeLabel = destLoc.effectiveStorageTypeName || destLoc.storageTypeName
                  return (
                    <div className="text-sm text-gray-600 space-y-1">
                      <p className="font-medium">{destLoc.path || destLoc.name}</p>
                      {storageTypeLabel && (
                        <p className="text-gray-500">Storage type: {storageTypeLabel}</p>
                      )}
                      {destLoc.description && (
                        <p className="text-gray-500 truncate max-w-xl" title={destLoc.description}>{destLoc.description}</p>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setCurrentStep('select-destination')}
                className="storage-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleExecuteMove}
                disabled={loading}
                className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Moving...' : 'Confirm & Move'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {currentStep === 'execute' && moveResult && (
          <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
            {moveResult.success ? (
              <>
                <div className="mb-4">
                  <div className="flex items-center text-green-600 mb-2">
                    <svg
                      className="w-6 h-6 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <h2 className="text-xl font-semibold">Move Completed Successfully</h2>
                  </div>
                  <p className="text-gray-700">
                    Successfully moved {moveResult.moved} collection
                    {moveResult.moved !== 1 ? 's' : ''} to {targetLocationPath || `location ${targetLocationId}`}.
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="mb-4">
                  <div className="flex items-center text-red-600 mb-2">
                    <svg
                      className="w-6 h-6 mr-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                    <h2 className="text-xl font-semibold">Move Failed</h2>
                  </div>
                  <p className="text-gray-700 mb-4">
                    {moveResult.moved > 0
                      ? `Moved ${moveResult.moved} collection${moveResult.moved !== 1 ? 's' : ''}, but some errors occurred.`
                      : 'Failed to move collections.'}
                  </p>
                  {moveResult.errors && moveResult.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded p-4">
                      <h3 className="font-medium text-red-800 mb-2">Errors:</h3>
                      <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                        {moveResult.errors.map((error, idx) => (
                          <li key={idx}>
                            Row {error.row + 1}: {error.error}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </>
            )}

            <div className="mt-6">
              <button
                onClick={handleStartOver}
                className="storage-btn-primary"
              >
                Move More Collections
              </button>
            </div>
          </div>
        )}
      </div>
      </div>
    </div>
  )
}

