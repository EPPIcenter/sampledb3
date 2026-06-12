import type { ChangeEvent, ReactNode, RefObject } from 'react'
import type { Location } from '../../lib/api/types'
import type { ScanMoveFile } from '../../lib/scan-move'
import type { ScanMoveWorkflow } from '../../hooks/useScanMoveWorkflow'
import { isExistingPlateName } from '../../lib/micronix-move-destination-plates'
import CollectionDestinationPicker, {
  type DestinationCollection,
} from '../CollectionDestinationPicker'
import LocationPicker from '../LocationPicker'
import { PageError } from '../../ui'
import type { ScanMovePageShellConfig } from './copy'

export interface ScanMovePageShellProps extends ScanMovePageShellConfig {
  wf: ScanMoveWorkflow
  locations: Location[]
  collections: DestinationCollection[]
  bootstrapError?: { message: string; onRetry: () => void } | null
  instructions: ReactNode
  instructionsExpanded: boolean
  onInstructionsExpandedChange: (expanded: boolean) => void
  fileInputRef: RefObject<HTMLInputElement | null>
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
  fileInputDisabled?: boolean
  uploadHeaderExtra?: ReactNode
  uploadBeforeFiles?: ReactNode
  renderInferredBanner?: (file: ScanMoveFile) => ReactNode | null
  onStartNewMove?: () => void
}

function getAllSourceCollections(files: ScanMoveFile[]): string[] {
  const names = new Set<string>()
  for (const file of files) {
    for (const rc of file.resolvedContainers) {
      if (rc.container.currentCollectionName) {
        names.add(rc.container.currentCollectionName)
      }
    }
  }
  return [...names]
}

function previewHeaders(file: ScanMoveFile, hideKeys?: string[]): string[] {
  if (file.preview.length === 0) return []
  const hidden = new Set(hideKeys ?? [])
  return Object.keys(file.preview[0]).filter((h) => !hidden.has(h))
}

