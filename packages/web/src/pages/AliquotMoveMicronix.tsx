import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { collectionsApi } from '../lib/api'

interface CSVRow {
  [key: string]: string
}

interface ValidationError {
  row: number
  error: string
}

interface AliquotInfo {
  containerId: number
  containerType: string
  currentCollectionId: number | null
  currentCollectionName: string | null
  currentCollectionType: string | null
  currentPosition: string | null
  barcode?: string | null
}

interface ResolvedAliquot {
  barcode: string
  aliquot: AliquotInfo
}

interface Collection {
  id: number
  name: string
  type: string
}

type Step = 'upload' | 'resolve' | 'mapping' | 'execute'

export default function AliquotMoveMicronix() {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as Step) || 'upload'

  const setCurrentStep = (step: Step) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<CSVRow[]>([])
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [resolvedAliquots, setResolvedAliquots] = useState<ResolvedAliquot[]>([])
  const [sourceCollections, setSourceCollections] = useState<Collection[]>([])
  const [availableCollections, setAvailableCollections] = useState<Collection[]>([])
  const [mappings, setMappings] = useState<Map<string, string>>(new Map())
  const [moveResult, setMoveResult] = useState<{
    success: boolean
    moved: number
    errors?: ValidationError[]
  } | null>(null)

  // Parse filename to infer collection names
  const parseFilename = (filename: string): string[] => {
    const baseName = filename.replace(/\.csv$/i, '')
    const tokens = baseName.split(/[-_\s]+/).filter(t => t.length > 0)
    const skipWords = ['move', 'moves', 'swap', 'swaps', 'aliquot', 'aliquots', 'csv', 'micronix', 'plate']
    return tokens.filter(t => !skipWords.includes(t.toLowerCase()))
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreview([])
      setValidationErrors([])
      setMoveResult(null)
      setCsvRows([])
      setResolvedAliquots([])
      setCurrentStep('upload')

      const reader = new FileReader()
      reader.onload = (event) => {
        const text = event.target?.result as string
        const lines = text.split('\n').filter(line => line.trim())
        if (lines.length === 0) return

        const headers = lines[0].split(',').map(h => h.trim())
        const previewRows: CSVRow[] = []

        for (let i = 1; i < Math.min(6, lines.length); i++) {
          const values = lines[i].split(',')
          const row: CSVRow = {}
          headers.forEach((header, j) => {
            row[header] = values[j]?.trim() || ''
          })
          previewRows.push(row)
        }

        setPreview(previewRows)
      }
      reader.readAsText(selectedFile)
    }
  }

  const downloadTemplate = () => {
    const csvContent = `container_barcode,target_position
MTX-12345,A01
MTX-12346,B01
MTX-12347,C01`

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'micronix_move_template.csv'
    a.click()
    window.URL.revokeObjectURL(url)
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

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row.container_barcode || row.container_barcode.trim() === '') {
        errors.push({
          row: i + 1,
          error: 'container_barcode is required for micronix tubes',
        })
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  const handleValidateAndResolve = async () => {
    if (!file) return

    setLoading(true)
    setValidationErrors([])

    try {
      const text = await file.text()
      const rows = parseCSV(text)
      setCsvRows(rows)

      const validation = validateCSV(rows)
      if (!validation.valid) {
        setValidationErrors(validation.errors)
        setLoading(false)
        return
      }

      // Resolve all barcodes (micronix tubes always have barcodes)
      const identifiers = rows.map((row) => ({
        type: 'barcode' as const,
        barcode: row.container_barcode.trim(),
      }))

      const resolveResponse = await collectionsApi.resolveAliquots({ identifiers })

      const resolved = resolveResponse.data.aliquots
      setResolvedAliquots(resolved.map((r: any) => ({
        barcode: r.identifier.barcode,
        aliquot: r.aliquot,
      })))

      // Extract unique source collections
      const collectionMap = new Map<number, { id: number; name: string; type: string }>()
      for (const { aliquot } of resolved) {
        if (aliquot.currentCollectionId && aliquot.currentCollectionType && aliquot.currentCollectionName) {
          collectionMap.set(aliquot.currentCollectionId, {
            id: aliquot.currentCollectionId,
            name: aliquot.currentCollectionName,
            type: aliquot.currentCollectionType,
          })
        }
      }

      const collections = Array.from(collectionMap.values())
      setSourceCollections(collections)

      // Verify all are micronix plates
      const types = new Set(collections.map(c => c.type))
      if (types.size > 1 || (types.size === 1 && !types.has('micronix_plate'))) {
        setValidationErrors([{
          row: 0,
          error: `Mixed or invalid collection types found: ${Array.from(types).join(', ')}. All aliquots must be from micronix_plate collections.`,
        }])
        setLoading(false)
        return
      }

      setCurrentStep('resolve')
    } catch (error: any) {
      setValidationErrors([{
        row: 0,
        error: error.response?.data?.error || error.message || 'Failed to resolve aliquots',
      }])
    } finally {
      setLoading(false)
    }
  }

  // Load available collections when on mapping step
  useEffect(() => {
    if (currentStep === 'mapping') {
      collectionsApi.listCollectionsByType('micronix_plate').then((response) => {
        setAvailableCollections(
          response.data.collections.map((c) => ({
            id: c.id,
            name: c.name,
            type: 'micronix_plate',
          }))
        )
      }).catch((error) => {
        console.error('Failed to load collections:', error)
      })
    }
  }, [currentStep])

  const handleConfigureMappings = () => {
    const missingMappings: string[] = []
    for (const source of sourceCollections) {
      if (!mappings.has(source.name)) {
        missingMappings.push(source.name)
      }
    }

    if (missingMappings.length > 0) {
      setValidationErrors([{
        row: 0,
        error: `Please configure mappings for: ${missingMappings.join(', ')}`,
      }])
      return
    }

    setCurrentStep('mapping')
  }

  const handleExecuteMoves = async () => {
    setLoading(true)
    setMoveResult(null)

    try {
      const moveMappings = Array.from(mappings.entries()).map(([from, to]) => ({
        fromCollectionName: from,
        toCollectionName: to,
      }))

      const moves = csvRows.map(row => ({
        identifier: {
          type: 'barcode' as const,
          barcode: row.container_barcode.trim(),
        },
        targetPosition: row.target_position || undefined,
      }))

      const response = await collectionsApi.moveAliquots({
        collectionType: 'micronix_plate',
        mappings: moveMappings,
        moves,
      })

      if (response.data.success) {
        setMoveResult({
          success: true,
          moved: response.data.moved,
        })
        setCurrentStep('execute')
      } else {
        setMoveResult({
          success: false,
          moved: response.data.moved || 0,
          errors: response.data.errors,
        })
      }
    } catch (error: any) {
      setMoveResult({
        success: false,
        moved: 0,
        errors: [
          {
            row: 0,
            error: error.response?.data?.error || error.message || 'Failed to move aliquots',
          },
        ],
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl font-bold mb-6">Move Micronix Tubes</h1>

        {/* Step indicator */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex items-center justify-between">
            <div className={`flex items-center ${currentStep === 'upload' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                1
              </div>
              <span className="ml-2">Upload CSV</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'resolve' ? 'text-blue-600 font-semibold' : currentStep === 'upload' ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'resolve' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                2
              </div>
              <span className="ml-2">Resolve</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'mapping' ? 'text-blue-600 font-semibold' : ['resolve', 'mapping', 'execute'].includes(currentStep) ? 'text-gray-400' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'mapping' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                3
              </div>
              <span className="ml-2">Mapping</span>
            </div>
            <div className="flex-1 h-1 bg-gray-200 mx-4"></div>
            <div className={`flex items-center ${currentStep === 'execute' ? 'text-blue-600 font-semibold' : 'text-gray-500'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'execute' ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}>
                4
              </div>
              <span className="ml-2">Execute</span>
            </div>
          </div>
        </div>

        {/* Step 1: Upload */}
        {currentStep === 'upload' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Instructions</h2>
              <ul className="list-disc list-inside space-y-2 text-gray-700">
                <li>Upload a CSV file with micronix tube move operations</li>
                <li>
                  Required columns: <code className="bg-gray-100 px-1 rounded">container_barcode</code>,{' '}
                  <code className="bg-gray-100 px-1 rounded">target_position</code>
                </li>
                <li>All tubes must have barcodes (required for micronix tubes)</li>
                <li>Collection type will be inferred (must be micronix_plate)</li>
                <li>Collection names can be inferred from filename (e.g., PLATE-001-PLATE-002-swap.csv)</li>
                <li>All moves are validated before execution (all-or-nothing)</li>
                <li>Position swaps are handled automatically</li>
              </ul>
            </div>

            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Upload CSV File</h2>
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
                onChange={handleFileChange}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />

              {preview.length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold mb-2">Preview (first 5 rows):</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          {Object.keys(preview[0]).map((header) => (
                            <th
                              key={header}
                              className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {preview.map((row, i) => (
                          <tr key={i}>
                            {Object.keys(row).map((header) => (
                              <td key={header} className="px-4 py-2 whitespace-nowrap text-sm text-gray-900">
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
            </div>

            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-red-800 mb-2">Validation Errors</h3>
                <ul className="list-disc list-inside space-y-1 text-red-700">
                  {validationErrors.map((error, i) => (
                    <li key={i}>
                      Row {error.row}: {error.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex justify-end gap-4">
              <button
                onClick={handleValidateAndResolve}
                disabled={!file || loading}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Next: Resolve Aliquots'}
              </button>
            </div>
          </>
        )}

        {/* Step 2: Resolve */}
        {currentStep === 'resolve' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Resolved Micronix Tubes</h2>
              <div className="mb-4">
                <p className="text-gray-700">
                  <strong>Collection Type:</strong> micronix_plate
                </p>
                <p className="text-gray-700">
                  <strong>Resolved:</strong> {resolvedAliquots.length} of {csvRows.length} tubes
                </p>
              </div>

              <div className="mb-4">
                <h3 className="font-semibold mb-2">Source Plates Detected:</h3>
                <ul className="list-disc list-inside space-y-1 text-gray-700">
                  {sourceCollections.map((col) => (
                    <li key={col.id}>
                      {col.name}
                    </li>
                  ))}
                </ul>
              </div>

              {file && (
                <div className="mb-4">
                  <h3 className="font-semibold mb-2">Inferred from filename:</h3>
                  <p className="text-gray-700">
                    {parseFilename(file.name).length > 0
                      ? parseFilename(file.name).join(', ')
                      : 'No plate names detected in filename'}
                  </p>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('upload')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={handleConfigureMappings}
                disabled={sourceCollections.length === 0}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                Next: Configure Mappings
              </button>
            </div>
          </>
        )}

        {/* Step 3: Mapping */}
        {currentStep === 'mapping' && (
          <>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4">Configure Plate Mappings</h2>
              <p className="text-gray-700 mb-4">
                Define where tubes from each source plate should be moved to.
              </p>

              <div className="space-y-4">
                {sourceCollections.map((source) => (
                  <div key={source.id} className="flex items-center gap-4 p-4 border rounded">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        From: {source.name}
                      </label>
                    </div>
                    <div className="flex-1">
                      <select
                        value={mappings.get(source.name) || ''}
                        onChange={(e) => {
                          const newMappings = new Map(mappings)
                          newMappings.set(source.name, e.target.value)
                          setMappings(newMappings)
                        }}
                        className="w-full px-3 py-2 border border-gray-100 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">Select target plate...</option>
                        {availableCollections.map((col) => (
                          <option key={col.id} value={col.name}>
                            {col.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              {validationErrors.length > 0 && (
                <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4">
                  <ul className="list-disc list-inside space-y-1 text-red-700">
                    {validationErrors.map((error, i) => (
                      <li key={i}>{error.error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => setCurrentStep('resolve')}
                className="px-6 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                Back
              </button>
              <button
                onClick={handleExecuteMoves}
                disabled={loading || Array.from(mappings.values()).some(v => !v)}
                className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Execute Moves'}
              </button>
            </div>
          </>
        )}

        {/* Step 4: Execute/Results */}
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
                  ? `Successfully moved ${moveResult.moved} tube(s)`
                  : `Failed to move tubes. ${moveResult.moved} moved before error.`}
              </p>
              {moveResult.errors && moveResult.errors.length > 0 && (
                <ul className="list-disc list-inside space-y-1 text-red-700 mt-2">
                  {moveResult.errors.map((error, i) => (
                    <li key={i}>
                      Row {error.row}: {error.error}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex justify-end gap-4">
              <button
                onClick={() => {
                  setFile(null)
                  setCurrentStep('upload')
                  setMoveResult(null)
                  setMappings(new Map())
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

