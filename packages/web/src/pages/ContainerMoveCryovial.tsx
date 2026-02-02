import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate, Navigate } from 'react-router-dom'
import { collectionsApi, locationsApi, type Location } from '../lib/api'
import CryovialBoxPicker, { type CryovialBox } from '../components/CryovialBoxPicker'
import { useUser } from '../contexts/UserContext'

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
  identifier: string
  container: ContainerInfo
}

interface UnresolvedContainer {
  identifier: string
  rowIndex: number
  targetPosition: string
}

interface FileData {
  file: File
  inferredBoxName: string | null
  inferredMatches: CryovialBox[]
  selectedBoxName: string | null
  csvRows: CSVRow[]
  resolvedContainers: ResolvedContainer[]
  unresolvedContainers: UnresolvedContainer[]
  validationErrors: ValidationError[]
  isResolved: boolean
  preview: CSVRow[]
}

type Step = 'upload' | 'resolve' | 'execute'

export default function ContainerMoveCryovial() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as Step) || 'upload'

  if (!canWrite) {
    return <Navigate to="/" replace />
  }

  const setCurrentStep = (step: Step) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  const [files, setFiles] = useState<FileData[]>([])
  const [loading, setLoading] = useState(false)
  const [availableBoxes, setAvailableBoxes] = useState<CryovialBox[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    errors?: ValidationError[]
    fileResults?: Array<{
      filename: string
      destinationBox: string
      moved: number
      errors?: ValidationError[]
    }>
  } | null>(null)
  const [instructionsExpanded, setInstructionsExpanded] = useState(false)

  // Load available boxes and locations on mount
  useEffect(() => {
    Promise.all([
      collectionsApi.listCollectionsByType('cryovial_box'),
      locationsApi.list(),
    ]).then(([collectionsResponse, locationsResponse]) => {
      const collections = collectionsResponse.data.collections as any[]
      setAvailableBoxes(
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
    }).catch((error) => {
      console.error('Failed to load collections or locations:', error)
    })
  }, [])

  // Parse filename to infer box name - requires exact match
  const parseFilename = (filename: string): string => {
    // Remove .csv extension and trim
    const baseName = filename.replace(/\.csv$/i, '').trim()
    if (!baseName) return ''
    
    // Find exact match (case-insensitive)
    const exactMatch = availableBoxes.find(b => 
      b.name.toLowerCase() === baseName.toLowerCase()
    )
    
    return exactMatch ? exactMatch.name : ''
  }

  // Find matching boxes for a given inferred name (for exact matches, should only return 0 or 1)
  const findMatchingBoxes = (inferredName: string): CryovialBox[] => {
    if (!inferredName) return []
    
    // With exact matching, we should only get 0 or 1 match
    // But handle case where there might be duplicate names (case-insensitive)
    const inferredLower = inferredName.toLowerCase()
    return availableBoxes.filter(b => 
      b.name.toLowerCase() === inferredLower
    )
  }

  const parseCSV = (text: string): CSVRow[] => {
    const lines = text.split('\n').filter(line => line.trim())
    if (lines.length < 2) return []

    const headers = lines[0].split(',').map(h => h.trim())
    const rows: CSVRow[] = []

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(',')
      const row: CSVRow = {}
      headers.forEach((header, j) => {
        row[header] = values[j]?.trim() || ''
      })
      rows.push(row)
    }

    return rows
  }

  const validateCSV = (rows: CSVRow[]): { valid: boolean; errors: ValidationError[] } => {
    const errors: ValidationError[] = []

    if (rows.length === 0) {
      return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }] }
    }

    // For cryovial, we need source_collection_name, source_position, and target_position
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.source_collection_name || row.source_collection_name.trim() === '') {
        errors.push({
          row: i + 1,
          error: 'source_collection_name is required but missing or empty',
        })
      }
      if (!row.source_position || row.source_position.trim() === '') {
        errors.push({
          row: i + 1,
          error: 'source_position is required but missing or empty',
        })
      }
      if (!row.target_position || row.target_position.trim() === '') {
        errors.push({
          row: i + 1,
          error: 'target_position is required but missing or empty',
        })
      }
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

      for (const file of selectedFiles) {
        const text = await file.text()
        const csvRows = parseCSV(text)
        const validation = validateCSV(csvRows)
        
        // Get preview (first 5 rows)
        const preview = csvRows.slice(0, 5)
        
        // Infer box name from filename
        const inferredName = parseFilename(file.name)
        const matches = findMatchingBoxes(inferredName)
        
        let inferredBoxName: string | null = null
        let selectedBoxName: string | null = null
        
        if (matches.length === 1) {
          // Single match - auto-select
          inferredBoxName = matches[0].name
          selectedBoxName = matches[0].name
        } else if (matches.length > 1) {
          // Multiple matches - require user selection
          inferredBoxName = inferredName
        } else if (inferredName) {
          // No matches but we have an inferred name - require user selection
          inferredBoxName = inferredName
        }

        newFiles.push({
          file,
          inferredBoxName,
          inferredMatches: matches,
          selectedBoxName,
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

  const updateFileBoxSelection = (fileIndex: number, boxName: string | null) => {
    setFiles(prev => prev.map((f, i) => 
      i === fileIndex ? { ...f, selectedBoxName: boxName } : f
    ))
  }

  const removeFile = (fileIndex: number) => {
    setFiles(prev => prev.filter((_, i) => i !== fileIndex))
  }

  const downloadTemplate = () => {
    const csvContent = `source_collection_name,source_position,target_position
BOX-001,B5,C3
BOX-001,C2,D1
BOX-002,A1,B2`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'cryovial_move_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const handleValidateAndResolve = async () => {
    // Validate all files have destination boxes
    const filesWithoutBoxes = files.filter(f => !f.selectedBoxName)
    if (filesWithoutBoxes.length > 0) {
      // Update validation errors for files without boxes
      setFiles(prev => prev.map(f => {
        if (!f.selectedBoxName) {
          return {
            ...f,
            validationErrors: [
              ...f.validationErrors,
              { row: 0, error: 'Destination box must be selected for this file' }
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
      // Resolve containers for all files (position-based for cryovial)
      const allIdentifiers: Array<{ type: 'position'; sourceCollectionName: string; sourcePosition: string; fileIndex: number; rowIndex: number }> = []
      
      files.forEach((fileData, fileIndex) => {
        fileData.csvRows.forEach((row, rowIndex) => {
          allIdentifiers.push({
            type: 'position',
            sourceCollectionName: row.source_collection_name.trim(),
            sourcePosition: row.source_position.trim(),
            fileIndex,
            rowIndex,
          })
        })
      })

      const resolveResponse = await collectionsApi.resolveContainers({ 
        identifiers: allIdentifiers.map(({ type, sourceCollectionName, sourcePosition }) => ({ 
          type, 
          sourceCollectionName, 
          sourcePosition 
        }))
      })

      const resolved = resolveResponse.data.containers
      
      // Create a set of resolved identifiers for quick lookup
      const resolvedIdentifiers = new Set<string>()
      resolved.forEach((r: any) => {
        if (r.container) {
          const identifier = typeof r.identifier === 'string' 
            ? r.identifier 
            : `${r.identifier.sourceCollectionName}:${r.identifier.sourcePosition}`
          if (identifier) {
            resolvedIdentifiers.add(identifier)
          }
        }
      })
      
      // Group resolved containers by file
      const resolvedByFile = new Map<number, ResolvedContainer[]>()
      resolved.forEach((r: any) => {
        if (!r.container) return
        
        const identifier = typeof r.identifier === 'string' 
          ? r.identifier 
          : `${r.identifier.sourceCollectionName}:${r.identifier.sourcePosition}`
        if (!identifier) return
        
        // Find the identifier in allIdentifiers to get fileIndex
        const id = allIdentifiers.find(id => 
          `${id.sourceCollectionName}:${id.sourcePosition}` === identifier
        )
        if (id) {
          if (!resolvedByFile.has(id.fileIndex)) {
            resolvedByFile.set(id.fileIndex, [])
          }
          resolvedByFile.get(id.fileIndex)!.push({
            identifier: identifier,
            container: r.container,
          })
        }
      })

      // Track unresolved containers by file
      const unresolvedByFile = new Map<number, UnresolvedContainer[]>()
      allIdentifiers.forEach((id) => {
        const identifierKey = `${id.sourceCollectionName}:${id.sourcePosition}`
        if (!resolvedIdentifiers.has(identifierKey)) {
          if (!unresolvedByFile.has(id.fileIndex)) {
            unresolvedByFile.set(id.fileIndex, [])
          }
          const csvRow = files[id.fileIndex].csvRows[id.rowIndex]
          unresolvedByFile.get(id.fileIndex)!.push({
            identifier: identifierKey,
            rowIndex: id.rowIndex + 1, // Convert to 1-based for display
            targetPosition: csvRow.target_position || '',
          })
        }
      })

      // Update files with resolved and unresolved containers
      setFiles(prev => prev.map((f, i) => ({
        ...f,
        resolvedContainers: resolvedByFile.get(i) || [],
        unresolvedContainers: unresolvedByFile.get(i) || [],
        isResolved: true,
      })))

      // Verify all containers are from cryovial boxes
      const invalidContainers = resolved.filter((r: any) => 
        r.container.currentCollectionType !== 'cryovial_box'
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
                { row: 0, error: 'Some containers are not from cryovial boxes' }
              ]
            }
          }
          return f
        }))
        setLoading(false)
      return
    }

      setCurrentStep('resolve')
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
        identifier: { type: 'position'; sourceCollectionName: string; sourcePosition: string }
        targetPosition: string
        fileIndex: number
      }> = []

      files.forEach((fileData, fileIndex) => {
        fileData.csvRows.forEach(row => {
          allMoves.push({
        identifier: {
          type: 'position' as const,
          sourceCollectionName: row.source_collection_name.trim(),
          sourcePosition: row.source_position.trim(),
        },
            targetPosition: row.target_position.trim(),
            fileIndex,
          })
        })
      })

      // Build mappings from source boxes to destination boxes
      // Check for conflicts: same source box mapping to different destinations
      const sourceToDest = new Map<string, string>()
      const sourceToFiles = new Map<string, number[]>()
      
      files.forEach((fileData, fileIndex) => {
        const destinationBox = fileData.selectedBoxName!
        fileData.resolvedContainers.forEach(rc => {
          const sourceBox = rc.container.currentCollectionName
          if (sourceBox) {
            if (!sourceToFiles.has(sourceBox)) {
              sourceToFiles.set(sourceBox, [])
            }
            sourceToFiles.get(sourceBox)!.push(fileIndex)
            
            // Check for conflict
            const existingDest = sourceToDest.get(sourceBox)
            if (existingDest && existingDest !== destinationBox) {
              throw new Error(
                `Source box "${sourceBox}" appears in multiple files with different destinations: ` +
                `"${existingDest}" and "${destinationBox}". Each source box must map to a single destination.`
              )
            }
            
            sourceToDest.set(sourceBox, destinationBox)
          }
        })
      })

      const moveMappings = Array.from(sourceToDest.entries()).map(([from, to]) => ({
        fromCollectionName: from,
        toCollectionName: to,
      }))

      const response = await collectionsApi.moveContainers({
        collectionType: 'cryovial_box',
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
          destinationBox: fileData.selectedBoxName!,
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
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Cryovial Tubes</h1>

        {/* Step indicator */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep === 'upload' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2">Upload & Configure</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'resolve' ? 'text-blue-600 font-semibold' : currentStep === 'upload' ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'resolve' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2">Resolve</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'execute' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'execute' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2">Execute</span>
            </div>
          </div>
        </div>

        {/* Step 1: Upload & Configure */}
        {currentStep === 'upload' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
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
                    <p>Upload one or more CSV files with cryovial tube move operations. Each file should be named after the destination box it represents. The system will infer the destination box from the filename, or you can select it manually.</p>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">CSV Format</h3>
                    <p className="mb-2">The required columns are:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>
                        <strong>source_collection_name:</strong> Name of the source cryovial box
                      </li>
                      <li>
                        <strong>source_position:</strong> Position of the tube in the source box (e.g., &quot;B5&quot;, &quot;C2&quot;)
                      </li>
                      <li>
                        <strong>target_position:</strong> Target position in the destination box (e.g., &quot;C3&quot;, &quot;D1&quot;)
                      </li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Filename Convention</h3>
                    <p className="mb-2">Name your CSV files to exactly match the destination box name:</p>
                    <ul className="list-disc list-inside space-y-1 ml-4">
                      <li>The filename (without .csv extension) must exactly match a box name in the database</li>
                      <li>Example: If box is named &quot;BOX-001&quot;, name your file <code className="bg-gray-100 px-1 rounded">BOX-001.csv</code></li>
                      <li>Example: If box is named &quot;1022&quot;, name your file <code className="bg-gray-100 px-1 rounded">1022.csv</code></li>
                      <li>Matching is case-insensitive, but the filename must match exactly (no extra characters)</li>
                      <li>If the box name cannot be inferred, you'll be prompted to select it manually</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-semibold text-gray-900 mb-2">Workflow</h3>
                    <p className="mb-2">This process has 3 steps:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-4">
                      <li><strong>Upload & Configure:</strong> Upload CSV files and assign destination boxes</li>
                      <li><strong>Resolve:</strong> System finds each tube by position and identifies source boxes</li>
                      <li><strong>Execute:</strong> System performs all moves in a single transaction</li>
                    </ol>
                  </div>
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Upload CSV Files</h2>
                <button
                  onClick={downloadTemplate}
                  className="px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                >
                  Download Template
                </button>
              </div>

              <input
                type="file"
                accept=".csv"
                multiple
                onChange={handleFileChange}
                disabled={loading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50"
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

                      {/* Box Selection */}
                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                          Destination Box:
                        </label>
                        {fileData.inferredBoxName && fileData.selectedBoxName && fileData.inferredMatches.length === 1 ? (
                          <div className="text-sm text-gray-700 bg-green-50 border border-green-200 rounded p-2">
                            ✓ Inferred: <span className="font-semibold">{fileData.selectedBoxName}</span>
                          </div>
                        ) : (
                          <CryovialBoxPicker
                            locations={locations}
                            boxes={availableBoxes}
                            value={fileData.selectedBoxName || undefined}
                            onChange={(boxName) => updateFileBoxSelection(index, boxName)}
                          />
                        )}
                        {fileData.inferredBoxName && !fileData.selectedBoxName && (
                          <p className="text-xs text-gray-500 mt-1">
                            No exact match found for &quot;{fileData.inferredBoxName}&quot;. Please select a destination box.
                            {fileData.inferredMatches.length > 0 && (
                              <span className="ml-1">({fileData.inferredMatches.length} similar box{fileData.inferredMatches.length !== 1 ? 'es' : ''} found)</span>
                            )}
                          </p>
                        )}
                      </div>

                      {/* Preview */}
                      {fileData.preview.length > 0 && (
                        <div className="mt-3">
                          <h4 className="text-sm font-medium text-gray-700 mb-2">Preview (first 5 rows):</h4>
                  <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200 text-xs">
                      <thead className="bg-gray-50">
                        <tr>
                                  {Object.keys(fileData.preview[0]).map((header) => (
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
                            {Object.keys(row).map((header) => (
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
              )}

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
                disabled={files.length === 0 || loading || files.some(f => !f.selectedBoxName || f.validationErrors.length > 0)}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Next: Resolve Containers'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Resolve */}
        {currentStep === 'resolve' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Resolved Cryovial Tubes</h2>
              
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
                <h3 className="font-semibold mb-2">Source Boxes Detected:</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {getAllSourceBoxes().map((boxName) => (
                    <li key={boxName}>{boxName}</li>
                  ))}
                </ul>
              </div>

              {/* Per-file breakdown */}
              <div className="mt-6 space-y-4">
                {files.map((fileData, index) => (
                  <div key={index} className="border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-900 mb-2">{fileData.file.name}</h4>
                    <p className="text-sm text-gray-700 mb-2">
                      Destination: <span className="font-semibold">{fileData.selectedBoxName}</span>
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
                          The following positions were not found in the database. Please check for typos or verify the positions exist.
                        </p>
                        <div className="overflow-x-auto">
                          <table className="min-w-full divide-y divide-red-200 text-xs">
                            <thead className="bg-red-100">
                              <tr>
                                <th className="px-3 py-2 text-left text-xs font-medium text-red-800 uppercase">Row</th>
                                <th className="px-3 py-2 text-left text-xs font-medium text-red-800 uppercase">Source Position</th>
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
                                    {unresolved.identifier}
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
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('upload')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={handleExecuteMoves}
                disabled={files.some(f => f.resolvedContainers.length === 0)}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
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
                  ? `Failed to move tubes. ${moveResult.moved} moved before error.`
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
                      <p className="text-sm text-gray-600">Destination: {result.destinationBox}</p>
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
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Start New Move
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