export default function ScanMovePageShell({
  copy,
  collectionKind,
  previewHideKeys,
  wf,
  locations,
  collections,
  bootstrapError,
  instructions,
  instructionsExpanded,
  onInstructionsExpandedChange,
  fileInputRef,
  onFileChange,
  fileInputDisabled = false,
  uploadHeaderExtra,
  uploadBeforeFiles,
  renderInferredBanner,
  onStartNewMove,
}: ScanMovePageShellProps) {
  const { files, pendingDestinations, createDestinationsStepUsed, atomicMode, moveResult } = wf.state
  const step = wf.step
  const createStepUsed = createDestinationsStepUsed

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-6">{copy.title}</h1>

          {bootstrapError && (
            <PageError
              title="Could not load collections"
              message={bootstrapError.message}
              onRetry={bootstrapError.onRetry}
            />
          )}

          <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
            <div className="storage-step-indicator">
              <div className={`storage-step-item ${step === 'upload' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">1</span>
                <span>Upload & Configure</span>
              </div>
              <div className="storage-step-connector" />
              {createStepUsed && (
                <>
                  <div className={`storage-step-item ${step === 'create_plates' ? 'storage-step-item--active' : ''}`}>
                    <span className="storage-step-item__circle">2</span>
                    <span>{copy.createStepNavLabel}</span>
                  </div>
                  <div className="storage-step-connector" />
                </>
              )}
              <div className={`storage-step-item ${step === 'resolve' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">{createStepUsed ? '3' : '2'}</span>
                <span>Resolve</span>
              </div>
              <div className="storage-step-connector" />
              <div className={`storage-step-item ${step === 'execute' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">{createStepUsed ? '4' : '3'}</span>
                <span>Execute</span>
              </div>
            </div>
          </div>

          {step === 'upload' && (
            <>
              <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                <button
                  type="button"
                  onClick={() => onInstructionsExpandedChange(!instructionsExpanded)}
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
                  <div className="space-y-4 text-app-text mt-4">{instructions}</div>
                )}
              </div>

              <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                {uploadHeaderExtra ? (
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-xl font-semibold">Upload CSV Files</h2>
                    {uploadHeaderExtra}
                  </div>
                ) : (
                  <h2 className="text-xl font-semibold mb-4">Upload CSV Files</h2>
                )}

                {uploadBeforeFiles}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={onFileChange}
                  disabled={wf.loading || fileInputDisabled}
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
                            onClick={() => {
                              wf.removeFile(index)
                              if (fileInputRef.current) fileInputRef.current.value = ''
                            }}
                            className="text-app-trend-down hover:text-app-trend-down text-sm"
                          >
                            Remove
                          </button>
                        </div>

                        <div className="mb-3">
                          <label className="block text-sm font-medium text-app-text mb-2">
                            {copy.destinationFieldLabel}
                          </label>
                          {renderInferredBanner?.(fileData)}
                          <CollectionDestinationPicker
                            kind={collectionKind}
                            locations={locations}
                            collections={collections}
                            value={fileData.selectedDestinationName || undefined}
                            onChange={(name) => wf.selectDestination(index, name)}
                            suggestedCollections={fileData.inferredMatches}
                            allowCreateNew
                            suggestedNewName={fileData.inferredDestinationName}
                          />
                          {fileData.selectedDestinationName &&
                            !isExistingPlateName(fileData.selectedDestinationName, collections) && (
                            <p className="text-xs text-app-accent mt-1">
                              New {collectionKind === 'plate' ? 'plate' : 'box'} &quot;{fileData.selectedDestinationName}&quot; — assign a storage location in the next step.
                            </p>
                          )}
                          {fileData.inferredDestinationName &&
                            !fileData.selectedDestinationName &&
                            !isExistingPlateName(fileData.inferredDestinationName, collections) && (
                            <button
                              type="button"
                              onClick={() => wf.selectDestination(index, fileData.inferredDestinationName!)}
                              className="mt-2 text-sm text-app-accent underline hover:no-underline"
                            >
                              Use inferred name: {fileData.inferredDestinationName}
                            </button>
                          )}
                          {fileData.inferredDestinationName && !fileData.selectedDestinationName && (
                            <p className="text-xs text-app-text-muted mt-1">
                              No single {collectionKind} suggested for &quot;{fileData.inferredDestinationName}&quot;. Select an existing {collectionKind} or create a new one with any name.
                              {fileData.inferredMatches.length > 0 && (
                                <span className="ml-1">
                                  ({fileData.inferredMatches.length} similar {collectionKind}
                                  {fileData.inferredMatches.length !== 1 ? 's' : ''} found)
                                </span>
                              )}
                            </p>
                          )}
                        </div>

                        {fileData.preview.length > 0 && (
                          <div className="mt-3">
                            <h4 className="text-sm font-medium text-app-text mb-2">Preview (first 5 rows):</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-app-border text-xs">
                                <thead className="bg-app-surface">
                                  <tr>
                                    {previewHeaders(fileData, previewHideKeys).map((header) => (
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
                                      {previewHeaders(fileData, previewHideKeys).map((header) => (
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
                  disabled={
                    files.length === 0 ||
                    wf.loading ||
                    files.some((f) => !f.selectedDestinationName || f.validationErrors.length > 0)
                  }
                  className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {wf.loading
                    ? 'Processing...'
                    : wf.missingDestinationNames.length > 0
                      ? copy.nextCreateLabel
                      : copy.nextResolveLabel}
                </button>
              </div>
            </>
          )}

          {step === 'create_plates' && (
            <>
              <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                <h2 className="text-xl font-semibold mb-2">{copy.createStepTitle}</h2>
                <p className="text-sm text-app-text-muted mb-6">
                  {wf.destinationsAlreadyCreated ? copy.createStepReadyText : copy.createStepPendingText}
                </p>

                <div className="space-y-4">
                  {pendingDestinations.map((dest, index) => (
                    <div key={dest.name} className="border border-app-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <h3 className="font-medium text-app-text">{dest.name}</h3>
                          <p className="text-xs text-app-text-muted mt-1">{copy.newDestinationKindLabel}</p>
                        </div>
                        {dest.status === 'success' && (
                          <span className="text-app-trend-up text-sm font-medium">Created</span>
                        )}
                        {dest.status === 'creating' && (
                          <span className="text-app-accent text-sm">Creating...</span>
                        )}
                        {dest.status === 'error' && (
                          <span className="text-app-trend-down text-sm">Error</span>
                        )}
                      </div>

                      {dest.status === 'error' && dest.error && (
                        <div className="mb-3 text-sm text-app-trend-down">{dest.error}</div>
                      )}

                      <div>
                        <label className="block text-sm font-medium text-app-text mb-2">Location *</label>
                        <LocationPicker
                          value={dest.locationId}
                          onChange={(locationId) => {
                            wf.updatePendingDestination(index, { locationId, error: undefined })
                          }}
                          filterCollectionsOnly
                          disabled={dest.status === 'creating' || dest.status === 'success'}
                        />
                      </div>

                      <div className="mt-3">
                        <label className="block text-sm font-medium text-app-text mb-2">Barcode (optional)</label>
                        <input
                          type="text"
                          value={dest.barcode}
                          onChange={(e) => {
                            wf.updatePendingDestination(index, { barcode: e.target.value })
                          }}
                          disabled={dest.status === 'creating' || dest.status === 'success'}
                          className="form-input w-full"
                          placeholder={copy.barcodePlaceholder}
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
                  disabled={wf.loading}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() =>
                    void (wf.destinationsAlreadyCreated
                      ? wf.resolveWithFreshCollections()
                      : wf.createDestinationsAndResolve())
                  }
                  disabled={
                    wf.loading ||
                    pendingDestinations.some((p) => p.status === 'creating') ||
                    pendingDestinations.length === 0
                  }
                  className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {wf.loading
                    ? 'Processing...'
                    : wf.destinationsAlreadyCreated
                      ? 'Continue to Resolve'
                      : copy.createStepContinueLabel}
                </button>
              </div>
            </>
          )}

          {step === 'resolve' && (
            <>
              <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
                <h2 className="text-xl font-semibold mb-4">{copy.resolvedHeading}</h2>

                <div className="mb-4">
                  <p className="text-app-text">
                    <strong>Total Files:</strong> {files.length}
                  </p>
                  <p className="text-app-text">
                    <strong>Total Tubes:</strong>{' '}
                    {files.reduce((sum, f) => sum + f.resolvedContainers.length, 0)} of{' '}
                    {files.reduce((sum, f) => sum + f.csvRows.length, 0)} resolved
                  </p>
                  {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0) > 0 && (
                    <p className="text-app-trend-down font-semibold mt-1">
                      <strong>Unresolved:</strong>{' '}
                      {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0)} tube(s) could not be found in the database
                    </p>
                  )}
                </div>

                <div className="mb-4">
                  <h3 className="font-semibold mb-2">{copy.sourceCollectionsHeading}</h3>
                  <ul className="list-disc list-inside space-y-1 text-app-text">
                    {getAllSourceCollections(files).map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                </div>

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
                          <p className="text-xs text-app-trend-down mb-2">{copy.unresolvedHelp}</p>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-app-trend-down text-xs">
                              <thead className="bg-app-trend-down/10">
                                <tr>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Row</th>
                                  <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">
                                    {copy.unresolvedIdentifierHeader}
                                  </th>
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
                                      {unresolved.targetPosition || (
                                        <span className="text-app-text-muted italic">N/A</span>
                                      )}
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
                        name={copy.atomicModeRadioName}
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
                        name={copy.atomicModeRadioName}
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
                    wf.goToStep(wf.missingDestinationNames.length > 0 ? 'create_plates' : 'upload')
                  }}
                  className="storage-btn-secondary"
                >
                  Back
                </button>
                <button
                  onClick={() => void wf.executeMoves()}
                  disabled={files.some((f) => f.resolvedContainers.length === 0)}
                  className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Execute Moves
                </button>
              </div>
            </>
          )}

          {step === 'execute' && moveResult && (
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

                {moveResult.errors && moveResult.errors.length > 0 && (
                  <div className="mt-4">
                    <h4 className="font-semibold text-app-trend-down mb-2">Errors:</h4>
                    <ul className="list-disc list-inside space-y-2 text-app-trend-down">
                      {moveResult.errors.map((error, i) => (
                        <li key={i} className="text-sm">
                          {error.row > 0 ? <span className="font-medium">Row {error.row}:</span> : null}{' '}
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
                    onInstructionsExpandedChange(false)
                    onStartNewMove?.()
                    if (fileInputRef.current) fileInputRef.current.value = ''
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
