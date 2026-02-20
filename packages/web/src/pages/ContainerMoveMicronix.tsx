import { useState, useEffect, useRef } from 'react'
import { useSearchParams, Link, useNavigate, Navigate } from 'react-router-dom'
import { collectionsApi, locationsApi, scannerConfigurationsApi, type Location, type ScannerConfiguration } from '../lib/api'
import { normalizeWellPosition, validateFullPlatePositions } from '../lib/micronix-plate-positions'
import MicronixPlatePicker, { type MicronixPlate } from '../components/MicronixPlatePicker'
import { useUser } from '../contexts/UserContext'
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
  inferredMatches: MicronixPlate[]
  selectedPlateName: string | null
  csvRows: CSVRow[]
  resolvedContainers: ResolvedContainer[]
  unresolvedContainers: UnresolvedContainer[]
  validationErrors: ValidationError[]
  isResolved: boolean
  preview: CSVRow[]
}

type Step = 'upload' | 'resolve' | 'execute'
type ContainerMoveAtomicMode = 'all_or_nothing' | 'best_effort'

export default function ContainerMoveMicronix() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as Step) || 'upload'
  const [files, setFiles] = useState<FileData[]>([])
  const [loading, setLoading] = useState(false)
  const [availablePlates, setAvailablePlates] = useState<MicronixPlate[]>([])
  const [locations, setLocations] = useState<Location[]>([])
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
  const [scannerConfigurations, setScannerConfigurations] = useState<ScannerConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Load available plates, locations, and scanner configurations on mount
  useEffect(() => {
    Promise.all([
      collectionsApi.listCollectionsByType('micronix_plate'),
      locationsApi.list(),
      scannerConfigurationsApi.getAll(),
    ]).then(([collectionsResponse, locationsResponse, scannerConfigsResponse]) => {
      const collections = collectionsResponse.data.collections as any[]
      setAvailablePlates(
        collections.map((c: any) => ({
          id: c.id,
          name: c.name,
          barcode: c.barcode || null,
          locationId: c.locationId || null,
          itemCount: c.itemCount || 0,
          locationPath: c.location?.path || null,
        }))
      )
      setLocations(locationsResponse.data.locations || [])
      
      // Load scanner configurations
      // The API returns { key, value } format, where value is ScannerConfigurations
      // Handle both direct ScannerConfigurations and { key, value } wrapper
      const configsData = (scannerConfigsResponse.data as any)?.value || scannerConfigsResponse.data
      if (configsData && configsData.configurations) {
        const configs = configsData.configurations
        setScannerConfigurations(configs)
        // Auto-select default configuration
        const defaultConfig = configs.find((c: ScannerConfiguration) => c.isDefault === true)
        if (defaultConfig) {
          setSelectedConfigId(defaultConfig.id)
        } else if (configs.length > 0) {
          setSelectedConfigId(configs[0].id)
        }
      }
    }).catch((error) => {
      console.error('Failed to load collections, locations, or scanner configurations:', error)
    })
  }, [])

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
          const csvRows = parseCSV(text, config)
          const validation = validateCSV(csvRows, config)
          const preview = csvRows.slice(0, 5)
          updated.push({
            ...fileData,
            csvRows,
            validationErrors: validation.errors,
            preview,
            resolvedContainers: [],
            unresolvedContainers: [],
            isResolved: false,
          })
        } catch {
          updated.push(fileData)
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

  const setCurrentStep = (step: Step) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  // Parse filename to infer plate name - requires exact match
  const parseFilename = (filename: string): string => {
    // Remove .csv extension and trim
    const baseName = filename.replace(/\.csv$/i, '').trim()
    if (!baseName) return ''
    
    // Find exact match (case-insensitive)
    const exactMatch = availablePlates.find(p => 
      p.name.toLowerCase() === baseName.toLowerCase()
    )
    
    return exactMatch ? exactMatch.name : ''
  }

  // Find matching plates for a given inferred name (for exact matches, should only return 0 or 1)
  const findMatchingPlates = (inferredName: string): MicronixPlate[] => {
    if (!inferredName) return []
    
    // With exact matching, we should only get 0 or 1 match
    // But handle case where there might be duplicate names (case-insensitive)
    const inferredLower = inferredName.toLowerCase()
    return availablePlates.filter(p => 
      p.name.toLowerCase() === inferredLower
    )
  }

  const buildPosition = (config: ScannerConfiguration, row: CSVRow): string => {
    if (config.positionType === 'single') {
      return row[config.positionColumn!]?.trim() || ''
    } else {
      const rowVal = row[config.rowColumn!]?.trim() || ''
      const colVal = row[config.columnColumn!]?.trim() || ''
      // Always pad column to 2 digits (01-12 for micronix plates)
      const paddedCol = colVal.padStart(2, '0')
      return `${rowVal}${paddedCol}`
    }
  }

  const parseCSV = (text: string, config: ScannerConfiguration): CSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2 + config.skipRows) return []

    // Skip header rows
    const headerLine = lines[config.skipRows]
    const headers = headerLine.split(',').map(h => h.trim())
    const rows: CSVRow[] = []

    // Parse data rows
    for (let i = config.skipRows + 1; i < lines.length; i++) {
      const values = lines[i].split(',')
      const row: CSVRow = {}
      headers.forEach((header, j) => {
        row[header] = values[j]?.trim() || ''
      })

      // Add normalized fields (internal format)
      row.container_barcode = row[config.barcodeColumn] || ''
      if (config.positionType === 'single') {
        row.target_position = row[config.positionColumn!] || ''
      } else {
        row.target_position = buildPosition(config, row)
      }

      rows.push(row)
    }

    return rows
  }

  const validateCSV = (rows: CSVRow[], config: ScannerConfiguration): { valid: boolean; errors: ValidationError[] } => {
    const errors: ValidationError[] = []

    if (rows.length === 0) {
      return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }] }
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Barcode may be empty (empty well); only position is required
      if (!row.target_position || row.target_position.trim() === '') {
        const positionDesc = config.positionType === 'single'
          ? `Position column "${config.positionColumn}"`
          : `Row column "${config.rowColumn}" and Column column "${config.columnColumn}"`
        errors.push({
          row: i + 1,
          error: `${positionDesc} is required but missing or empty`,
        })
      }
    }

    // Require all 96 well positions (A01–H12) exactly once, as from scanning software
    const positionSet = new Set<string>()
    for (const row of rows) {
      const pos = row.target_position?.trim() ?? ''
      if (pos) {
        const normalized = normalizeWellPosition(pos)
        if (normalized) positionSet.add(normalized)
      }
    }
    const fullPlate = validateFullPlatePositions(positionSet)
    if (!fullPlate.valid) {
      const parts: string[] = [
        `CSV must list all 96 well positions (A01–H12) exactly once, as produced by scanning software.`,
        `Found ${positionSet.size} valid position(s).`,
      ]
      if (fullPlate.missing && fullPlate.missing.length > 0) {
        const sample = fullPlate.missing.slice(0, 5).join(', ')
        const more = fullPlate.missing.length > 5 ? ` and ${fullPlate.missing.length - 5} more` : ''
        parts.push(`Missing: ${sample}${more}.`)
      }
      if (fullPlate.extra && fullPlate.extra.length > 0) {
        const sample = fullPlate.extra.slice(0, 5).join(', ')
        const more = fullPlate.extra.length > 5 ? ` and ${fullPlate.extra.length - 5} more` : ''
        parts.push(`Invalid or duplicate: ${sample}${more}.`)
      }
      errors.push({ row: 0, error: parts.join(' ') })
    }

    return {
      valid: errors.length === 0,
      errors,
    }
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
        const csvRows = parseCSV(text, selectedConfig)
        const validation = validateCSV(csvRows, selectedConfig)
        
        // Get preview (first 5 rows)
        const preview = csvRows.slice(0, 5)
        
        // Infer plate name from filename
        const inferredName = parseFilename(file.name)
        const matches = findMatchingPlates(inferredName)
        
        let inferredPlateName: string | null = null
        let selectedPlateName: string | null = null
        
        if (matches.length === 1) {
          // Single match - auto-select
          inferredPlateName = matches[0].name
          selectedPlateName = matches[0].name
        } else if (matches.length > 1) {
          // Multiple matches - require user selection
          inferredPlateName = inferredName
        } else if (inferredName) {
          // No matches but we have an inferred name - require user selection
          inferredPlateName = inferredName
        }

        newFiles.push({
          file,
          inferredPlateName,
          inferredMatches: matches,
          selectedPlateName,
          csvRows,
          resolvedContainers: [],
          unresolvedContainers: [],
          validationErrors: validation.errors,
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

  const handleValidateAndResolve = async () => {
    // Validate all files have destination plates
    const filesWithoutPlates = files.filter(f => !f.selectedPlateName)
    if (filesWithoutPlates.length > 0) {
      // Update validation errors for files without plates
      setFiles(prev => prev.map(f => {
        if (!f.selectedPlateName) {
          return {
            ...f,
            validationErrors: [
              ...f.validationErrors,
              { row: 0, error: 'Destination plate must be selected for this file' }
            ]
          }
        }
        return f
      }))
      return
    }

    // Validate CSV format for all files
    const filesWithErrors = files.filter(f => f.validationErrors.length > 0)
    if (filesWithErrors.length > 0) {
      setCurrentStep('upload')
      return
    }

    setLoading(true)

    try {
      // Resolve containers for all files (only rows with barcode; empty barcode = empty well)
      const allIdentifiers: Array<{ type: 'barcode'; barcode: string; fileIndex: number; rowIndex: number }> = []

      files.forEach((fileData, fileIndex) => {
        fileData.csvRows.forEach((row, rowIndex) => {
          const barcode = row.container_barcode?.trim() ?? ''
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
        identifiers: allIdentifiers.map(({ type, barcode }) => ({ type, barcode }))
      })

      const resolved = resolveResponse.data.containers
      
      // Create a set of resolved barcodes for quick lookup
      // The API returns { identifier, container } where identifier can be the object or the barcode string
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
      
      // Group resolved containers by file
      const resolvedByFile = new Map<number, ResolvedContainer[]>()
      resolved.forEach((r: any) => {
        if (!r.container) return
        
        const barcode = typeof r.identifier === 'string' 
          ? r.identifier 
          : r.identifier?.barcode
        if (!barcode) return
        
        // Find the identifier in allIdentifiers to get fileIndex
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

      // Track unresolved containers by file
      const unresolvedByFile = new Map<number, UnresolvedContainer[]>()
      allIdentifiers.forEach((id) => {
        if (!resolvedBarcodes.has(id.barcode)) {
          if (!unresolvedByFile.has(id.fileIndex)) {
            unresolvedByFile.set(id.fileIndex, [])
          }
          const csvRow = files[id.fileIndex].csvRows[id.rowIndex]
          unresolvedByFile.get(id.fileIndex)!.push({
            barcode: id.barcode,
            rowIndex: id.rowIndex + 1, // Convert to 1-based for display
            targetPosition: csvRow.target_position || '',
          })
        }
      })

      // Verify all containers are from micronix plates
      const invalidContainers = resolved.filter((r: any) => 
        r.container.currentCollectionType !== 'micronix_plate'
      )
      
      if (invalidContainers.length > 0) {
        // Add validation errors for invalid containers
        setFiles(prev => prev.map((f, i) => {
          const fileInvalid = resolvedByFile.get(i)?.some(rc =>
            invalidContainers.some((ic: any) => ic.container.containerId === rc.container.containerId)
          )
          if (fileInvalid) {
            return {
              ...f,
              validationErrors: [
                ...f.validationErrors,
                { row: 0, error: 'Some containers are not from micronix plates' }
              ]
            }
          }
          return f
        }))
        setLoading(false)
        return
      }

      // Relocation validation (no tube lost): per destination plate, across all files targeting it
      const relocationErrorsByFile = new Map<number, ValidationError[]>()
      const uniqueDestinationNames = [...new Set(files.map(f => f.selectedPlateName).filter(Boolean))] as string[]

      for (const plateName of uniqueDestinationNames) {
        const plateId = availablePlates.find(p => p.name === plateName)?.id
        if (plateId == null) {
          const fileIndicesTargetingPlate = files
            .map((f, i) => (f.selectedPlateName === plateName ? i : -1))
            .filter((i) => i >= 0)
          const err: ValidationError = {
            row: 0,
            error: `Destination plate "${plateName}" could not be found. Please select a valid plate from the list.`,
          }
          fileIndicesTargetingPlate.forEach((fileIndex) => {
            if (!relocationErrorsByFile.has(fileIndex)) relocationErrorsByFile.set(fileIndex, [])
            relocationErrorsByFile.get(fileIndex)!.push(err)
          })
          continue
        }

        const plateResponse = await collectionsApi.getMicronixPlate(plateId)
        const wells: Record<string, { type: string; barcode?: string | null }> = plateResponse.data.wells ?? {}

        // All rows (from any file) targeting this plate
        const rowsForPlate: { fileIndex: number; row: CSVRow }[] = []
        files.forEach((fileData, fileIndex) => {
          if (fileData.selectedPlateName !== plateName) return
          fileData.csvRows.forEach(row => rowsForPlate.push({ fileIndex, row }))
        })

        const positionToBarcode = new Map<string, string>()
        const positionToEmptyFileIndex = new Map<string, number>()
        for (const { fileIndex, row } of rowsForPlate) {
          const pos = row.target_position?.trim() ?? ''
          const barcode = row.container_barcode?.trim() ?? ''
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

      // Update files with resolved/unresolved and any relocation validation errors
      setFiles(prev => prev.map((f, i) => {
        const base = {
          ...f,
          resolvedContainers: resolvedByFile.get(i) || [],
          unresolvedContainers: unresolvedByFile.get(i) || [],
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
    } catch (error: any) {
      console.error('Error resolving containers:', error)
      setFiles(prev => prev.map(f => ({
        ...f,
        validationErrors: [
          ...f.validationErrors,
          { row: 0, error: error.response?.data?.error || error.message || 'Failed to resolve containers' }
        ]
      })))
    } finally {
      setLoading(false)
    }
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
          const barcode = row.container_barcode?.trim() ?? ''
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
        const moved = response.data.success ? fileMoves.length : 0
        const errors = response.data.errors?.filter((e: ValidationError) => {
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

      if (response.data.success) {
        setMoveResult({
          success: true,
          moved: response.data.moved,
          fileResults,
        })
        setCurrentStep('execute')
      } else {
        setMoveResult({
          success: false,
          moved: response.data.moved || 0,
          errors: response.data.errors,
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

        {/* Step indicator */}
        <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
          <div className="storage-step-indicator">
            <div className={`storage-step-item ${currentStep === 'upload' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">1</span>
              <span>Upload & Configure</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'resolve' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">2</span>
              <span>Resolve</span>
            </div>
            <div className="storage-step-connector" />
            <div className={`storage-step-item ${currentStep === 'execute' ? 'storage-step-item--active' : ''}`}>
              <span className="storage-step-item__circle">3</span>
              <span>Execute</span>
            </div>
          </div>
        </div>

        {/* Step 1: Upload & Configure */}
        {currentStep === 'upload' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <button
                type="button"
                onClick={() => setInstructionsExpanded(!instructionsExpanded)}
                className="flex items-center justify-between w-full text-left focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
              >
                <h2 className="text-xl font-semibold">Instructions</h2>
                <svg
                  className={`w-5 h-5 text-gray-500 transition-transform ${instructionsExpanded ? 'transform rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              
              {instructionsExpanded && (
                <div className="space-y-4 text-gray-700 mt-4">
                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Overview</h3>
                    <p>Upload one or more CSV files representing plate scans. Each file should be named after the destination plate it represents. The system will infer the destination plate from the filename, or you can select it manually.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Scanner Configuration</h3>
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
                    <h3 className="font-semibold text-gray-900 mb-2">CSV Format</h3>
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
                    <h3 className="font-semibold text-gray-900 mb-2">Filename Convention</h3>
                    <p className="mb-2">Name your CSV files to exactly match the destination plate name:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>The filename (without .csv extension) must exactly match a plate name in the database</li>
                      <li>Example: If plate is named &quot;PLATE-001&quot;, name your file <code className="bg-gray-100 px-1 rounded">PLATE-001.csv</code></li>
                      <li>Example: If plate is named &quot;1022&quot;, name your file <code className="bg-gray-100 px-1 rounded">1022.csv</code></li>
                      <li>Matching is case-insensitive, but the filename must match exactly (no extra characters)</li>
                      <li>If the plate name cannot be inferred, you'll be prompted to select it manually</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Workflow</h3>
                    <p className="mb-2">This process has 3 steps:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination plates. Click <strong>Next: Resolve Containers</strong> to validate (e.g. tubes removed with no destination) and resolve barcodes.</li>
                      <li><strong>Resolve:</strong> System finds each tube by barcode and identifies source plates</li>
                      <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Upload CSV Files</h2>

              {/* Scanner Configuration Selector */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Scanner Configuration *
                </label>
                {scannerConfigurations.length > 0 ? (
                  <>
                    <select
                      value={selectedConfigId || ''}
                      onChange={(e) => handleConfigChange(e.target.value)}
                      required
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
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
                        <p className="text-xs text-gray-500 mt-1">
                          Barcode: {config.barcodeColumn}
                          {config.positionType === 'single' && `, Position: ${config.positionColumn}`}
                          {config.positionType === 'combined' && `, Row: ${config.rowColumn}, Column: ${config.columnColumn} (auto-padded)`}
                          {config.skipRows > 0 && `, Skip: ${config.skipRows} rows`}
                        </p>
                      ) : null
                    })()}
                  </>
                ) : (
                  <p className="text-sm text-gray-500 italic">
                    No scanner configurations available. Please configure them in <Link to="/settings?tab=scanner-configurations" className="text-teal-600 hover:text-teal-800 underline">Settings → Scanner Configurations</Link>.
                  </p>
                )}
              </div>

              {!selectedConfigId && scannerConfigurations.length > 0 && (
                <p className="text-sm text-amber-600 mb-2">
                  Please select a scanner configuration before uploading files.
                </p>
              )}
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
                    <div key={index} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900">{fileData.file.name}</h3>
                          <p className="text-sm text-gray-500 mt-1">
                            {fileData.csvRows.length} row{fileData.csvRows.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(index)}
                          className="text-red-600 hover:text-red-800 text-sm"
                        >
                          Remove
                        </button>
                      </div>

                      {/* Plate Selection */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Destination Plate:
                        </label>
                        {fileData.inferredPlateName && fileData.selectedPlateName && fileData.inferredMatches.length === 1 ? (
                          <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded p-2">
                            ✓ Inferred: <span className="font-semibold">{fileData.selectedPlateName}</span>
                          </div>
                        ) : (
                          <MicronixPlatePicker
                            locations={locations}
                            plates={availablePlates}
                            value={fileData.selectedPlateName || undefined}
                            onChange={(plateName) => updateFilePlateSelection(index, plateName)}
                          />
                        )}
                        {fileData.inferredPlateName && !fileData.selectedPlateName && (
                          <p className="text-xs text-gray-500 mt-1">
                            No exact match found for &quot;{fileData.inferredPlateName}&quot;. Please select a destination plate.
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
                            <h4 className="text-sm font-medium text-gray-700 mb-2">Preview (first 5 rows):</h4>
                            <div className="overflow-x-auto">
                              <table className="min-w-full divide-y divide-gray-200 text-xs">
                                <thead className="bg-gray-50">
                                  <tr>
                                    {previewHeaders.map((header) => (
                                      <th
                                        key={header}
                                        className="px-2 py-1 text-left text-xs font-medium text-gray-500 uppercase"
                                      >
                                        {header}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                  {fileData.preview.map((row, i) => (
                                    <tr key={i}>
                                      {previewHeaders.map((header) => (
                                        <td key={header} className="px-2 py-1 whitespace-nowrap text-gray-900">
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
                        <div className="mt-3 bg-red-50 border border-red-200 rounded p-2">
                          <h4 className="text-sm font-semibold text-red-800 mb-1">Errors:</h4>
                          <ul className="list-disc list-inside space-y-1 text-red-700 text-xs">
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
                {loading ? 'Processing...' : 'Next: Resolve Containers'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Resolve */}
        {currentStep === 'resolve' && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
              <h2 className="text-xl font-semibold mb-4">Resolved Micronix Tubes</h2>
              
              <div className="mb-4">
                <p className="text-gray-700">
                  <strong>Total Files:</strong> {files.length}
                </p>
                <p className="text-gray-700">
                  <strong>Total Tubes:</strong> {files.reduce((sum, f) => sum + f.resolvedContainers.length, 0)} of {files.reduce((sum, f) => sum + f.csvRows.length, 0)} resolved
                </p>
                {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0) > 0 && (
                  <p className="text-red-600 font-semibold mt-1">
                    <strong>Unresolved:</strong> {files.reduce((sum, f) => sum + f.unresolvedContainers.length, 0)} tube(s) could not be found in the database
                  </p>
                )}
              </div>

              <div className="mb-4">
                <h3 className="font-semibold mb-2">Source Plates Detected:</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {getAllSourcePlates().map((plateName) => (
                    <li key={plateName}>{plateName}</li>
                  ))}
                </ul>
              </div>

              {/* Per-file breakdown */}
              <div className="mt-6 space-y-4">
                {files.map((fileData, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{fileData.file.name}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      Destination: <span className="font-semibold">{fileData.selectedPlateName}</span>
                    </p>
                    <p className="text-sm text-gray-700 mb-2">
                      Resolved: {fileData.resolvedContainers.length} of {fileData.csvRows.length} tubes
                    </p>
                    {fileData.unresolvedContainers.length > 0 && (
                      <div className="mt-3 bg-red-50 border border-red-200 rounded p-3">
                        <h5 className="text-sm font-semibold text-red-800 mb-2">
                          Unresolved Tubes ({fileData.unresolvedContainers.length}):
                        </h5>
                        <p className="text-xs text-red-700 mb-2">
                          The following barcodes were not found in the database. Please check for typos or verify the barcodes exist.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-red-200 text-xs">
                            <thead className="bg-red-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-red-800 uppercase">Row</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-red-800 uppercase">Barcode</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-red-800 uppercase">Target Position</th>
                              </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-red-200">
                              {fileData.unresolvedContainers.map((unresolved, i) => (
                                <tr key={i}>
                                  <td className="px-3 py-2 whitespace-nowrap text-red-900 font-medium">
                                    {unresolved.rowIndex}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-red-900 font-mono">
                                    {unresolved.barcode}
                                  </td>
                                  <td className="px-3 py-2 whitespace-nowrap text-red-700">
                                    {unresolved.targetPosition || <span className="text-gray-400 italic">N/A</span>}
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

              <div className="mt-6 border border-gray-200 rounded-lg p-4 bg-gray-50">
                <h3 className="font-semibold text-gray-900 mb-3">Atomicity Mode</h3>
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
                    <span className="text-sm text-gray-700">
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
                    <span className="text-sm text-gray-700">
                      <strong>Best effort</strong>: valid rows are moved, invalid rows are returned as errors.
                    </span>
                  </label>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('upload')}
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
        {currentStep === 'execute' && moveResult && (
          <>
            <div
              className={`border rounded-lg p-6 mb-6 ${
                moveResult.success
                  ? 'bg-green-50 border-green-200'
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <h3
                className={`text-lg font-semibold mb-2 ${
                  moveResult.success ? 'text-green-800' : 'text-red-800'
                }`}
              >
                {moveResult.success ? 'Moves Successful' : 'Moves Failed'}
              </h3>
              <p className={moveResult.success ? 'text-green-700' : 'text-red-700'}>
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
                  <h4 className="font-semibold text-gray-900">Per-File Results:</h4>
                  {moveResult.fileResults.map((result, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded p-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-900">{result.filename}</span>
                        <span className={`text-sm ${result.moved > 0 ? 'text-green-600' : 'text-gray-500'}`}>
                          {result.moved} moved
                        </span>
                      </div>
                      <p className="text-sm text-gray-600">Destination: {result.destinationPlate}</p>
                      {result.errors && result.errors.length > 0 && (
                        <ul className="mt-2 list-disc list-inside text-sm text-red-700">
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
                  <h4 className="font-semibold text-red-800 mb-2">Errors:</h4>
                  <ul className="list-disc list-inside space-y-2 text-red-700">
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
