import { useState, useEffect, useRef, useMemo } from 'react'
import { Link, useNavigate, Navigate } from 'react-router-dom'
import { useContainerMoveStep, type ContainerMoveAtomicMode } from '../hooks/useContainerMoveStep'
import { useMicronixMoveBootstrap, moveWorkflowKeys } from '../hooks/useMoveWorkflow'
import { collectionsApi } from '../lib/api/collections';
import type { PlateCandidate } from '../lib/plate-filename-match'
import { inferDestinationPlateForScan } from '../lib/plate-destination-inference'
import { parseScannerPlateCsv, validateScannerPlateCsv } from '../lib/scanner-plate-csv'
import MicronixPlatePicker, { type MicronixPlate } from '../components/MicronixPlatePicker'
import LocationPicker from '../components/LocationPicker'
import {
  buildPendingDestinationPlates,
  getMissingDestinationPlateNames,
  isExistingPlateName,
  type PendingDestinationPlate,
} from '../lib/micronix-move-destination-plates'
import { useUser } from '../contexts/UserContext'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import { useQueryClient } from '@tanstack/react-query'
import '../styles/storage.css'

interface CSVRow {
  [key: string]: string
}

interface ValidationError {
  row: number
  error: string
}

interface ContainerInfo {
  containerId: number
  containerType: string
  currentCollectionId: number | null
  currentCollectionName: string | null
  currentCollectionType: string | null
  currentPosition: string | null
  barcode?: string | null
}

interface ResolvedContainer {
  barcode: string
  container: ContainerInfo
}

interface UnresolvedContainer {
  barcode: string
  rowIndex: number
  targetPosition: string
}

interface FileData {
  file: File
  inferredPlateName: string | null
  inferredMatches: PlateCandidate[]
  selectedPlateName: string | null
  csvRows: CSVRow[]
  resolvedContainers: ResolvedContainer[]
  unresolvedContainers: UnresolvedContainer[]
  validationErrors: ValidationError[]
  isResolved: boolean
  preview: CSVRow[]
}

