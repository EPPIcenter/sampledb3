import { useState, useEffect } from 'react'
import { collectionsApi, locationsApi, type Location } from '../lib/api'
import CollectionMoveTreePicker, { type Collection } from '../components/CollectionMoveTreePicker'
import LocationTreePicker, { type LocationSelection } from '../components/LocationTreePicker'

type CollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag'
type Step = 'select-collections' | 'select-destination' | 'confirm' | 'execute'

export default function CollectionMove() {
  const [currentStep, setCurrentStep] = useState<Step>('select-collections')
  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [collections, setCollections] = useState<Collection[]>([])
  const [selectedCollectionIds, setSelectedCollectionIds] = useState<Set<number>>(new Set())
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

  const handleCollectionToggle = (id: number) => {
    const newSelected = new Set(selectedCollectionIds)
    if (newSelected.has(id)) {
      newSelected.delete(id)
    } else {
      newSelected.add(id)
    }
    setSelectedCollectionIds(newSelected)
  }

  const handleSelectAll = () => {
    setSelectedCollectionIds(new Set(collections.map((c) => c.id)))
  }

  const handleDeselectAll = () => {
    setSelectedCollectionIds(new Set())
  }

  const handleSelectAllAtLocation = (locationId: number) => {
    const collectionsAtLocation = collections.filter((c) => c.locationId === locationId)
    const allSelected = collectionsAtLocation.every((c) => selectedCollectionIds.has(c.id))
    
    const newSelected = new Set(selectedCollectionIds)
    if (allSelected) {
      // Deselect all at this location
      collectionsAtLocation.forEach((c) => newSelected.delete(c.id))
    } else {
      // Select all at this location
      collectionsAtLocation.forEach((c) => newSelected.add(c.id))
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
      // Group selected collections by type
      const collectionsByType = new Map<CollectionType, Array<{ id: number; collection: Collection }>>()
      
      Array.from(selectedCollectionIds).forEach((id) => {
        const collection = collections.find((c) => c.id === id)
        if (collection) {
          if (!collectionsByType.has(collection.type)) {
            collectionsByType.set(collection.type, [])
          }
          collectionsByType.get(collection.type)!.push({ id, collection })
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
          allErrors.push({
            row: allErrors.length,
            error: error.response?.data?.error || error.message || `Failed to move ${collectionType} collections`,
          })
        }
      }

      setMoveResult({
        success: allSuccess,
        moved: totalMoved,
        errors: allErrors.length > 0 ? allErrors : undefined,
      })
      setCurrentStep('execute')
    } catch (error: any) {
      setMoveResult({
        success: false,
        moved: 0,
        errors: [
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
    setSelectedCollectionIds(new Set())
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Collections</h1>

        {/* Step indicator */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div
              className={`flex items-center ${
                currentStep === 'select-collections' ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === 'select-collections' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                1
              </div>
              <span className="ml-2">Select Collections</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div
              className={`flex items-center ${
                currentStep === 'select-destination'
                  ? 'text-blue-600 font-semibold'
                  : currentStep === 'select-collections'
                  ? 'text-gray-500'
                  : 'text-gray-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === 'select-destination' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                2
              </div>
              <span className="ml-2">Choose Destination</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div
              className={`flex items-center ${
                currentStep === 'confirm'
                  ? 'text-blue-600 font-semibold'
                  : ['select-collections', 'select-destination'].includes(currentStep)
                  ? 'text-gray-500'
                  : 'text-gray-400'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === 'confirm' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                3
              </div>
              <span className="ml-2">Review & Confirm</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div
              className={`flex items-center ${
                currentStep === 'execute' ? 'text-blue-600 font-semibold' : 'text-gray-500'
              }`}
            >
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  currentStep === 'execute' ? 'bg-blue-600 text-white' : 'bg-gray-200'
                }`}
              >
                4
              </div>
              <span className="ml-2">Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Select Collections */}
        {currentStep === 'select-collections' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
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
                selectedIds={selectedCollectionIds}
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Choose Destination Location</h2>
            <p className="text-gray-700 mb-6">
              Select the target location where the collections will be moved.
            </p>

            <LocationTreePicker
              selected={
                targetLocationId
                  ? [
                      {
                        locationId: targetLocationId,
                        path: targetLocationPath,
                        name: locations.find(l => l.id === targetLocationId)?.name || '',
                      },
                    ]
                  : []
              }
              onChange={handleDestinationSelect}
              filterCollectionsOnly={true}
            />
          </div>
        )}

        {/* Step 3: Confirm */}
        {currentStep === 'confirm' && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-xl font-semibold mb-4">Review & Confirm</h2>

            <div className="space-y-4">
              <div>
                <h3 className="font-medium text-gray-700 mb-2">Collections to Move:</h3>
                <ul className="list-disc list-inside text-sm text-gray-600 space-y-1">
                  {Array.from(selectedCollectionIds).map((id) => {
                    const collection = collections.find((c) => c.id === id)
                    if (!collection) return null
                    return (
                      <li key={id}>
                        {collection.name} <span className="text-gray-500">({getCollectionTypeLabel(collection.type)})</span>
                        {collection.location?.path && (
                          <span className="text-gray-400"> - {collection.location.path}</span>
                        )}
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
                <p className="text-sm text-gray-600">{targetLocationPath || `Location ID: ${targetLocationId}`}</p>
              </div>
            </div>

            <div className="mt-6 flex gap-3 justify-end">
              <button
                onClick={() => setCurrentStep('select-destination')}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleExecuteMove}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Moving...' : 'Confirm & Move'}
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Results */}
        {currentStep === 'execute' && moveResult && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
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
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                Move More Collections
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

