import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { collectionsApi, locationsApi, type Location } from '../lib/api'
import CollectionTreePicker from '../components/CollectionTreePicker'

interface Paper {
  id: number
  label: string
  container?: {
    specimenId?: number
    state?: { name: string }
    status?: { name: string }
  }
}

interface Sheet {
  id: number
  name: string
  papers: Paper[]
}

interface Collection {
  id: number
  name: string
  type: 'box' | 'bag'
  itemCount: number
  locationId?: number | null
  location?: {
    id: number
    path: string
  } | null
}

type Step = 'select-source' | 'select-sheets' | 'select-destination' | 'confirm' | 'execute'

export default function ContainerMovePapers() {
  const [currentStep, setCurrentStep] = useState<Step>('select-source')

  const [loading, setLoading] = useState(false)
  const [locations, setLocations] = useState<Location[]>([])
  const [sourceCollectionType, setSourceCollectionType] = useState<'box' | 'bag' | null>(null)
  const [sourceCollectionId, setSourceCollectionId] = useState<number | null>(null)
  const [sourceCollectionName, setSourceCollectionName] = useState<string>('')
  const [sheets, setSheets] = useState<Sheet[]>([])
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<number>>(new Set())
  const [sheetSearch, setSheetSearch] = useState<string>('')
  const [destinationCollectionType, setDestinationCollectionType] = useState<'box' | 'bag' | null>(null)
  const [destinationCollectionId, setDestinationCollectionId] = useState<number | null>(null)
  const [destinationCollectionName, setDestinationCollectionName] = useState<string>('')
  const [availableBoxes, setAvailableBoxes] = useState<Collection[]>([])
  const [availableBags, setAvailableBags] = useState<Collection[]>([])
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    error?: string
    movedSheets?: Sheet[]
  } | null>(null)

  // Load available collections and locations
  useEffect(() => {
    Promise.all([
      collectionsApi.listCollectionsByType('box'),
      collectionsApi.listCollectionsByType('bag'),
      locationsApi.list(),
    ]).then(([boxesRes, bagsRes, locationsRes]) => {
      // Ensure we're accessing the correct response structure
      const boxes = boxesRes.data?.collections || []
      const bags = bagsRes.data?.collections || []
      setLocations(locationsRes.data?.locations || [])

      setAvailableBoxes(
        boxes.map((c: any) => {
          // Handle case where name might be null, undefined, or actually be the ID
          const name = (c.name && typeof c.name === 'string' && c.name.trim() !== '')
            ? c.name
            : `Box #${c.id}`
          return {
            id: c.id,
            name,
            type: 'box' as const,
            itemCount: c.itemCount || 0,
            locationId: c.locationId,
            location: c.location,
          }
        })
      )
      setAvailableBags(
        bags.map((c: any) => {
          // Handle case where name might be null, undefined, or actually be the ID
          const name = (c.name && typeof c.name === 'string' && c.name.trim() !== '')
            ? c.name
            : `Bag #${c.id}`
          return {
            id: c.id,
            name,
            type: 'bag' as const,
            itemCount: c.itemCount || 0,
            locationId: c.locationId,
            location: c.location,
          }
        })
      )
    }).catch((error) => {
      console.error('Failed to load collections:', error)
    })
  }, [])

  // Load sheets when source collection is selected
  useEffect(() => {
    if (sourceCollectionId && sourceCollectionType && currentStep === 'select-sheets') {
      setLoading(true)
      const fetchSheets = async () => {
        try {
          let response
          if (sourceCollectionType === 'box') {
            response = await collectionsApi.getBox(sourceCollectionId)
          } else {
            response = await collectionsApi.getBag(sourceCollectionId)
          }

          let sheets: Sheet[] = []
          if ((response.data.contents as any)?.sheets) {
            sheets = (response.data.contents as any).sheets.map((s: any) => ({
              id: s.id,
              name: s.name,
              papers: (s.papers || []).map((p: any) => ({
                id: p.id,
                label: p.position || `Spot #${p.id}`,
                container: p.container
              }))
            }))
          }
          setSheets(sheets)
        } catch (error: any) {
          console.error('Failed to load sheets:', error)
        } finally {
          setLoading(false)
        }
      }
      fetchSheets()
    }
  }, [sourceCollectionId, sourceCollectionType, currentStep])

  const handleSourceCollectionSelect = (type: 'box' | 'bag', id: number, name: string) => {
    setSourceCollectionType(type)
    setSourceCollectionId(id)
    setSourceCollectionName(name)
    setSelectedSheetIds(new Set())
    setSheets([])
    setCurrentStep('select-sheets')
  }

  const handleSheetToggle = (sheetId: number) => {
    const newSelected = new Set(selectedSheetIds)
    if (newSelected.has(sheetId)) {
      newSelected.delete(sheetId)
    } else {
      newSelected.add(sheetId)
    }
    setSelectedSheetIds(newSelected)
  }

  const handleSelectAll = () => {
    if (selectedSheetIds.size === sheets.length) {
      setSelectedSheetIds(new Set())
    } else {
      setSelectedSheetIds(new Set(sheets.map(s => s.id)))
    }
  }

  const handleDestinationSelect = (type: 'box' | 'bag', id: number) => {
    const destination = availableBoxes.concat(availableBags).find(c => c.id === id)
    setDestinationCollectionType(type)
    setDestinationCollectionId(id)
    setDestinationCollectionName(destination?.name || '')
    setCurrentStep('confirm')
  }

  const handleExecuteMove = async (destType: 'box' | 'bag', destId: number) => {
    if (!sourceCollectionId || !sourceCollectionType || selectedSheetIds.size === 0) {
      return
    }

    setLoading(true)
    setMoveResult(null)

    try {
      const movedSheets = sheets.filter(s => selectedSheetIds.has(s.id))
      const response = await collectionsApi.moveSheets({
        sheetIds: Array.from(selectedSheetIds),
        targetCollectionId: destId,
        targetCollectionType: destType,
      })

      if (response.data.success) {
        setMoveResult({
          success: true,
          moved: response.data.moved,
          movedSheets,
        })
      } else {
        setMoveResult({
          success: false,
          moved: 0,
          error: 'Failed to move sheets',
        })
      }
    } catch (error: any) {
      setMoveResult({
        success: false,
        moved: 0,
        error: error.response?.data?.error || error.message || 'Failed to move sheets',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async () => {
    if (!moveResult?.success || !sourceCollectionId || !sourceCollectionType || !moveResult.movedSheets) {
      return
    }

    setLoading(true)
    try {
      const response = await collectionsApi.moveSheets({
        sheetIds: moveResult.movedSheets.map(s => s.id),
        targetCollectionId: sourceCollectionId,
        targetCollectionType: sourceCollectionType,
      })

      if (response.data.success) {
        // Reset to start over
        handleStartOver()
      } else {
        setMoveResult({
          ...moveResult,
          success: false,
          error: 'Failed to undo move',
        })
      }
    } catch (error: any) {
      setMoveResult({
        ...moveResult,
        success: false,
        error: error.response?.data?.error || error.message || 'Failed to undo move',
      })
    } finally {
      setLoading(false)
    }
  }

  const handleStartOver = () => {
    setCurrentStep('select-source')
    setSourceCollectionType(null)
    setSourceCollectionId(null)
    setSourceCollectionName('')
    setSheets([])
    setSelectedSheetIds(new Set())
    setSheetSearch('')
    setDestinationCollectionType(null)
    setDestinationCollectionId(null)
    setDestinationCollectionName('')
    setMoveResult(null)
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Papers</h1>

        {/* Step indicator */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep === 'select-source' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'select-source' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2">Choose Source</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'select-sheets' ? 'text-blue-600 font-semibold' : ['select-source'].includes(currentStep) ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'select-sheets' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2">Select Sheets</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'select-destination' ? 'text-blue-600 font-semibold' : ['select-source', 'select-sheets'].includes(currentStep) ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'select-destination' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2">Choose Destination</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'confirm' ? 'text-blue-600 font-semibold' : ['select-source', 'select-sheets', 'select-destination'].includes(currentStep) ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'confirm' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                4
              </div>
              <span className="ml-2">Review & Confirm</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'execute' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'execute' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                5
              </div>
              <span className="ml-2">Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Choose Source Collection */}
        {currentStep === 'select-source' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Choose Source Collection</h2>
              <p className="text-gray-700 mb-6">
                Select the box or bag containing the sheets you want to move.
              </p>

              <CollectionTreePicker
                locations={locations}
                collections={availableBoxes
                  .concat(availableBags)
                  .filter((c) => c.itemCount > 0)}
                onSelect={handleSourceCollectionSelect}
                loading={loading}
                filterEmptyLocations={true}
              />
            </div>
          </>
        )}

        {/* Step 2: Select Sheets */}
        {currentStep === 'select-sheets' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Select Sheets to Move</h2>
                <p className="text-sm text-gray-600 mt-1">
                  Source: {sourceCollectionName} ({sourceCollectionType})
                </p>
              </div>

              {loading ? (
                <div className="text-center py-8">Loading sheets...</div>
              ) : sheets.length === 0 ? (
                <p className="text-sm text-gray-500">No sheets in this collection.</p>
              ) : (
                <>
                  {/* Search Input */}
                  <div className="mb-4">
                    <input
                      type="text"
                      value={sheetSearch}
                      onChange={(e) => setSheetSearch(e.target.value)}
                      placeholder="Search sheets by name..."
                      className="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                  </div>

                  {/* Filtered Sheets Grid */}
                  {(() => {
                    const filteredSheets = sheets.filter((sheet) => {
                      if (!sheetSearch.trim()) return true
                      return sheet.name.toLowerCase().includes(sheetSearch.toLowerCase())
                    })

                    const allFilteredSelected = filteredSheets.length > 0 && filteredSheets.every(s => selectedSheetIds.has(s.id))

                    return (
                      <>
                        {filteredSheets.length === 0 ? (
                          <p className="text-sm text-gray-500 text-center py-8">
                            No sheets match "{sheetSearch}"
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-xs text-gray-500">
                                Showing {filteredSheets.length} of {sheets.length} sheet{sheets.length !== 1 ? 's' : ''}
                              </div>
                              <button
                                onClick={() => {
                                  if (allFilteredSelected) {
                                    // Deselect all filtered sheets
                                    const newSelected = new Set(selectedSheetIds)
                                    filteredSheets.forEach(s => newSelected.delete(s.id))
                                    setSelectedSheetIds(newSelected)
                                  } else {
                                    // Select all filtered sheets
                                    const newSelected = new Set(selectedSheetIds)
                                    filteredSheets.forEach(s => newSelected.add(s.id))
                                    setSelectedSheetIds(newSelected)
                                  }
                                }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                              >
                                {allFilteredSelected ? 'Deselect All Visible' : 'Select All Visible'}
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                              {filteredSheets.map((sheet) => {
                                const isSelected = selectedSheetIds.has(sheet.id)
                                return (
                                  <label
                                    key={sheet.id}
                                    className={`flex items-center gap-2 p-2 border rounded cursor-pointer transition-colors ${isSelected
                                        ? 'bg-blue-50 border-blue-300'
                                        : 'hover:border-blue-200 hover:bg-gray-50'
                                      }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSheetToggle(sheet.id)}
                                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-gray-900 truncate">
                                        {sheet.name}
                                      </div>
                                      <div className="text-xs text-gray-500">
                                        {sheet.papers.length} paper{sheet.papers.length !== 1 ? 's' : ''}
                                      </div>
                                    </div>
                                  </label>
                                )
                              })}
                            </div>
                          </>
                        )}
                      </>
                    )
                  })()}
                </>
              )}

              {/* Compact Selection Summary */}
              {selectedSheetIds.size > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-700">
                      <span className="font-medium text-blue-600">{selectedSheetIds.size}</span> sheet{selectedSheetIds.size !== 1 ? 's' : ''} selected
                    </p>
                    <button
                      onClick={() => setCurrentStep('select-destination')}
                      className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
                    >
                      Continue →
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  setSheetSearch('')
                  setCurrentStep('select-source')
                }}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep('select-destination')}
                disabled={selectedSheetIds.size === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Next: Select Destination
              </button>
            </div>
          </>
        )}

        {/* Step 3: Choose Destination Collection */}
        {currentStep === 'select-destination' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Choose Destination Collection</h2>
              <p className="text-gray-700 mb-6">
                Select where to move the {selectedSheetIds.size} selected sheet{selectedSheetIds.size !== 1 ? 's' : ''}.
              </p>

              <CollectionTreePicker
                locations={locations}
                collections={availableBoxes.concat(availableBags)}
                onSelect={(type, id) => handleDestinationSelect(type, id)}
                disabledId={sourceCollectionId!}
                disabledType={sourceCollectionType!}
                loading={loading}
                filterEmptyLocations={true}
              />
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('select-sheets')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* Step 4: Review & Confirm */}
        {currentStep === 'confirm' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Review & Confirm Move</h2>
              <p className="text-gray-700 mb-6">
                Please review the move details below before confirming.
              </p>

              {(() => {
                const destination = availableBoxes.concat(availableBags).find(
                  c => c.id === destinationCollectionId && c.type === destinationCollectionType
                )
                const isValid = destination !== undefined && selectedSheetIds.size > 0

                return (
                  <>
                    <div className="space-y-6">
                      {/* Source Collection */}
                      <div className="border-l-4 border-blue-500 pl-4">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Source Collection
                        </h3>
                        <div className="text-lg font-medium text-gray-900">
                          {sourceCollectionName}
                        </div>
                        <div className="text-sm text-gray-600 mt-1">
                          Type: {sourceCollectionType}
                        </div>
                      </div>

                      {/* Selected Sheets */}
                      <div className="border-l-4 border-green-500 pl-4">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Sheets to Move ({selectedSheetIds.size})
                        </h3>
                        <div className="space-y-2">
                          {sheets
                            .filter(s => selectedSheetIds.has(s.id))
                            .map((sheet) => (
                              <div key={sheet.id} className="bg-gray-50 rounded p-3">
                                <div className="font-medium text-gray-900">{sheet.name}</div>
                                <div className="text-xs text-gray-600 mt-1">
                                  {sheet.papers.length} paper{sheet.papers.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Destination Collection */}
                      <div className="border-l-4 border-purple-500 pl-4">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                          Destination Collection
                        </h3>
                        {destination ? (
                          <>
                            <div className="text-lg font-medium text-gray-900">
                              {destinationCollectionName}
                            </div>
                            <div className="text-sm text-gray-600 mt-1">
                              Type: {destinationCollectionType}
                            </div>
                          </>
                        ) : (
                          <div className="text-red-600 font-medium">
                            ⚠️ Destination collection not found. Please go back and select a valid destination.
                          </div>
                        )}
                      </div>

                      {/* Validation Status */}
                      {isValid ? (
                        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-blue-900">
                                Move is valid and ready to execute
                              </p>
                              <p className="text-xs text-blue-700 mt-1">
                                All {selectedSheetIds.size} selected sheet{selectedSheetIds.size !== 1 ? 's' : ''} will be moved from {sourceCollectionName} to {destinationCollectionName}.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-red-600 mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-red-900">
                                Move cannot be completed
                              </p>
                              <p className="text-xs text-red-700 mt-1">
                                {!destination ? 'Destination collection is invalid or no longer available.' : 'No sheets selected for move.'}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-4 mt-6">
                      <button
                        onClick={() => setCurrentStep('select-destination')}
                        className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                      >
                        Back
                      </button>
                      <button
                        onClick={() => {
                          if (isValid && destinationCollectionType && destinationCollectionId) {
                            setCurrentStep('execute')
                            handleExecuteMove(destinationCollectionType, destinationCollectionId)
                          }
                        }}
                        disabled={!isValid}
                        className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                      >
                        Confirm Move
                      </button>
                    </div>
                  </>
                )
              })()}
            </div>
          </>
        )}

        {/* Step 5: Complete/Results */}
        {currentStep === 'execute' && (
          <>
            {loading ? (
              <div className="bg-white rounded-lg shadow p-6 mb-6">
                <div className="text-center py-8">
                  <p className="text-gray-700">Moving sheets...</p>
                </div>
              </div>
            ) : moveResult ? (
              <>
                {moveResult.success ? (
                  <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Move Completed Successfully</h2>
                        <p className="text-gray-600 mt-1">
                          {moveResult.moved} sheet{moveResult.moved !== 1 ? 's' : ''} moved successfully
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 border-t pt-6">
                      {/* Source Collection */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          From
                        </h3>
                        <Link
                          to={`/collections/${sourceCollectionType === 'box' ? 'boxes' : 'bags'}/${sourceCollectionId}`}
                          className="inline-flex items-center px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors group"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-blue-900 group-hover:text-blue-700">
                              {sourceCollectionName}
                            </div>
                            <div className="text-sm text-blue-600 mt-0.5">
                              {sourceCollectionType === 'box' ? 'Box' : 'Bag'} • View collection →
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-blue-600 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>

                      {/* Moved Sheets */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          Sheets Moved ({moveResult.movedSheets?.length || 0})
                        </h3>
                        <div className="space-y-2">
                          {moveResult.movedSheets?.map((sheet) => (
                            <div key={sheet.id} className="px-4 py-3 bg-gray-50 border border-gray-100 rounded-lg">
                              <div className="font-medium text-gray-900">{sheet.name}</div>
                              <div className="text-xs text-gray-600 mt-1">
                                {sheet.papers.length} paper{sheet.papers.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Destination Collection */}
                      <div>
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">
                          To
                        </h3>
                        <Link
                          to={`/collections/${destinationCollectionType === 'box' ? 'boxes' : 'bags'}/${destinationCollectionId}`}
                          className="inline-flex items-center px-4 py-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors group"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-purple-900 group-hover:text-purple-700">
                              {destinationCollectionName}
                            </div>
                            <div className="text-sm text-purple-600 mt-0.5">
                              {destinationCollectionType === 'box' ? 'Box' : 'Bag'} • View collection →
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-purple-600 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-lg shadow p-6 mb-6">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900">Move Failed</h2>
                        <p className="text-red-600 mt-1">{moveResult.error || 'An error occurred'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-4">
                  {moveResult.success && (
                    <button
                      onClick={handleUndo}
                      disabled={loading}
                      className="px-6 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 font-medium disabled:bg-gray-400 disabled:cursor-not-allowed"
                    >
                      {loading ? 'Undoing...' : 'Undo Move'}
                    </button>
                  )}
                  <button
                    onClick={handleStartOver}
                    className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
                  >
                    Start New Move
                  </button>
                </div>
              </>
            ) : null}
          </>
        )}
      </div>
    </div>
  )
}

