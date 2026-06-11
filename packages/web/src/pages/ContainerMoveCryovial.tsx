import { useState, useRef, useCallback } from 'react'
import { Navigate } from 'react-router-dom'
import { useCryovialMoveBootstrap, moveWorkflowKeys } from '../hooks/useMoveWorkflow'
import { useScanMoveWorkflow } from '../hooks/useScanMoveWorkflow'
import { cryovialScanMoveVariant } from '../lib/scan-move'
import { downloadCsv } from '../lib/csv'
import { generateCryovialMoveTemplate } from '../lib/cryovial-move-template'
import CryovialBoxPicker, { type CryovialBox } from '../components/CryovialBoxPicker'
import LocationPicker from '../components/LocationPicker'
import { isExistingPlateName } from '../lib/micronix-move-destination-plates'
import { useUser } from '../contexts/UserContext'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import { useQueryClient } from '@tanstack/react-query'
import '../styles/storage.css'

export default function ContainerMoveCryovial() {
  const { canWrite } = useUser()
  const queryClient = useQueryClient()
  const bootstrapQuery = useCryovialMoveBootstrap()
  const bootstrapStatus = fromQuery(bootstrapQuery)
  const availableBoxes = (bootstrapQuery.data?.boxes ?? []) as CryovialBox[]
  const locations = bootstrapQuery.data?.locations ?? []

  const refreshCollections = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: moveWorkflowKeys.cryovialBootstrap() })
    const refetchResult = await bootstrapQuery.refetch()
    return (refetchResult.data?.boxes ?? []) as CryovialBox[]
  }, [queryClient, bootstrapQuery])

  const wf = useScanMoveWorkflow({
    variant: cryovialScanMoveVariant,
    collections: availableBoxes,
    refreshCollections,
  })
  const { files, pendingDestinations, createDestinationsStepUsed, atomicMode, moveResult } = wf.state
  const effectiveStep = wf.step
  const loading = wf.loading
  const createBoxesStepUsed = createDestinationsStepUsed
  const missingDestinationBoxNames = wf.missingDestinationNames
  const destinationBoxesAlreadyCreated = wf.destinationsAlreadyCreated

  const [instructionsExpanded, setInstructionsExpanded] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return
    void wf.ingestFiles(selectedFiles)
  }

  const removeFile = (fileIndex: number) => {
    wf.removeFile(fileIndex)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const downloadTemplate = () => {
    downloadCsv(generateCryovialMoveTemplate(), 'cryovial_move_template.csv')
  }

  // Resolve, create-boxes, and execute logic live in the scan move core (lib/scan-move).

  // Get all unique source boxes across all files
  const getAllSourceBoxes = (): string[] => {
    const sourceBoxes = new Set<string>()
    files.forEach(fileData => {
      fileData.resolvedContainers.forEach(rc => {
        if (rc.container.currentCollectionName) {
          sourceBoxes.add(rc.container.currentCollectionName)
        }
      })
    })
    return Array.from(sourceBoxes)
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Cryovial Tubes</h1>

        {bootstrapStatus === 'error' && (
          <PageError
            title="Could not load collections"
            message={getQueryErrorMessage(
              bootstrapQuery.error,
              'Failed to load cryovial boxes and locations'
            )}
            onRetry={() => void bootstrapQuery.refetch()}
          />
        )}

        {/* Step indicator */}
        <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
          <div className="storage-step-indicator">
            <div className={`storage-step-item ${effectiveStep === 'upload' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">1</span>
              <span>Upload & Configure</span>
            </div>
            <div className="storage-step-connector" />
            {createBoxesStepUsed && (
              <>
                <div className={`storage-step-item ${effectiveStep === 'create_plates' ? 'storage-step-item--active' : ''}`}>
                  <span className="storage-step-item__circle">2</span>
                  <span>Create Boxes</span>
                </div>
                <div className="storage-step-connector" />
              </>
            )}
            <div className={`storage-step-item ${effectiveStep === 'resolve' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">{createBoxesStepUsed ? '3' : '2'}</span>
              <span>Resolve</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${effectiveStep === 'execute' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">{createBoxesStepUsed ? '4' : '3'}</span>
              <span>Execute</span>
            </div>
          </div>
        </div>

        {/* Step 1: Upload & Configure */}
        {effectiveStep === 'upload' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <button
                type="button"
                onClick={() => setInstructionsExpanded(!instructionsExpanded)}
                className="flex items-center justify-between w-full text-left focus:outline-none focus:ring-2 focus:ring-app-accent rounded"
              >
                <h2 className="text-xl font-semibold">Instructions</h2>
                <svg
                  className={`w-5 h-5 text-app-text-muted transition-transform ${instructionsExpanded ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {instructionsExpanded && (
                <div className="space-y-4 text-app-text mt-4">
                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Overview</h3>
                    <p>Upload one or more CSV files with cryovial tube move operations. Each file should be named after the destination box it represents. The system will infer the destination box from the filename, or you can select it manually.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">CSV Format</h3>
                    <p className="mb-2">The required columns are:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>
                        <strong>source_collection_name:</strong> Name of the source cryovial box
                      </li>
                      <li>
                        <strong>source_position:</strong> Position of the tube in the source box (e.g., &quot;B05&quot;, &quot;C02&quot;)
                      </li>
                      <li>
                        <strong>target_position:</strong> Target position in the destination box (e.g., &quot;C03&quot;, &quot;D01&quot;)
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Filename Convention</h3>
                    <p className="mb-2">Name your CSV files to exactly match the destination box name:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>The filename (without .csv extension) must exactly match a box name in the database</li>
                      <li>Example: If box is named &quot;BOX-001&quot;, name your file <code className="bg-app-surface px-1 rounded">BOX-001.csv</code></li>
                      <li>Example: If box is named &quot;1022&quot;, name your file <code className="bg-app-surface px-1 rounded">1022.csv</code></li>
                      <li>Matching is case-insensitive, but the filename must match exactly (no extra characters)</li>
                      <li>If the filename matches no existing box, it is proposed as a new box — assign its storage location in the create step</li>
                      <li>If the box name cannot be inferred, you'll be prompted to select it manually</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Workflow</h3>
                    <p className="mb-2">This process has {createBoxesStepUsed ? '4' : '3'} steps:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination boxes</li>
                      {createBoxesStepUsed && (
                        <li><strong>Create Boxes:</strong> Assign a storage location for any destination boxes that do not exist yet.</li>
                      )}
                      <li><strong>Resolve:</strong> System finds each tube by position and identifies source boxes</li>
                      <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Upload CSV Files</h2>
                <button
                  onClick={downloadTemplate}
                  className="storage-btn-secondary"
                >
                  Download Template
                </button>
              </div>

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileChange}
                disabled={loading}
                className="file-input-accent"
              />

              {files.length > 0 && (
                <div className="mt-6 space-y-4">
                  {files.map((fileData, index) => (
                    <div key={index} className="border border-app-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-app-text">{fileData.filename}</h3>
                          <p className="text-sm text-app-text-muted mt-1">
                            {fileData.csvRows.length} row{fileData.csvRows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-app-trend-down hover:text-app-trend-down text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Box Selection */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-app-text mb-2">
                          Destination Box:
                        </label>
                        {fileData.inferredDestinationName && fileData.selectedDestinationName && fileData.inferredMatches.length === 1 ? (
                          <div className="text-sm text-app-text bg-app-trend-up/10 border border-app-trend-up/30 rounded p-2">
                            ✓ Inferred: <span className="font-semibold">{fileData.selectedDestinationName}</span>
                          </div>
                        ) : (
                          <CryovialBoxPicker
                            locations={locations}
                            boxes={availableBoxes}
                            value={fileData.selectedDestinationName || undefined}
                            onChange={(boxName) => wf.selectDestination(index, boxName)}
                          />
                        )}
                        {fileData.selectedDestinationName &&
                          !isExistingPlateName(fileData.selectedDestinationName, availableBoxes) && (
                          <p className="text-xs text-app-accent mt-1">
                            New box &quot;{fileData.selectedDestinationName}&quot; — assign a storage location in the next step.
                          </p>
                        )}
                        {fileData.inferredDestinationName && !fileData.selectedDestinationName && (
                          <p className="text-xs text-app-text-muted mt-1">
                            No exact match found for &quot;{fileData.inferredDestinationName}&quot;. Please select a destination box.
                            {fileData.inferredMatches.length > 0 && (
                              <span className="ml-1">({fileData.inferredMatches.length} similar box{fileData.inferredMatches.length !== 1 ? 'es' : ''} found)</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Preview */}
                      {fileData.preview.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-app-text mb-2">Preview (first 5 rows):</h4>
                  <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-app-border text-xs">
                      <thead className="bg-app-surface">
                        <tr>
                                  {Object.keys(fileData.preview[0]).map((header) => (
                            <th
                              key={header}
                                      className="px-2 py-1 text-left text-xs font-medium text-app-text-muted uppercase"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-app-card divide-y divide-app-border">
                                {fileData.preview.map((row, i) => (
                          <tr key={i}>
                            {Object.keys(row).map((header) => (
                                      <td key={header} className="px-2 py-1 whitespace-nowrap text-app-text">
                                {row[header]}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

                      {/* Validation Errors */}
                      {fileData.validationErrors.length > 0 && (
                        <div className="mt-3 bg-app-trend-down/10 border border-app-trend-down rounded p-2">
                          <h4 className="text-sm font-semibold text-app-trend-down mb-1">Errors:</h4>
                          <ul className="list-disc list-inside space-y-1 text-app-trend-down text-xs">
                            {fileData.validationErrors.map((error, i) => (
                    <li key={i}>
                                {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => void wf.next()}
                disabled={files.length === 0 || loading || files.some(f => !f.selectedDestinationName || f.validationErrors.length > 0)}
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Processing...'
                  : missingDestinationBoxNames.length > 0
                    ? 'Next: Create Destination Boxes'
                    : 'Next: Resolve Containers'}
              </button>
            </div>
          </>
        )}

        {/* Step 2 (optional): Create destination boxes */}
        {effectiveStep === 'create_plates' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-2">Create Destination Boxes</h2>
              <p className="text-sm text-app-text-muted mb-6">
                {destinationBoxesAlreadyCreated
                  ? 'Destination boxes are ready. Continue to resolve tubes, or go back to upload to change your CSV.'
                  : 'The following destination boxes do not exist yet. Assign a storage location for each one before continuing.'}
              </p>

              <div className="space-y-4">
                {pendingDestinations.map((box, index) => (
                  <div key={box.name} className="border border-app-border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-app-text">{box.name}</h3>
                        <p className="text-xs text-app-text-muted mt-1">New cryovial box</p>
                      </div>
                      {box.status === 'success' && (
                        <span className="text-app-trend-up text-sm font-medium">Created</span>
                      )}
                      {box.status === 'creating' && (
                        <span className="text-app-accent text-sm">Creating...</span>
                      )}
                      {box.status === 'error' && (
                        <span className="text-app-trend-down text-sm">Error</span>
                      )}
                    </div>

                    {box.status === 'error' && box.error && (
                      <div className="mb-3 text-sm text-app-trend-down">{box.error}</div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-app-text mb-2">Location *</label>
                      <LocationPicker
                        value={box.locationId}
                        onChange={(locationId) => {
                          wf.updatePendingDestination(index, { locationId, error: undefined })
                        }}
                        filterCollectionsOnly
                        disabled={box.status === 'creating' || box.status === 'success'}
                      />
                    </div>

                    <div className="mt-3">
                      <label className="block text-sm font-medium text-app-text mb-2">Barcode (optional)</label>
                      <input
                        type="text"
                        value={box.barcode}
                        onChange={(e) => {
                          wf.updatePendingDestination(index, { barcode: e.target.value })
                        }}
                        disabled={box.status === 'creating' || box.status === 'success'}
                        className="form-input w-full"
                        placeholder="Enter box barcode (optional)"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                type="button"
                onClick={() => {
                  wf.clearPendingDestinations()
                  wf.goToStep('upload')
                }}
                className="storage-btn-secondary"
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={() =>
                  void (destinationBoxesAlreadyCreated
                    ? wf.resolveWithFreshCollections()
                    : wf.createDestinationsAndResolve())
                }
                disabled={
                  loading ||
                  pendingDestinations.some((p) => p.status === 'creating') ||
                  pendingDestinations.length === 0
                }
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Processing...'
                  : destinationBoxesAlreadyCreated
                    ? 'Continue to Resolve'
                    : 'Create Boxes & Continue'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Resolve */}
        {effectiveStep === 'resolve' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-4">Resolved Cryovial Tubes</h2>
              
              <div className="mb-4">
                <p className="text-app-text">
                  <strong>Total Files:</strong> {files.length}
                </p>
                <p className="text-app-text">
                  <strong>Total Tubes:</strong> {files.reduce((sum, f) => sum + f.resolvedContainers.length, 0)} of {files.reduce((sum, f) => sum + f.csvRows.length, 0)} resolved
                </p>
                {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0) > 0 && (
                  <p className="text-app-trend-down font-semibold mt-1">
                    <strong>Unresolved:</strong> {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0)} tube(s) could not be found in the database
                  </p>
                )}
              </div>

              <div className="mb-4">
                <h3 className="font-semibold mb-2">Source Boxes Detected:</h3>
                <ul className="list-disc list-inside space-y-1 text-app-text">
                  {getAllSourceBoxes().map((boxName) => (
                    <li key={boxName}>{boxName}</li>
                  ))}
                </ul>
              </div>

              {/* Per-file breakdown */}
              <div className="mt-6 space-y-4">
                {files.map((fileData, index) => (
                  <div key={index} className="border border-app-border rounded-lg p-4">
                    <h4 className="font-semibold text-app-text mb-2">{fileData.filename}</h4>
                    <p className="text-sm text-app-text mb-2">
                      Destination: <span className="font-semibold">{fileData.selectedDestinationName}</span>
                    </p>
                    <p className="text-sm text-app-text mb-2">
                      Resolved: {fileData.resolvedContainers.length} of {fileData.csvRows.length} tubes
                    </p>
                    {fileData.unresolvedContainers.length > 0 && (
                      <div className="mt-3 bg-app-trend-down/10 border border-app-trend-down rounded p-3">
                        <h5 className="text-sm font-semibold text-app-trend-down mb-2">
                          Unresolved Tubes ({fileData.unresolvedContainers.length}):
                        </h5>
                        <p className="text-xs text-app-trend-down mb-2">
                          The following positions were not found in the database. Please check for typos or verify the positions exist.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-app-trend-down text-xs">
                            <thead className="bg-app-trend-down/10">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Row</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Source Position</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Target Position</th>
                              </tr>
                            </thead>
                            <tbody className="bg-app-card divide-y divide-app-trend-down">
                              {fileData.unresolvedContainers.map((unresolved, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 whitespace-nowrap text-app-trend-down font-medium">
                                    {unresolved.rowIndex}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-app-trend-down font-mono">
                                    {unresolved.identifierKey}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-app-trend-down">
                                    {unresolved.targetPosition || <span className="text-app-text-muted italic">N/A</span>}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                    </div>
                  </div>
                    )}
              </div>
                ))}
                </div>
              <div className="mt-6 border border-app-border rounded-lg p-4 bg-app-surface">
                <h3 className="font-semibold text-app-text mb-3">Atomicity Mode</h3>
                <div className="space-y-2">
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="cryovial-atomic-mode"
                      value="all_or_nothing"
                      checked={atomicMode === 'all_or_nothing'}
                      onChange={() => wf.setAtomicMode('all_or_nothing')}
                      className="mt-1"
                    />
                    <span className="text-sm text-app-text">
                      <strong>All-or-nothing</strong>: any invalid row blocks all moves.
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="cryovial-atomic-mode"
                      value="best_effort"
                      checked={atomicMode === 'best_effort'}
                      onChange={() => wf.setAtomicMode('best_effort')}
                      className="mt-1"
                    />
                    <span className="text-sm text-app-text">
                      <strong>Best effort</strong>: valid rows are moved, invalid rows are returned as errors.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  wf.goToStep(missingDestinationBoxNames.length > 0 ? 'create_plates' : 'upload')
                }}
                className="storage-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={() => void wf.executeMoves()}
                disabled={files.some(f => f.resolvedContainers.length === 0)}
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Execute Moves
              </button>
            </div>
          </>
        )}

        {/* Step 3: Execute/Results */}
        {effectiveStep === 'execute' && moveResult && (
          <>
            <div
              className={`border rounded-lg p-6 mb-6 ${
                moveResult.success
                  ? 'bg-app-trend-up/10 border-app-trend-up/30'
                  : 'bg-app-trend-down/10 border-app-trend-down'
              }`}
            >
              <h3
                className={`text-lg font-semibold mb-2 ${
                  moveResult.success ? 'text-app-trend-up' : 'text-app-trend-down'
                }`}
              >
                {moveResult.success ? 'Moves Successful' : 'Moves Failed'}
              </h3>
              <p className={moveResult.success ? 'text-app-trend-up' : 'text-app-trend-down'}>
                {moveResult.success
                  ? `Successfully moved ${moveResult.moved} tube(s) across ${files.length} file(s)`
                  : moveResult.moved > 0
                  ? atomicMode === 'best_effort'
                    ? `Partially completed in best effort mode. ${moveResult.moved} tube(s) moved; some rows failed.`
                    : `Failed to move tubes. ${moveResult.moved} moved before error.`
                  : 'No tubes were moved due to validation errors.'}
              </p>

              {/* Per-file results */}
              {moveResult.fileResults && moveResult.fileResults.length > 0 && (
                <div className="mt-4 space-y-3">
                  <h4 className="font-semibold text-app-text">Per-File Results:</h4>
                  {moveResult.fileResults.map((result, i) => (
                    <div key={i} className="bg-app-card border border-app-border rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-app-text">{result.filename}</span>
                        <span className={`text-sm ${result.moved > 0 ? 'text-app-trend-up' : 'text-app-text-muted'}`}>
                          {result.moved} moved
                        </span>
                      </div>
                      <p className="text-sm text-app-text-muted">Destination: {result.destinationName}</p>
                      {result.errors && result.errors.length > 0 && (
                        <ul className="mt-2 list-disc list-inside text-sm text-app-trend-down">
                          {result.errors.map((error, j) => (
                            <li key={j}>
                              {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Overall errors */}
              {moveResult.errors && moveResult.errors.length > 0 && (
                <div className="mt-4">
                  <h4 className="font-semibold text-app-trend-down mb-2">Errors:</h4>
                  <ul className="list-disc list-inside space-y-2 text-app-trend-down">
                  {moveResult.errors.map((error, i) => (
                      <li key={i} className="text-sm">
                        {error.row > 0 ? (
                          <span className="font-medium">Row {error.row}:</span>
                        ) : null}{' '}
                        {error.error}
                    </li>
                  ))}
                </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  wf.reset()
                  setInstructionsExpanded(false)
                  if (fileInputRef.current) {
                    fileInputRef.current.value = ''
                  }
                }}
                className="storage-btn-primary px-6 py-2"
              >
                Start New Move
              </button>
            </div>
          </>
        )}
      </div>
      </div>
    </div>
  )
}