export default function ContainerMoveMicronix() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const queryClient = useQueryClient()
  const [files, setFiles] = useState<FileData[]>([])
  const { currentStep: effectiveStep, setStep: setSearchStep } = useContainerMoveStep(files.length)

  const [loading, setLoading] = useState(false)
  const bootstrapQuery = useMicronixMoveBootstrap()
  const bootstrapStatus = fromQuery(bootstrapQuery)
  const availablePlates = (bootstrapQuery.data?.plates ?? []) as MicronixPlate[]
  const locations = bootstrapQuery.data?.locations ?? []
  const scannerConfigurations = bootstrapQuery.data?.scannerConfigurations ?? []
  const missingDestinationPlateNames = useMemo(
    () => getMissingDestinationPlateNames(files.map((f) => f.selectedPlateName), availablePlates),
    [files, availablePlates],
  )
  const [pendingDestinationPlates, setPendingDestinationPlates] = useState<PendingDestinationPlate[]>([])
  const destinationPlatesAlreadyCreated = useMemo(
    () =>
      pendingDestinationPlates.length > 0 &&
      pendingDestinationPlates.every((p) => p.status === 'success'),
    [pendingDestinationPlates],
  )
  const [createPlatesStepUsed, setCreatePlatesStepUsed] = useState(false)
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    errors?: ValidationError[]
    fileResults?: Array<{
      filename: string
      destinationPlate: string
      moved: number
      errors?: ValidationError[]
    }>
  } | null>(null)
  const [atomicMode, setAtomicMode] = useState<ContainerMoveAtomicMode>('all_or_nothing')
  const [instructionsExpanded, setInstructionsExpanded] = useState(false)
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (scannerConfigurations.length === 0 || selectedConfigId !== null) return
    const defaultConfig =
      scannerConfigurations.find((c) => c.isDefault === true) ?? scannerConfigurations[0]
    if (defaultConfig) {
      setSelectedConfigId(defaultConfig.id)
    }
  }, [scannerConfigurations, selectedConfigId])

  const configRevalidateRequestIdRef = useRef<string | null>(null)

  const handleConfigChange = (newId: string) => {
    setSelectedConfigId(newId)
    if (files.length === 0) return
    const config = scannerConfigurations.find((c) => c.id === newId)
    if (!config) return
    const requestId = newId
    configRevalidateRequestIdRef.current = requestId
    setLoading(true)
    const revalidate = async () => {
      const updated: FileData[] = []
      for (const fileData of files) {
        try {
          const text = await fileData.file.text()
          const csvRows = parseScannerPlateCsv(text, config)
          const validation = validateScannerPlateCsv(csvRows, config)
          const inference = inferDestinationPlateForScan(fileData.file.name, csvRows, config, availablePlates)
          const validationErrors = [...validation.errors, ...inference.plateInferenceErrors]
          const preview = csvRows.slice(0, 5)
          updated.push({
            ...fileData,
            csvRows,
            validationErrors,
            preview,
            inferredPlateName: inference.inferredPlateName,
            inferredMatches: inference.inferredMatches,
            selectedPlateName: inference.selectedPlateName,
            resolvedContainers: [],
            unresolvedContainers: [],
            isResolved: false,
          })
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to parse or validate with new config'
          updated.push({
            ...fileData,
            validationErrors: [{ row: 0, error: message }],
          })
        }
      }
      if (configRevalidateRequestIdRef.current === requestId) {
        setFiles(updated)
        setCurrentStep('upload')
      }
    }
    revalidate().finally(() => {
      if (configRevalidateRequestIdRef.current === requestId) {
        setLoading(false)
      }
    })
  }

  const setCurrentStep = setSearchStep

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    if (selectedFiles.length === 0) return

    setLoading(true)
    setMoveResult(null)

    try {
      const newFiles: FileData[] = []

      const selectedConfig = scannerConfigurations.find(c => c.id === selectedConfigId)
      if (!selectedConfig) {
        setLoading(false)
        return
      }

      for (const file of selectedFiles) {
        const text = await file.text()
        const csvRows = parseScannerPlateCsv(text, selectedConfig)
        const validation = validateScannerPlateCsv(csvRows, selectedConfig)
        const inference = inferDestinationPlateForScan(file.name, csvRows, selectedConfig, availablePlates)
        const validationErrors = [...validation.errors, ...inference.plateInferenceErrors]

        const preview = csvRows.slice(0, 5)

        newFiles.push({
          file,
          inferredPlateName: inference.inferredPlateName,
          inferredMatches: inference.inferredMatches,
          selectedPlateName: inference.selectedPlateName,
          csvRows,
          resolvedContainers: [],
          unresolvedContainers: [],
          validationErrors,
          isResolved: false,
          preview,
        })
      }

      setFiles(newFiles)
      setCurrentStep('upload')
    } catch (error: any) {
      console.error('Error processing files:', error)
    } finally {
      setLoading(false)
    }
  }

  const updateFilePlateSelection = (fileIndex: number, plateName: string | null) => {
    setFiles(prev => prev.map((f, i) => {
      if (i !== fileIndex) return f
      return {
        ...f,
        selectedPlateName: plateName,
        resolvedContainers: [],
        unresolvedContainers: [],
        isResolved: false,
        validationErrors: f.validationErrors.filter(e => !e.error.includes('not relocated')),
      }
    }))
  }

  const removeFile = (fileIndex: number) => {
    setFiles(prev => prev.filter((_, i) => i !== fileIndex))
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const resolveContainers = async (plates: MicronixPlate[]) => {
    // Resolve containers for all files (only rows with barcode; empty barcode = empty well)
    const allIdentifiers: Array<{ type: 'barcode'; barcode: string; fileIndex: number; rowIndex: number }> = []

    files.forEach((fileData, fileIndex) => {
      fileData.csvRows.forEach((row, rowIndex) => {
        const barcode = row.container_barcode.trim()
        if (barcode !== '') {
          allIdentifiers.push({
            type: 'barcode',
            barcode,
            fileIndex,
            rowIndex,
          })
        }
      })
    })

    const resolveResponse = await collectionsApi.resolveContainers({
      identifiers: allIdentifiers.map(({ type, barcode }) => ({ type, barcode })),
    })

    const resolved = resolveResponse.containers

    const resolvedBarcodes = new Set<string>()
    resolved.forEach((r: any) => {
      if (r.container) {
        const barcode = typeof r.identifier === 'string'
          ? r.identifier
          : r.identifier?.barcode
        if (barcode) {
          resolvedBarcodes.add(barcode)
        }
      }
    })

    const resolvedByFile = new Map<number, ResolvedContainer[]>()
    resolved.forEach((r: any) => {
      if (!r.container) return

      const barcode = typeof r.identifier === 'string'
        ? r.identifier
        : r.identifier?.barcode
      if (!barcode) return

      const identifier = allIdentifiers.find(id => id.barcode === barcode)
      if (identifier) {
        if (!resolvedByFile.has(identifier.fileIndex)) {
          resolvedByFile.set(identifier.fileIndex, [])
        }
        resolvedByFile.get(identifier.fileIndex)!.push({
          barcode: barcode,
          container: r.container,
        })
      }
    })

    const unresolvedByFile = new Map<number, UnresolvedContainer[]>()
    allIdentifiers.forEach((id) => {
      if (!resolvedBarcodes.has(id.barcode)) {
        if (!unresolvedByFile.has(id.fileIndex)) {
          unresolvedByFile.set(id.fileIndex, [])
        }
        const csvRow = files[id.fileIndex].csvRows[id.rowIndex]
        unresolvedByFile.get(id.fileIndex)!.push({
          barcode: id.barcode,
          rowIndex: id.rowIndex + 1,
          targetPosition: csvRow.target_position || '',
        })
      }
    })

    const invalidContainers = resolved.filter((r: any) =>
      r.container != null && r.container.currentCollectionType !== 'micronix_plate'
    )

    if (invalidContainers.length > 0) {
      setFiles(prev => prev.map((f, i) => {
        const fileInvalid = resolvedByFile.get(i)?.some(rc =>
          invalidContainers.some((ic: any) => ic.container.containerId === rc.container.containerId)
        )
        if (fileInvalid) {
          return {
            ...f,
            validationErrors: [
              ...f.validationErrors,
              { row: 0, error: 'Some containers are not from micronix plates' },
            ],
          }
        }
        return f
      }))
      return false
    }

    const relocationErrorsByFile = new Map<number, ValidationError[]>()
    const uniqueDestinationNames = [...new Set(files.map(f => f.selectedPlateName).filter(Boolean))] as string[]

    for (const plateName of uniqueDestinationNames) {
      const plateId = plates.find(p => p.name === plateName)?.id
      if (plateId == null) {
        const fileIndicesTargetingPlate = files
          .map((f, i) => (f.selectedPlateName === plateName ? i : -1))
          .filter((i) => i >= 0)
        const err: ValidationError = {
          row: 0,
          error: `Destination plate "${plateName}" could not be found. Create it or select an existing plate.`,
        }
        fileIndicesTargetingPlate.forEach((fileIndex) => {
          if (!relocationErrorsByFile.has(fileIndex)) relocationErrorsByFile.set(fileIndex, [])
          relocationErrorsByFile.get(fileIndex)!.push(err)
        })
        continue
      }

      const plateResponse = await collectionsApi.getMicronixPlate(plateId)
      const wells: Record<string, { type: string; barcode?: string | null }> = plateResponse.wells

      const rowsForPlate: { fileIndex: number; row: CSVRow }[] = []
      files.forEach((fileData, fileIndex) => {
        if (fileData.selectedPlateName !== plateName) return
        fileData.csvRows.forEach(row => rowsForPlate.push({ fileIndex, row }))
      })

      const positionToBarcode = new Map<string, string>()
      const positionToEmptyFileIndex = new Map<string, number>()
      for (const { fileIndex, row } of rowsForPlate) {
        const pos = row.target_position.trim()
        const barcode = row.container_barcode.trim()
        if (pos === '') continue
        if (barcode !== '') {
          positionToBarcode.set(pos, barcode)
        } else {
          if (!positionToEmptyFileIndex.has(pos)) positionToEmptyFileIndex.set(pos, fileIndex)
        }
      }
      const barcodesRelocatedInMove = new Set(positionToBarcode.values())
      const emptyPositions = [...positionToEmptyFileIndex.keys()].filter(P => !positionToBarcode.has(P))

      for (const P of emptyPositions) {
        const well = wells[P]
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- well can be undefined when position not in plate data (e.g. empty wells mock in tests)
        if (well?.type === 'micronix_tube' && well.barcode) {
          const B = well.barcode
          if (!barcodesRelocatedInMove.has(B)) {
            const fileIndex = positionToEmptyFileIndex.get(P) ?? 0
            const err: ValidationError = {
              row: 0,
              error: `Position ${P} on plate "${plateName}" is empty in your upload but tube ${B} is currently there and is not relocated in this move.`,
            }
            if (!relocationErrorsByFile.has(fileIndex)) relocationErrorsByFile.set(fileIndex, [])
            relocationErrorsByFile.get(fileIndex)!.push(err)
          }
        }
      }
    }

    setFiles(prev => prev.map((f, i) => {
      const base = {
        ...f,
        resolvedContainers: resolvedByFile.get(i) ?? [],
        unresolvedContainers: unresolvedByFile.get(i) ?? [],
        isResolved: true,
      }
      const relocationErrors = relocationErrorsByFile.get(i) ?? []
      if (relocationErrors.length === 0) return base
      const existingWithoutRelocation = f.validationErrors.filter(
        e => !e.error.includes('not relocated')
      )
      return {
        ...base,
        validationErrors: [...existingWithoutRelocation, ...relocationErrors],
      }
    }))

    const hasRelocationErrors = [...relocationErrorsByFile.values()].some((arr) => arr.length > 0)
    if (!hasRelocationErrors) {
      setCurrentStep('resolve')
    }
    return !hasRelocationErrors
  }

  const handleValidateAndResolve = async () => {
    const filesWithoutPlates = files.filter(f => !f.selectedPlateName)
    if (filesWithoutPlates.length > 0) {
      setFiles(prev => prev.map(f => {
        if (!f.selectedPlateName) {
          return {
            ...f,
            validationErrors: [
              ...f.validationErrors,
              { row: 0, error: 'Destination plate must be selected for this file' },
            ],
          }
        }
        return f
      }))
      return
    }

    const filesWithErrors = files.filter(f => f.validationErrors.length > 0)
    if (filesWithErrors.length > 0) {
      setCurrentStep('upload')
      return
    }

    const missingPlates = getMissingDestinationPlateNames(
      files.map((f) => f.selectedPlateName),
      availablePlates,
    )
    if (missingPlates.length > 0) {
      setPendingDestinationPlates(buildPendingDestinationPlates(missingPlates))
      setCreatePlatesStepUsed(true)
      setCurrentStep('create_plates')
      return
    }

    setLoading(true)
    try {
      await resolveContainers(availablePlates)
    } catch (error: any) {
      console.error('Error resolving containers:', error)
      setFiles(prev => prev.map(f => ({
        ...f,
        validationErrors: [
          ...f.validationErrors,
          { row: 0, error: error.response?.data?.error || error.message || 'Failed to resolve containers' },
        ],
      })))
    } finally {
      setLoading(false)
    }
  }

  const runResolveWithFreshPlates = async () => {
    setLoading(true)
    try {
      await queryClient.invalidateQueries({ queryKey: moveWorkflowKeys.micronixBootstrap() })
      const refetchResult = await bootstrapQuery.refetch()
      const freshPlates = (refetchResult.data?.plates ?? availablePlates) as MicronixPlate[]
      await resolveContainers(freshPlates)
    } catch (error: any) {
      console.error('Error resolving containers:', error)
      setFiles(prev => prev.map(f => ({
        ...f,
        validationErrors: [
          ...f.validationErrors,
          {
            row: 0,
            error: error.response?.data?.error || error.message || 'Failed to resolve containers',
          },
        ],
      })))
      setCurrentStep('upload')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateDestinationPlates = async () => {
    const needsLocation = pendingDestinationPlates.filter((p) => p.status !== 'success')
    if (needsLocation.some((p) => p.locationId == null)) {
      setPendingDestinationPlates((prev) =>
        prev.map((p) =>
          p.status === 'success' || p.locationId != null
            ? p
            : { ...p, error: 'Storage location is required' },
        ),
      )
      return
    }

    setLoading(true)
    let allSuccess = true
    const updated = [...pendingDestinationPlates]

    for (let i = 0; i < updated.length; i++) {
      if (updated[i].status === 'success') continue
      updated[i] = { ...updated[i], status: 'creating', error: undefined }
      setPendingDestinationPlates([...updated])

      try {
        await collectionsApi.createMicronixPlate({
          name: updated[i].name,
          locationId: updated[i].locationId!,
          barcode: updated[i].barcode.trim() || undefined,
        })
        updated[i] = { ...updated[i], status: 'success' }
      } catch (error: unknown) {
        allSuccess = false
        const message =
          error && typeof error === 'object' && 'response' in error
            ? (error as { response?: { data?: { error?: string } } }).response?.data?.error ??
              'Failed to create plate'
            : error instanceof Error
              ? error.message
              : 'Failed to create plate'
        updated[i] = { ...updated[i], status: 'error', error: message }
      }
      setPendingDestinationPlates([...updated])
    }

    if (!allSuccess) {
      setLoading(false)
      return
    }

    await runResolveWithFreshPlates()
  }

  const handleExecuteMoves = async () => {
    setLoading(true)
    setMoveResult(null)

    try {
      // Build moves from all files
      const allMoves: Array<{
        identifier: { type: 'barcode'; barcode: string }
        targetPosition: string
        fileIndex: number
      }> = []

      files.forEach((fileData, fileIndex) => {
        fileData.csvRows.forEach(row => {
          const barcode = row.container_barcode.trim()
          if (barcode === '') return // empty well; no move for this row
          allMoves.push({
            identifier: {
              type: 'barcode' as const,
              barcode,
            },
            targetPosition: row.target_position.trim(),
            fileIndex,
          })
        })
      })

      // Build mappings from source plates to destination plates
      // Check for conflicts: same source plate mapping to different destinations
      const sourceToDest = new Map<string, string>()
      const sourceToFiles = new Map<string, number[]>()
      
      files.forEach((fileData, fileIndex) => {
        const destinationPlate = fileData.selectedPlateName!
        fileData.resolvedContainers.forEach(rc => {
          const sourcePlate = rc.container.currentCollectionName
          if (sourcePlate) {
            if (!sourceToFiles.has(sourcePlate)) {
              sourceToFiles.set(sourcePlate, [])
            }
            sourceToFiles.get(sourcePlate)!.push(fileIndex)
            
            // Check for conflict
            const existingDest = sourceToDest.get(sourcePlate)
            if (existingDest && existingDest !== destinationPlate) {
              throw new Error(
                `Source plate "${sourcePlate}" appears in multiple files with different destinations: ` +
                `"${existingDest}" and "${destinationPlate}". Each source plate must map to a single destination.`
              )
            }
            
            sourceToDest.set(sourcePlate, destinationPlate)
          }
        })
      })

      const moveMappings = Array.from(sourceToDest.entries()).map(([from, to]) => ({
        fromCollectionName: from,
        toCollectionName: to,
      }))

      const response = await collectionsApi.moveContainers({
        collectionType: 'micronix_plate',
        atomicMode,
        mappings: moveMappings,
        moves: allMoves.map(({ identifier, targetPosition }) => ({
          identifier,
          targetPosition,
        })),
      })

      // Calculate per-file results
      const fileResults = files.map((fileData, fileIndex) => {
        const fileMoves = allMoves.filter(m => m.fileIndex === fileIndex)
        const moved = response.success ? fileMoves.length : 0
        const errors = response.errors?.filter((e: ValidationError) => {
          // Map errors back to file if possible (this is approximate)
          const errorRow = e.row
          return errorRow > 0 && errorRow <= fileData.csvRows.length
        })
        
        return {
          filename: fileData.file.name,
          destinationPlate: fileData.selectedPlateName!,
          moved,
          errors,
        }
      })

      if (response.success) {
        setMoveResult({
          success: true,
          moved: response.moved,
          fileResults,
        })
        setCurrentStep('execute')
      } else {
        setMoveResult({
          success: false,
          moved: response.moved || 0,
          errors: response.errors,
          fileResults,
        })
        setCurrentStep('execute')
      }
    } catch (error: any) {
      // Standardized error format from backend: { error, moved, errors }
      const errorData = error.response?.data || {}
      const errorMessages: ValidationError[] = errorData.errors || []
      const moved = errorData.moved || 0
      
      // If no errors array, create one from the error message
      if (errorMessages.length === 0) {
        errorMessages.push({
          row: 0,
          error: errorData.error || error.message || 'Failed to move containers',
        })
      }
      
      setMoveResult({
        success: false,
        moved,
        errors: errorMessages,
      })
      setCurrentStep('execute')
    } finally {
      setLoading(false)
    }
  }

  // Get all unique source plates across all files
  const getAllSourcePlates = (): string[] => {
    const sourcePlates = new Set<string>()
    files.forEach(fileData => {
      fileData.resolvedContainers.forEach(rc => {
        if (rc.container.currentCollectionName) {
          sourcePlates.add(rc.container.currentCollectionName)
        }
      })
    })
    return Array.from(sourcePlates)
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Micronix Tubes</h1>

        {bootstrapStatus === 'error' && (
          <PageError
            title="Could not load collections"
            message={getQueryErrorMessage(
              bootstrapQuery.error,
              'Failed to load plates, locations, and scanner configurations'
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
            {createPlatesStepUsed && (
              <>
                <div className={`storage-step-item ${effectiveStep === 'create_plates' ? 'storage-step-item--active' : ''}`}>
                  <span className="storage-step-item__circle">2</span>
                  <span>Create Plates</span>
                </div>
                <div className="storage-step-connector" />
              </>
            )}
            <div className={`storage-step-item ${effectiveStep === 'resolve' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">{createPlatesStepUsed ? '3' : '2'}</span>
              <span>Resolve</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${effectiveStep === 'execute' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">{createPlatesStepUsed ? '4' : '3'}</span>
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
                    <p>
                      Upload one or more CSV files representing plate scans. Depending on the scanner configuration, the destination plate is inferred from the{' '}
                      <strong>file name</strong> (after stripping common date suffixes) or from a <strong>CSV column</strong> that repeats the plate name on every row. You can always pick the plate manually.
                    </p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Scanner Configuration</h3>
                    <p className="mb-2">Select a scanner configuration that matches your CSV file format. The default configuration is automatically selected, but you can change it if needed.</p>
                    <p className="mb-2">Scanner configurations support:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Custom column names for barcode and position fields</li>
                      <li>Single position column or separate row/column columns (automatically combined with zero-padding)</li>
                      <li>Automatic row skipping for header/metadata rows</li>
                    </ul>
                    <p className="mt-2 text-sm">Create or modify scanner configurations in <Link to="/settings?tab=scanner-configurations" className="storage-link underline">Settings → Scanner Configurations</Link> to handle different scanner output formats.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">CSV Format</h3>
                    <p className="mb-2">The required columns depend on your selected scanner configuration:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>
                        <strong>Barcode column:</strong> Contains the tube barcode/ID (column name varies by scanner). Leave empty for wells that should be empty.
                      </li>
                      <li>
                        <strong>Position:</strong> Either a single position column (e.g., &quot;A01&quot;) or separate row and column columns that are automatically combined (e.g., Row=&quot;A&quot;, Column=&quot;1&quot; becomes &quot;A01&quot;). The CSV must list all 96 well positions (A01–H12) exactly once, as produced by scanning software.
                      </li>
                      <li>
                        <strong>Row skipping:</strong> Some configurations skip header/metadata rows at the start of the file
                      </li>
                    </ul>
                    <p className="mt-2 text-sm">The system automatically maps your CSV columns based on the selected scanner configuration. If a well is empty in your file but currently has a tube, that tube must appear elsewhere in the move (in any CSV targeting that plate) so it is relocated and no tube is lost.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Filename Convention</h3>
                    <p className="mb-2">Name your CSV files after the destination plate. The system derives a stem from the filename (path and .csv are removed; date/time suffixes like <code className="bg-app-surface px-1 rounded">_2024-01-15</code> are stripped) and suggests plates by exact, then partial, match. If exactly one plate is suggested, it is auto-selected.</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>Example: <code className="bg-app-surface px-1 rounded">PLATE-001.csv</code> or <code className="bg-app-surface px-1 rounded">PLATE-001_2024-01-15.csv</code> → stem &quot;PLATE-001&quot;</li>
                      <li>If no single plate is suggested, choose the destination from the list</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-app-text mb-2">Workflow</h3>
                    <p className="mb-2">This process has {createPlatesStepUsed ? '4' : '3'} steps:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination plates. Click <strong>Next</strong> to validate and continue.</li>
                      {createPlatesStepUsed && (
                        <li><strong>Create Plates:</strong> Assign a storage location for any destination plates that do not exist yet.</li>
                      )}
                      <li><strong>Resolve:</strong> System finds each tube by barcode and identifies source plates</li>
                      <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-app-card rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Upload CSV Files</h2>

              {/* Scanner Configuration Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-app-text mb-2">
                  Scanner Configuration *
                </label>
                {scannerConfigurations.length > 0 ? (
                  <>
                    <select
                      value={selectedConfigId || ''}
                      onChange={(e) => handleConfigChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                    >
                      {scannerConfigurations.map((config) => (
                        <option key={config.id} value={config.id}>
                          {config.name}{config.isDefault ? ' (Default)' : ''}
                        </option>
                      ))}
                    </select>
                    {selectedConfigId && (() => {
                      const config = scannerConfigurations.find(c => c.id === selectedConfigId)
                      return config ? (
                        <p className="text-xs text-app-text-muted mt-1">
                          Barcode: {config.barcodeColumn}
                          {config.positionType === 'single' && `, Position: ${config.positionColumn}`}
                          {config.positionType === 'combined' && `, Row: ${config.rowColumn}, Column: ${config.columnColumn} (auto-padded)`}
                          {config.skipRows > 0 && `, Skip: ${config.skipRows} rows`}
                        </p>
                      ) : null
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-app-text-muted italic">
                    No scanner configurations available. Please configure them in <Link to="/settings?tab=scanner-configurations" className="text-app-accent hover:text-app-accent-hover underline">Settings → Scanner Configurations</Link>.
                  </p>
                )}
              </div>

              {!selectedConfigId && scannerConfigurations.length > 0 && (
                <p className="text-sm text-amber-600 mb-2">
                  Please select a scanner configuration before uploading files.
                </p>
              )}
              {selectedConfigId &&
                (() => {
                  const cfg = scannerConfigurations.find((c) => c.id === selectedConfigId)
                  if (cfg?.plateNameSource === 'column' && cfg.plateNameColumn?.trim()) {
                    return (
                      <p className="text-sm text-app-text-muted mb-2 border-l-2 border-app-accent/40 pl-3">
                        Destination plate is read from column{' '}
                        <span className="font-mono text-app-accent">{cfg.plateNameColumn.trim()}</span>
                        . Every row must use the same plate name.
                      </p>
                    )
                  }
                  return null
                })()}

              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileChange}
                disabled={loading || !selectedConfigId}
                className="file-input-accent"
              />

              {files.length > 0 && (
                <div className="mt-6 space-y-4">
                  {files.map((fileData, index) => (
                    <div key={index} className="border border-app-border rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-app-text">{fileData.file.name}</h3>
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

                      {/* Plate Selection */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-app-text mb-2">
                          Destination Plate:
                        </label>
                        {fileData.inferredMatches.length === 1 &&
                          fileData.selectedPlateName === fileData.inferredMatches[0].name &&
                          (() => {
                            const cfg = scannerConfigurations.find((c) => c.id === selectedConfigId)
                            const fromCol = cfg?.plateNameSource === 'column' && cfg.plateNameColumn?.trim()
                            return (
                              <p className="text-xs text-app-trend-up mb-1">
                                ✓ Inferred from {fromCol ? `column "${cfg.plateNameColumn!.trim()}"` : 'file name'} — you can change it below if needed.
                              </p>
                            )
                          })()}
                        <MicronixPlatePicker
                          locations={locations}
                          plates={availablePlates}
                          value={fileData.selectedPlateName || undefined}
                          onChange={(plateName) => updateFilePlateSelection(index, plateName)}
                          suggestedPlates={fileData.inferredMatches}
                          allowCreateNew
                          suggestedNewPlateName={fileData.inferredPlateName}
                        />
                        {fileData.selectedPlateName &&
                          !isExistingPlateName(fileData.selectedPlateName, availablePlates) && (
                          <p className="text-xs text-app-accent mt-1">
                            New plate &quot;{fileData.selectedPlateName}&quot; — assign a storage location in the next step.
                          </p>
                        )}
                        {fileData.inferredPlateName &&
                          !fileData.selectedPlateName &&
                          !isExistingPlateName(fileData.inferredPlateName, availablePlates) && (
                          <button
                            type="button"
                            onClick={() => updateFilePlateSelection(index, fileData.inferredPlateName!)}
                            className="mt-2 text-sm text-app-accent underline hover:no-underline"
                          >
                            Use inferred name: {fileData.inferredPlateName}
                          </button>
                        )}
                        {fileData.inferredPlateName && !fileData.selectedPlateName && (
                          <p className="text-xs text-app-text-muted mt-1">
                            No single plate suggested for &quot;{fileData.inferredPlateName}&quot;. Select an existing plate or create a new one with any name.
                            {fileData.inferredMatches.length > 0 && (
                              <span className="ml-1">({fileData.inferredMatches.length} similar plate{fileData.inferredMatches.length !== 1 ? 's' : ''} found)</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Preview — show only CSV columns, not internal normalized keys */}
                      {fileData.preview.length > 0 && (() => {
                        const internalKeys = new Set(['container_barcode', 'target_position'])
                        const previewHeaders = Object.keys(fileData.preview[0]).filter((h) => !internalKeys.has(h))
                        return (
                          <div className="mt-3">
                            <h4 className="text-sm font-medium text-app-text mb-2">Preview (first 5 rows):</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-app-border text-xs">
                                <thead className="bg-app-surface">
                                  <tr>
                                    {previewHeaders.map((header) => (
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
                                      {previewHeaders.map((header) => (
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
                        )
                      })()}

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
                onClick={handleValidateAndResolve}
                disabled={files.length === 0 || loading || files.some(f => !f.selectedPlateName || f.validationErrors.length > 0)}
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Processing...'
                  : missingDestinationPlateNames.length > 0
                    ? 'Next: Create Destination Plates'
                    : 'Next: Resolve Containers'}
              </button>
            </div>
          </>
        )}

        {/* Step 2 (optional): Create destination plates */}
        {effectiveStep === 'create_plates' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-2">Create Destination Plates</h2>
              <p className="text-sm text-app-text-muted mb-6">
                {destinationPlatesAlreadyCreated
                  ? 'Destination plates are ready. Continue to resolve tubes, or go back to upload to change your CSV.'
                  : 'The following destination plates do not exist yet. Assign a storage location for each one before continuing.'}
              </p>

              <div className="space-y-4">
                {pendingDestinationPlates.map((plate, index) => (
                  <div key={plate.name} className="border border-app-border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-app-text">{plate.name}</h3>
                        <p className="text-xs text-app-text-muted mt-1">New micronix plate</p>
                      </div>
                      {plate.status === 'success' && (
                        <span className="text-app-trend-up text-sm font-medium">Created</span>
                      )}
                      {plate.status === 'creating' && (
                        <span className="text-app-accent text-sm">Creating...</span>
                      )}
                      {plate.status === 'error' && (
                        <span className="text-app-trend-down text-sm">Error</span>
                      )}
                    </div>

                    {plate.status === 'error' && plate.error && (
                      <div className="mb-3 text-sm text-app-trend-down">{plate.error}</div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-app-text mb-2">Location *</label>
                      <LocationPicker
                        value={plate.locationId}
                        onChange={(locationId) => {
                          setPendingDestinationPlates((prev) => {
                            const next = [...prev]
                            next[index] = { ...next[index], locationId, error: undefined }
                            return next
                          })
                        }}
                        filterCollectionsOnly
                        disabled={plate.status === 'creating' || plate.status === 'success'}
                      />
                    </div>

                    <div className="mt-3">
                      <label className="block text-sm font-medium text-app-text mb-2">Barcode (optional)</label>
                      <input
                        type="text"
                        value={plate.barcode}
                        onChange={(e) => {
                          setPendingDestinationPlates((prev) => {
                            const next = [...prev]
                            next[index] = { ...next[index], barcode: e.target.value }
                            return next
                          })
                        }}
                        disabled={plate.status === 'creating' || plate.status === 'success'}
                        className="form-input w-full"
                        placeholder="Enter plate barcode (optional)"
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
                  setPendingDestinationPlates([])
                  setCurrentStep('upload')
                }}
                className="storage-btn-secondary"
                disabled={loading}
              >
                Back
              </button>
              <button
                type="button"
                onClick={
                  destinationPlatesAlreadyCreated
                    ? runResolveWithFreshPlates
                    : handleCreateDestinationPlates
                }
                disabled={
                  loading ||
                  pendingDestinationPlates.some((p) => p.status === 'creating') ||
                  pendingDestinationPlates.length === 0
                }
                className="storage-btn-primary px-6 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? 'Processing...'
                  : destinationPlatesAlreadyCreated
                    ? 'Continue to Resolve'
                    : 'Create Plates & Continue'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Resolve */}
        {effectiveStep === 'resolve' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-4">Resolved Micronix Tubes</h2>
              
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
                <h3 className="font-semibold mb-2">Source Plates Detected:</h3>
                <ul className="list-disc list-inside space-y-1 text-app-text">
                  {getAllSourcePlates().map((plateName) => (
                    <li key={plateName}>{plateName}</li>
                  ))}
                </ul>
              </div>

              {/* Per-file breakdown */}
              <div className="mt-6 space-y-4">
                {files.map((fileData, index) => (
                  <div key={index} className="border border-app-border rounded-lg p-4">
                    <h4 className="font-semibold text-app-text mb-2">{fileData.file.name}</h4>
                    <p className="text-sm text-app-text mb-2">
                      Destination: <span className="font-semibold">{fileData.selectedPlateName}</span>
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
                          The following barcodes were not found in the database. Please check for typos or verify the barcodes exist.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-app-trend-down text-xs">
                            <thead className="bg-app-trend-down/10">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Row</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-app-trend-down uppercase">Barcode</th>
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
                                    {unresolved.barcode}
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
                      name="micronix-atomic-mode"
                      value="all_or_nothing"
                      checked={atomicMode === 'all_or_nothing'}
                      onChange={() => setAtomicMode('all_or_nothing')}
                      className="mt-1"
                    />
                    <span className="text-sm text-app-text">
                      <strong>All-or-nothing</strong>: any invalid row blocks all moves.
                    </span>
                  </label>
                  <label className="flex items-start gap-2">
                    <input
                      type="radio"
                      name="micronix-atomic-mode"
                      value="best_effort"
                      checked={atomicMode === 'best_effort'}
                      onChange={() => setAtomicMode('best_effort')}
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
                  setCurrentStep(missingDestinationPlateNames.length > 0 ? 'create_plates' : 'upload')
                }}
                className="storage-btn-secondary"
              >
                Back
              </button>
              <button
                onClick={handleExecuteMoves}
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
                      <p className="text-sm text-app-text-muted">Destination: {result.destinationPlate}</p>
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
                  setFiles([])
                  setMoveResult(null)
                  setInstructionsExpanded(false)
                  setPendingDestinationPlates([])
                  setCreatePlatesStepUsed(false)
                  setCurrentStep('upload')
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
