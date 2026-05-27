import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { collectionsApi } from '../lib/api/collections'
import CollectionTreePicker from '../components/CollectionTreePicker'
import { useUser } from '../contexts/UserContext'
import { usePaperMoveBootstrap, usePaperMoveSheets } from '../hooks/useMoveWorkflow'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/storage.css'

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
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [currentStep, setCurrentStep] = useState<Step>('select-source')
  const [mutating, setMutating] = useState(false)
  const bootstrapQuery = usePaperMoveBootstrap()
  const bootstrapStatus = fromQuery(bootstrapQuery)
  const locations = bootstrapQuery.data?.locations ?? []
  const availableBoxes = bootstrapQuery.data?.boxes ?? []
  const availableBags = bootstrapQuery.data?.bags ?? []
  const [sourceCollectionType, setSourceCollectionType] = useState<'box' | 'bag' | null>(null)
  const [sourceCollectionId, setSourceCollectionId] = useState<number | null>(null)
  const [sourceCollectionName, setSourceCollectionName] = useState<string>('')
  const sheetsQuery = usePaperMoveSheets(
    sourceCollectionType,
    sourceCollectionId,
    currentStep === 'select-sheets'
  )
  const sheets = (sheetsQuery.data ?? []) as Sheet[]
  const [selectedSheetIds, setSelectedSheetIds] = useState<Set<number>>(new Set())
  const [sheetSearch, setSheetSearch] = useState<string>('')
  const [destinationCollectionType, setDestinationCollectionType] = useState<'box' | 'bag' | null>(null)
  const [destinationCollectionId, setDestinationCollectionId] = useState<number | null>(null)
  const [destinationCollectionName, setDestinationCollectionName] = useState<string>('')
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    error?: string
    movedSheets?: Sheet[]
  } | null>(null)

  // Redirect if user doesn't have write permissions
  useEffect(() => {
    if (!canWrite) {
      navigate('/', { replace: true })
    }
  }, [canWrite, navigate])

  const handleSourceCollectionSelect = (type: 'box' | 'bag', id: number, name: string) => {
    setSourceCollectionType(type)
    setSourceCollectionId(id)
    setSourceCollectionName(name)
    setSelectedSheetIds(new Set())
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

  const handleDestinationSelect = (type: 'box' | 'bag', id: number, name?: string) => {
    setDestinationCollectionType(type)
    setDestinationCollectionId(id)
    setDestinationCollectionName(name ?? '')
    setCurrentStep('confirm')
  }

  const handleExecuteMove = async (destType: 'box' | 'bag', destId: number) => {
    if (!sourceCollectionId || !sourceCollectionType || selectedSheetIds.size === 0) {
      return
    }

    setMutating(true)
    setMoveResult(null)

    try {
      const movedSheets = sheets.filter(s => selectedSheetIds.has(s.id))
      const response = await collectionsApi.moveSheets({
        sheetIds: Array.from(selectedSheetIds),
        targetCollectionId: destId,
        targetCollectionType: destType,
      })

      if (response.success) {
        setMoveResult({
          success: true,
          moved: response.moved,
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
      setMutating(false)
    }
  }

  const handleUndo = async () => {
    if (!moveResult?.success || !sourceCollectionId || !sourceCollectionType || !moveResult.movedSheets) {
      return
    }

    setMutating(true)
    try {
      const response = await collectionsApi.moveSheets({
        sheetIds: moveResult.movedSheets.map(s => s.id),
        targetCollectionId: sourceCollectionId,
        targetCollectionType: sourceCollectionType,
      })

      if (response.success) {
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
      setMutating(false)
    }
  }

  const handleStartOver = () => {
    setCurrentStep('select-source')
    setSourceCollectionType(null)
    setSourceCollectionId(null)
    setSourceCollectionName('')
    setSelectedSheetIds(new Set())
    setSheetSearch('')
    setDestinationCollectionType(null)
    setDestinationCollectionId(null)
    setDestinationCollectionName('')
    setMoveResult(null)
  }

  if (!canWrite) {
    return null
  }

  const bootstrapLoading = bootstrapQuery.isPending

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Papers</h1>

        {bootstrapStatus === 'error' && (
          <PageError
            title="Could not load collections"
            message={getQueryErrorMessage(bootstrapQuery.error, 'Failed to load boxes, bags, and locations')}
            onRetry={() => void bootstrapQuery.refetch()}
          />
        )}

        {/* Step indicator */}
        <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
          <div className="storage-step-indicator">
            <div className={`storage-step-item ${currentStep === 'select-source' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">1</span>
              <span>Choose Source</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'select-sheets' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">2</span>
              <span>Select Sheets</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'select-destination' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">3</span>
              <span>Choose Destination</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'confirm' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">4</span>
              <span>Review & Confirm</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'execute' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">5</span>
              <span>Complete</span>
            </div>
          </div>
        </div>

        {/* Step 1: Choose Source Collection */}
        {bootstrapStatus !== 'error' && currentStep === 'select-source' && (
          <>
            <div className="storage-card p-6 mb-6 relative storage-reveal storage-reveal-2" style={{ isolation: 'isolate' }}>
              <h2 className="text-xl font-semibold mb-4">Choose Source Collection</h2>
              <p className="text-app-text mb-6">
                Select the box or bag containing the sheets you want to move.
              </p>

              {(() => {
                const allCollections = availableBoxes.concat(availableBags)
                const collectionsWithItems = allCollections.filter((c) => c.itemCount > 0)

                if (allCollections.length === 0 && !bootstrapLoading) {
                  return (
                    <div className="p-4 text-center text-app-text-muted">
                      <p>No collections found. Please create a box or bag first.</p>
                    </div>
                  )
                }
                
                if (collectionsWithItems.length === 0 && allCollections.length > 0) {
                  return (
                    <div className="p-4 text-center text-app-text-muted">
                      <p>No collections with sheets found. Collections need to contain at least one sheet to be used as a source.</p>
                      <p className="text-sm mt-2">Found {allCollections.length} collection{allCollections.length !== 1 ? 's' : ''} total, but none have sheets.</p>
                    </div>
                  )
                }

                return (
                  <CollectionTreePicker
                    locations={locations}
                    collections={collectionsWithItems}
                    onSelect={handleSourceCollectionSelect}
                    loading={bootstrapLoading}
                    filterEmptyLocations={true}
                  />
                )
              })()}
            </div>
          </>
        )}

        {/* Step 2: Select Sheets */}
        {bootstrapStatus !== 'error' && currentStep === 'select-sheets' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <div className="mb-4">
                <h2 className="text-xl font-semibold">Select Sheets to Move</h2>
                <p className="text-sm text-app-text-muted mt-1">
                  Source: {sourceCollectionName} ({sourceCollectionType})
                </p>
              </div>

              {sheetsQuery.isError ? (
                <PageError
                  title="Could not load sheets"
                  message={getQueryErrorMessage(sheetsQuery.error, 'Failed to load sheets')}
                  onRetry={() => void sheetsQuery.refetch()}
                />
              ) : sheetsQuery.isPending ? (
                <div className="text-center py-8">Loading sheets...</div>
              ) : sheets.length === 0 ? (
                <p className="text-sm text-app-text-muted">No sheets in this collection.</p>
              ) : (
                <>
                  {/* Search Input */}
                  <div className="mb-4">
                    <input
                      type="text"
                      value={sheetSearch}
                      onChange={(e) => setSheetSearch(e.target.value)}
                      placeholder="Search sheets by name..."
                      className="w-full px-4 py-2 border rounded-lg shadow-sm focus:ring-app-accent focus:border-app-accent text-sm"
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
                          <p className="text-sm text-app-text-muted text-center py-8">
                            No sheets match "{sheetSearch}"
                          </p>
                        ) : (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-xs text-app-text-muted">
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
                                className="text-xs text-app-accent hover:text-app-accent-hover font-medium"
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
                                        ? 'bg-app-accent-muted border-app-accent/50'
                                        : 'hover:border-app-accent/50 hover:bg-app-surface'
                                      }`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={isSelected}
                                      onChange={() => handleSheetToggle(sheet.id)}
                                      className="w-4 h-4 text-app-accent rounded focus:ring-app-accent flex-shrink-0"
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="font-medium text-sm text-app-text truncate">
                                        {sheet.name}
                                      </div>
                                      <div className="text-xs text-app-text-muted">
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
                  <p className="text-sm text-app-text">
                    <span className="font-medium text-app-accent">{selectedSheetIds.size}</span> sheet{selectedSheetIds.size !== 1 ? 's' : ''} selected
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  setSheetSearch('')
                  setCurrentStep('select-source')
                }}
                className="storage-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => setCurrentStep('select-destination')}
                disabled={selectedSheetIds.size === 0}
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next: Select Destination
              </button>
            </div>
          </>
        )}

        {/* Step 3: Choose Destination Collection */}
        {bootstrapStatus !== 'error' && currentStep === 'select-destination' && (
          <>
            <div className="storage-card p-6 mb-6 relative storage-reveal storage-reveal-2" style={{ isolation: 'isolate' }}>
              <h2 className="text-xl font-semibold mb-4">Choose Destination Collection</h2>
              <p className="text-app-text mb-6">
                Select where to move the {selectedSheetIds.size} selected sheet{selectedSheetIds.size !== 1 ? 's' : ''}.
              </p>

              <CollectionTreePicker
                locations={locations}
                collections={availableBoxes.concat(availableBags)}
                onSelect={(type, id, name) => handleDestinationSelect(type, id, name)}
                disabledId={sourceCollectionId!}
                disabledType={sourceCollectionType!}
                loading={bootstrapLoading}
                filterEmptyLocations={true}
              />
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('select-sheets')}
                className="storage-btn-secondary"
              >
                Back
              </button>
            </div>
          </>
        )}

        {/* Step 4: Review & Confirm */}
        {bootstrapStatus !== 'error' && currentStep === 'confirm' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-4">Review & Confirm Move</h2>
              <p className="text-app-text mb-6">
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
                      <div className="border-l-4 border-app-accent pl-4">
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-2">
                          Source Collection
                        </h3>
                        <div className="text-lg font-medium text-app-text">
                          {sourceCollectionName}
                        </div>
                        <div className="text-sm text-app-text-muted mt-1">
                          Type: {sourceCollectionType}
                        </div>
                      </div>

                      {/* Selected Sheets */}
                      <div className="border-l-4 border-app-trend-up pl-4">
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-2">
                          Sheets to Move ({selectedSheetIds.size})
                        </h3>
                        <div className="space-y-2">
                          {sheets
                            .filter(s => selectedSheetIds.has(s.id))
                            .map((sheet) => (
                              <div key={sheet.id} className="bg-app-surface rounded p-3">
                                <div className="font-medium text-app-text">{sheet.name}</div>
                                <div className="text-xs text-app-text-muted mt-1">
                                  {sheet.papers.length} paper{sheet.papers.length !== 1 ? 's' : ''}
                                </div>
                              </div>
                            ))}
                        </div>
                      </div>

                      {/* Destination Collection */}
                      <div className="border-l-4 border-purple-500 pl-4">
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-2">
                          Destination Collection
                        </h3>
                        {destination ? (
                          <>
                            <div className="text-lg font-medium text-app-text">
                              {destinationCollectionName}
                            </div>
                            <div className="text-sm text-app-text-muted mt-1">
                              Type: {destinationCollectionType}
                            </div>
                          </>
                        ) : (
                          <div className="text-app-trend-down font-medium">
                            ⚠️ Destination collection not found. Please go back and select a valid destination.
                          </div>
                        )}
                      </div>

                      {/* Validation Status */}
                      {isValid ? (
                        <div className="bg-app-accent-muted border border-app-accent/50 rounded-lg p-4">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-app-text mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-app-text">
                                Move is valid and ready to execute
                              </p>
                              <p className="text-xs text-app-text mt-1">
                                All {selectedSheetIds.size} selected sheet{selectedSheetIds.size !== 1 ? 's' : ''} will be moved from {sourceCollectionName} to {destinationCollectionName}.
                              </p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-app-trend-down/10 border border-app-trend-down rounded-lg p-4">
                          <div className="flex items-start">
                            <svg className="w-5 h-5 text-app-trend-down mt-0.5 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <div>
                              <p className="text-sm font-medium text-app-trend-down">
                                Move cannot be completed
                              </p>
                              <p className="text-xs text-app-trend-down mt-1">
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
                        className="storage-btn-secondary"
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
                        className="storage-btn-primary px-6 py-2 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
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
        {bootstrapStatus !== 'error' && currentStep === 'execute' && (
          <>
            {mutating ? (
              <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                <div className="text-center py-8">
                  <p className="text-app-text">Moving sheets...</p>
                </div>
              </div>
            ) : moveResult ? (
              <>
                {moveResult.success ? (
                  <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                    <div className="flex items-center mb-6">
                      <div className="w-12 h-12 rounded-full bg-app-trend-up/10 flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-app-trend-up" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-app-text">Move Completed Successfully</h2>
                        <p className="text-app-text-muted mt-1">
                          {moveResult.moved} sheet{moveResult.moved !== 1 ? 's' : ''} moved successfully
                        </p>
                      </div>
                    </div>

                    <div className="space-y-6 border-t pt-6">
                      {/* Source Collection */}
                      <div>
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-3">
                          From
                        </h3>
                        <Link
                          to={`/collections/${sourceCollectionType === 'box' ? 'boxes' : 'bags'}/${sourceCollectionId}`}
                          className="inline-flex items-center px-4 py-3 bg-app-accent-muted border border-app-accent/50 rounded-lg hover:bg-app-accent-muted transition-colors group"
                        >
                          <div className="flex-1">
                            <div className="font-semibold text-app-text group-hover:text-app-text">
                              {sourceCollectionName}
                            </div>
                            <div className="text-sm text-app-text mt-0.5">
                              {sourceCollectionType === 'box' ? 'Box' : 'Bag'} • View collection →
                            </div>
                          </div>
                          <svg className="w-5 h-5 text-app-text ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                        </Link>
                      </div>

                      {/* Moved Sheets */}
                      <div>
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-3">
                          Sheets Moved ({moveResult.movedSheets?.length || 0})
                        </h3>
                        <div className="space-y-2">
                          {moveResult.movedSheets?.map((sheet) => (
                            <div key={sheet.id} className="px-4 py-3 bg-app-surface border border-app-border rounded-lg">
                              <div className="font-medium text-app-text">{sheet.name}</div>
                              <div className="text-xs text-app-text-muted mt-1">
                                {sheet.papers.length} paper{sheet.papers.length !== 1 ? 's' : ''}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Destination Collection */}
                      <div>
                        <h3 className="text-sm font-semibold text-app-text-muted uppercase tracking-wide mb-3">
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
                  <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-app-trend-down/10 flex items-center justify-center mr-4">
                        <svg className="w-6 h-6 text-app-trend-down" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-2xl font-bold text-app-text">Move Failed</h2>
                        <p className="text-app-trend-down mt-1">{moveResult.error || 'An error occurred'}</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-4">
                  <button
                    onClick={handleStartOver}
                    className="storage-btn-primary px-6 py-2 font-medium"
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
    </div>
  )
}

