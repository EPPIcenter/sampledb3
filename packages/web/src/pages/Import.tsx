import { useState, useEffect } from 'react'
import { useSearchParams, useNavigate } from 'react-router-dom'
import { subjectsApi, specimensApi, collectionsApi, locationsApi, type Location } from '../lib/api'
import { type ContainerType } from '../components/ContainerRegistration'
import api from '../lib/api'
import { useUser } from '../contexts/UserContext'

type ImportType = 'subjects' | 'specimens' | 'combined'
type Step = 'upload' | 'collections' | 'import'

interface CSVRow {
  [key: string]: string
}

interface ValidationError {
  row: number
  error: string
}

interface MissingCollection {
  name: string
  barcode?: string
  locationId: number | null
  collectionBarcode?: string
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

export default function Import() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as Step) || 'upload'
  
  // Redirect if user doesn't have write permissions
  useEffect(() => {
    if (!canWrite) {
      navigate('/', { replace: true })
    }
  }, [canWrite, navigate])
  
  if (!canWrite) {
    return null
  }

  const setCurrentStep = (step: Step) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  const [importType, setImportType] = useState<ImportType>('subjects')
  const [containerType, setContainerType] = useState<ContainerType | 'none' | ''>('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [preview, setPreview] = useState<CSVRow[]>([])
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [importResult, setImportResult] = useState<{
    success: boolean
    created: number
    errors?: Array<{ index: number; error: string }>
  } | null>(null)
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [missingCollections, setMissingCollections] = useState<MissingCollection[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [validatedData, setValidatedData] = useState<any[]>([])

  useEffect(() => {
    if (currentStep === 'collections') {
      loadLocations()
    }
  }, [currentStep])

  const loadLocations = async () => {
    try {
      const response = await locationsApi.list()
      setLocations(response.data.locations || [])
    } catch (error) {
      console.error('Failed to load locations:', error)
    }
  }

  const getCollectionType = (): 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | null => {
    switch (containerType) {
      case 'micronix_tube':
      case 'static_well':
        return 'micronix_plate'
      case 'cryovial_tube':
        return 'cryovial_box'
      case 'paper':
        return 'box'
      default:
        return null
    }
  }

  const getRequiredFields = (): string[] => {
    const base = ['study_short_code', 'subject_name', 'specimen_type_name']
    if (!containerType || containerType === 'none' || importType === 'subjects') {
      return importType === 'subjects' ? ['study_short_code', 'subject_name'] : base
    }

    const containerFields: Record<ContainerType, string[]> = {
      micronix_tube: ['collection_name', 'barcode', 'position'],
      cryovial_tube: ['collection_name', 'position'],
      paper: ['collection_name', 'label'],
      static_well: ['collection_name', 'position'],
    }

    return [...base, ...(containerFields[containerType] || [])]
  }

  const getOptionalFields = (): string[] => {
    if (!containerType || containerType === 'none') return []

    const optionalFields: Record<ContainerType, string[]> = {
      micronix_tube: [],
      cryovial_tube: ['barcode'],
      paper: [],
      static_well: [],
    }

    return optionalFields[containerType] || []
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setPreview([])
      setValidationErrors([])
      setImportResult(null)
      setCurrentStep('upload')
      setCsvRows([])
      setMissingCollections([])

      // Preview CSV
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

  const handleClearFile = () => {
    setFile(null)
    setPreview([])
    setValidationErrors([])
    setImportResult(null)
    setCsvRows([])
    setMissingCollections([])
    // Reset file input
    const fileInput = document.getElementById('import-csv-file') as HTMLInputElement
    if (fileInput) {
      fileInput.value = ''
    }
  }

  const downloadTemplate = () => {
    let csvContent = ''
    let filename = ''

    if (importType === 'subjects') {
      csvContent = 'study_short_code,subject_name\nNAM15,SUBJ-001\nNAM15,SUBJ-002'
      filename = 'subjects_template.csv'
    } else {
      // Generate container-specific template
      const baseColumns = 'study_short_code,subject_name,specimen_type_name,collection_date'

      if (containerType === 'none') {
        csvContent = `${baseColumns}\nNAM15,SUBJ-001,Whole Blood,2024-01-15\nNAM15,SUBJ-001,Plasma,2024-01-15`
        filename = importType === 'specimens' ? 'specimens_template.csv' : 'combined_template.csv'
      } else {
        const containerColumns = getContainerColumns(containerType as ContainerType)
        csvContent = `${baseColumns},${containerColumns}\n${getTemplateExample(containerType as ContainerType)}`
        filename = importType === 'specimens' ? 'specimens_template.csv' : 'combined_template.csv'
      }
    }

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const getContainerColumns = (type: ContainerType): string => {
    switch (type) {
      case 'micronix_tube':
        return 'collection_name,barcode,position'
      case 'cryovial_tube':
        return 'collection_name,barcode,position'
      case 'paper':
        return 'collection_name,label'
      case 'static_well':
        return 'collection_name,position'
      default:
        return ''
    }
  }

  const getTemplateExample = (type: ContainerType): string => {
    switch (type) {
      case 'micronix_tube':
        return 'NAM15,SUBJ-001,Whole Blood,2024-01-15,PLATE-001,MTX-12345,A01'
      case 'cryovial_tube':
        return 'NAM15,SUBJ-001,Plasma,2024-01-15,BOX-001,,B5'
      case 'paper':
        return 'NAM15,SUBJ-001,Blood Spot,2024-01-15,BOX-003,SPOT-001'
      case 'static_well':
        return 'NAM15,SUBJ-001,Whole Blood,2024-01-15,PLATE-002,A01'
      default:
        return 'NAM15,SUBJ-001,Whole Blood,2024-01-15'
    }
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

  const validateCSV = (rows: CSVRow[]): { valid: boolean; errors: ValidationError[]; data: any[] } => {
    const errors: ValidationError[] = []
    const data: any[] = []
    const requiredFields = getRequiredFields()

    // Check required columns
    if (rows.length === 0) {
      return { valid: false, errors: [{ row: 0, error: 'CSV file is empty' }], data: [] }
    }

    const headers = Object.keys(rows[0])
    const missingColumns = requiredFields.filter(col => !headers.includes(col))

    if (missingColumns.length > 0) {
      return {
        valid: false,
        errors: [{ row: 0, error: `Missing required columns: ${missingColumns.join(', ')}` }],
        data: [],
      }
    }

    // Validate container type consistency if specified
    if (containerType !== 'none' && headers.includes('container_type')) {
      const containerTypes = new Set(rows.map(row => row.container_type).filter(Boolean))
      if (containerTypes.size > 1) {
        errors.push({ row: 0, error: 'All rows must have the same container_type' })
      }
      if (containerTypes.size === 1 && !containerTypes.has(containerType)) {
        errors.push({ row: 0, error: `Container type mismatch: CSV has ${Array.from(containerTypes)[0]}, but selected type is ${containerType}` })
      }
    }

    // Validate each row
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      const rowErrors: string[] = []

      // Check required fields
      for (const field of requiredFields) {
        if (!row[field] || row[field].trim() === '') {
          rowErrors.push(`Missing required field: ${field}`)
        }
      }

      // Container-specific validation
      if (containerType !== 'none') {
        if (containerType === 'micronix_tube') {
          if (!row.barcode || row.barcode.trim() === '') {
            rowErrors.push('Barcode is required for micronix tubes')
          }
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for micronix tubes')
          }
        } else if (containerType === 'cryovial_tube') {
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for cryovial tubes')
          }
        } else if (containerType === 'static_well') {
          if (!row.position || row.position.trim() === '') {
            rowErrors.push('Position is required for static wells')
          }
        } else if (containerType === 'paper') {
          if (!row.label || row.label.trim() === '') {
            rowErrors.push('Label is required for papers')
          }
        }
      }

      if (rowErrors.length > 0) {
        errors.push({ row: i + 1, error: rowErrors.join('; ') })
      } else {
        // Build data object
        if (importType === 'subjects') {
          data.push({
            studyShortCode: row.study_short_code,
            name: row.subject_name,
          })
        } else {
          const spec: any = {
            sourceType: 'subject' as const,
            studyShortCode: row.study_short_code,
            subjectName: row.subject_name,
            specimenTypeName: row.specimen_type_name,
            collectionDate: row.collection_date || undefined,
          }

          if (containerType !== 'none') {
            spec.container = {
              containerType,
              collectionName: row.collection_name,
              collectionBarcode: row.collection_barcode || undefined,
              barcode: row.barcode || undefined,
              position: row.position || undefined,
              label: row.label || undefined,
            }
          }

          data.push(spec)
        }
      }
    }

    return { valid: errors.length === 0, errors, data }
  }

  const checkCollections = async (rows: CSVRow[]): Promise<MissingCollection[]> => {
    if (containerType === 'none' || importType === 'subjects') {
      return []
    }

    const collectionType = getCollectionType()
    if (!collectionType) return []

    const uniqueCollections = new Set<string>()
    rows.forEach(row => {
      if (row.collection_name) {
        uniqueCollections.add(row.collection_name)
      }
      if (row.collection_barcode) {
        uniqueCollections.add(row.collection_barcode)
      }
    })

    if (uniqueCollections.size === 0) return []

    // Check collection existence via API
    try {
      const checkData = Array.from(uniqueCollections).map(identifier => ({
        identifier,
        type: collectionType,
      }))

      const response = await collectionsApi.check({ collections: checkData })
      const results = response.data.results

      const missing: MissingCollection[] = []
      const found = new Set<string>()

      for (const result of results) {
        if (!result.exists) {
          // Determine if identifier is a barcode or name
          // Barcodes are typically longer alphanumeric strings
          const isBarcode = result.identifier.match(/^[A-Z0-9-]+$/) && result.identifier.length > 5

          // Check if we already added this collection (could be both name and barcode)
          if (!found.has(result.identifier)) {
            missing.push({
              name: isBarcode ? '' : result.identifier,
              barcode: isBarcode ? result.identifier : undefined,
              collectionBarcode: isBarcode ? result.identifier : undefined,
              locationId: null,
              status: 'pending',
            })
            found.add(result.identifier)
          }
        } else {
          found.add(result.identifier)
        }
      }

      return missing
    } catch (error) {
      console.error('Failed to check collections:', error)
      // Fallback: assume all collections are missing
      return Array.from(uniqueCollections).map(identifier => {
        const isBarcode = identifier.match(/^[A-Z0-9-]+$/) && identifier.length > 5
        return {
          name: isBarcode ? '' : identifier,
          barcode: isBarcode ? identifier : undefined,
          collectionBarcode: isBarcode ? identifier : undefined,
          locationId: null,
          status: 'pending' as const,
        }
      })
    }
  }

  const handleValidateAndCheck = async () => {
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

      setValidatedData(validation.data)

      // Check for missing collections
      if (importType !== 'subjects' && containerType !== 'none') {
        const missing = await checkCollections(rows)
        setMissingCollections(missing)

        if (missing.length > 0) {
          setCurrentStep('collections')
        } else {
          setCurrentStep('import')
          handleImport(validation.data)
        }
      } else {
        setCurrentStep('import')
        handleImport(validation.data)
      }
    } catch (error: any) {
      setValidationErrors([{ row: 0, error: error.message || 'Validation failed' }])
    } finally {
      setLoading(false)
    }
  }

  const handleCreateCollections = async () => {
    setLoading(true)
    const collectionType = getCollectionType()
    if (!collectionType) {
      setLoading(false)
      return
    }

    const updated = [...missingCollections]
    let allSuccess = true

    for (let i = 0; i < updated.length; i++) {
      const collection = updated[i]
      if (collection.status === 'success' || !collection.locationId) continue

      updated[i].status = 'creating'
      setMissingCollections([...updated])

      try {
        // Determine name and barcode
        const name = collection.name || (collection.barcode ? `Collection-${collection.barcode}` : `Collection-${Date.now()}`)
        const barcode = collection.barcode || collection.collectionBarcode

        if (collectionType === 'micronix_plate') {
          await collectionsApi.createMicronixPlate({
            name,
            locationId: collection.locationId,
            barcode,
          })
        } else if (collectionType === 'cryovial_box') {
          await collectionsApi.createCryovialBox({
            name,
            locationId: collection.locationId,
            barcode,
          })
        } else if (collectionType === 'box') {
          await collectionsApi.createBox({
            name,
            locationId: collection.locationId,
          })
        } else if (collectionType === 'bag') {
          await collectionsApi.createBag({
            name,
            locationId: collection.locationId,
          })
        }

        updated[i].status = 'success'
        updated[i].name = name // Update name in case it was generated
      } catch (error: any) {
        updated[i].status = 'error'
        updated[i].error = error.response?.data?.error || 'Failed to create collection'
        allSuccess = false
      }
    }

    setMissingCollections(updated)

    if (allSuccess && updated.every(c => c.status === 'success' || c.status === 'pending')) {
      setCurrentStep('import')
      handleImport(validatedData)
    } else {
      setLoading(false)
    }
  }

  const handleImport = async (data: any[]) => {
    setLoading(true)
    setImportResult(null)

    try {
      if (importType === 'subjects') {
        const response = await subjectsApi.createBulk({ subjects: data })
        setImportResult({
          success: true,
          created: response.data.created,
          errors: response.data.errors,
        })
      } else if (importType === 'specimens') {
        const response = await specimensApi.createBulk({ specimens: data })
        setImportResult({
          success: true,
          created: response.created,
          errors: response.errors,
        })
      } else {
        // Combined: group by subject
        const subjectMap = new Map<string, any[]>()

        // Create a map of collection names to location IDs from missingCollections
        const collectionLocationMap = new Map<string, number>()
        for (const coll of missingCollections) {
          if (coll.locationId && coll.name) {
            collectionLocationMap.set(coll.name, coll.locationId)
          }
          if (coll.locationId && coll.barcode) {
            collectionLocationMap.set(coll.barcode, coll.locationId)
          }
        }

        for (const spec of data) {
          const key = `${spec.studyShortCode}:${spec.subjectName}`
          if (!subjectMap.has(key)) {
            subjectMap.set(key, [])
          }
          
          // Prepare container data with location if available
          let containerData = spec.container
          if (containerData && containerData.collectionName) {
            const locationId = collectionLocationMap.get(containerData.collectionName)
            if (locationId) {
              containerData = {
                ...containerData,
                collectionLocationId: locationId,
              }
            }
          } else if (containerData && containerData.collectionBarcode) {
            const locationId = collectionLocationMap.get(containerData.collectionBarcode)
            if (locationId) {
              containerData = {
                ...containerData,
                collectionLocationId: locationId,
              }
            }
          }
          
          subjectMap.get(key)!.push({
            specimenTypeName: spec.specimenTypeName,
            collectionDate: spec.collectionDate,
            container: containerData,
          })
        }

        let totalCreated = 0
        let totalContainersCreated = 0
        const allErrors: Array<{ index: number; error: string }> = []
        let rowIndex = 0

        for (const [key, specimens] of subjectMap.entries()) {
          const [studyShortCode, subjectName] = key.split(':')
          try {
            const response = await subjectsApi.createWithSpecimens({
              studyShortCode,
              subjectName,
              specimens,
            })
            
            // Count created items from summary
            totalCreated += response.data.summary.subjectsCreated + response.data.summary.specimensCreated
            totalContainersCreated += response.data.summary.containersCreated
          } catch (error: any) {
            allErrors.push({
              index: rowIndex,
              error: error.response?.data?.error || 'Failed to create subject with specimens',
            })
          }
          rowIndex++
        }

        setImportResult({
          success: allErrors.length === 0,
          created: totalCreated + totalContainersCreated,
          errors: allErrors.length > 0 ? allErrors : undefined,
        })
      }
    } catch (error: any) {
      setValidationErrors([{ row: 0, error: error.response?.data?.error || error.message || 'Import failed' }])
    } finally {
      setLoading(false)
    }
  }

  const getRequiredColumnsDisplay = () => {
    const required = getRequiredFields()
    const optional = getOptionalFields()
    const allFields = [...required, ...optional]
    
    if (importType === 'subjects') {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
          <h4 className="font-semibold text-blue-900 mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium text-blue-800">Required:</span>
              <span className="text-blue-700 ml-2 font-mono">{required.join(', ')}</span>
            </div>
          </div>
        </div>
      )
    }

    if (!containerType || containerType === 'none') {
      return (
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
          <h4 className="font-semibold text-blue-900 mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium text-blue-800">Required:</span>
              <span className="text-blue-700 ml-2 font-mono">{required.join(', ')}</span>
            </div>
          </div>
        </div>
      )
    }

    const containerSpecific = required.filter(f => !['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))
    const baseRequired = required.filter(f => ['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))

    return (
      <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm">
        <h4 className="font-semibold text-blue-900 mb-2">Required CSV Columns for {containerType.replace('_', ' ')}</h4>
        <div className="space-y-2">
          <div>
            <span className="font-medium text-blue-800">Base Required:</span>
            <span className="text-blue-700 ml-2 font-mono">{baseRequired.join(', ')}</span>
          </div>
          <div>
            <span className="font-medium text-blue-800">Container Required:</span>
            <span className="text-blue-700 ml-2 font-mono">{containerSpecific.join(', ')}</span>
          </div>
          {optional.length > 0 && (
            <div>
              <span className="font-medium text-blue-800">Optional:</span>
              <span className="text-blue-700 ml-2 font-mono">{optional.join(', ')}</span>
            </div>
          )}
          {(containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && (
            <div className="text-blue-700 mt-2 pt-2 border-t border-blue-300">
              <strong>Position format:</strong> A01, B12 (letter + 2 digits) - <strong>Required</strong>
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">Bulk Import</h1>

      {/* Step Indicator */}
      {(importType === 'specimens' || importType === 'combined') && (
        <div className="mb-6">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center ${currentStep === 'upload' ? 'text-blue-600' : currentStep === 'collections' || currentStep === 'import' ? 'text-green-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'upload' ? 'bg-blue-600 text-white' : currentStep === 'collections' || currentStep === 'import' ? 'bg-green-600 text-white' : 'bg-gray-300'}`}>
                1
              </div>
              <span className="ml-2 font-medium">Upload & Validate</span>
            </div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${currentStep === 'collections' ? 'text-blue-600' : currentStep === 'import' ? 'text-green-600' : missingCollections.length > 0 ? 'text-gray-500' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'collections' ? 'bg-blue-600 text-white' : currentStep === 'import' ? 'bg-green-600 text-white' : missingCollections.length > 0 ? 'bg-gray-400 text-white' : 'bg-gray-300'}`}>
                2
              </div>
              <span className={`ml-2 font-medium ${missingCollections.length === 0 ? 'text-gray-400' : ''}`}>
                Create Collections
                {missingCollections.length === 0 && currentStep === 'upload' && (
                  <span className="text-xs text-gray-400 ml-1">(if needed)</span>
                )}
              </span>
            </div>
            <div className="w-12 h-0.5 bg-gray-300"></div>
            <div className={`flex items-center ${currentStep === 'import' ? 'text-blue-600' : 'text-gray-400'}`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${currentStep === 'import' ? 'bg-blue-600 text-white' : 'bg-gray-300'}`}>
                3
              </div>
              <span className="ml-2 font-medium">Import</span>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 max-w-4xl">
        {currentStep === 'upload' && (
          <form onSubmit={(e) => { e.preventDefault(); handleValidateAndCheck(); }} className="space-y-6">
            <div>
              <label
                htmlFor="import-type"
                className="block text-sm font-medium text-gray-700 mb-2"
              >
                Import Type *
              </label>
              <select
                id="import-type"
                value={importType}
                onChange={(e) => {
                  setImportType(e.target.value as ImportType)
                  setContainerType('')
                  setFile(null)
                  setPreview([])
                  setValidationErrors([])
                  setImportResult(null)
                }}
                className="form-select"
              >
                <option value="subjects">Subjects Only</option>
                <option value="specimens">Specimens Only</option>
                <option value="combined">Subjects with Specimens (Combined)</option>
              </select>
              <p className="text-sm text-gray-500 mt-1">
                {importType === 'subjects' && 'Import study subjects using study short codes and subject names'}
                {importType === 'specimens' && 'Import specimens for existing subjects using study short codes, subject names, and specimen type names'}
                {importType === 'combined' && 'Create subjects and their specimens in one import. Subjects will be created if they don\'t exist.'}
              </p>
            </div>

            {(importType === 'specimens' || importType === 'combined') && (
              <div>
                <label
                  htmlFor="container-type"
                  className="block text-sm font-medium text-gray-700 mb-2"
                >
                  Container Type *
                </label>
                <select
                  id="container-type"
                  value={containerType}
                  onChange={(e) => {
                    setContainerType(e.target.value as ContainerType | 'none')
                    setFile(null)
                    setPreview([])
                    handleClearFile()
                  }}
                  className="form-select"
                  required
                >
                  <option value="">Select container type...</option>
                  <option value="none">No Containers</option>
                  <option value="micronix_tube">Micronix Tubes</option>
                  <option value="cryovial_tube">Cryovial Tubes</option>
                  <option value="paper">Papers</option>
                  <option value="static_well">Static Wells</option>
                </select>
                <p className="text-sm text-gray-500 mt-1">
                  All specimens in this batch will use the same container type. Select the container type for containers, or "No Containers" to skip container creation.
                </p>
              </div>
            )}

            {/* Show required columns before file upload */}
            {(importType === 'subjects' || ((importType === 'specimens' || importType === 'combined') && containerType)) && (
              <div>
                {getRequiredColumnsDisplay()}
              </div>
            )}

            {/* Only show file upload after import type (and container type if needed) is selected */}
            {(importType === 'subjects' || ((importType === 'specimens' || importType === 'combined') && containerType)) && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="import-csv-file"
                    className="block text-sm font-medium text-gray-700"
                  >
                    CSV File *
                  </label>
                  <div className="flex items-center gap-3">
                    {file && (
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="text-sm text-red-600 hover:text-red-700 underline"
                      >
                        Clear File
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="text-sm text-blue-600 hover:text-blue-700 underline"
                    >
                      Download Template
                    </button>
                  </div>
                </div>
                <input
                  id="import-csv-file"
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="form-input"
                  required
                />
                {file && (
                  <p className="text-sm text-green-600 mt-1">
                    Selected: {file.name}
                  </p>
                )}
                {!file && (
                  <p className="text-sm text-gray-500 mt-1">
                    Upload a CSV file. Use study short codes, specimen type names, subject names, and collection names/barcodes as identifiers.
                  </p>
                )}
              </div>
            )}

            {preview.length > 0 && (
              <div>
                <h3 className="font-semibold mb-2 text-gray-900">Preview (first 5 rows)</h3>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="min-w-full text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        {Object.keys(preview[0] || {}).map((key) => {
                          const required = getRequiredFields()
                          const isRequired = required.includes(key)
                          return (
                            <th key={key} className={`px-4 py-2 text-left border-b text-gray-700 font-medium ${isRequired ? 'bg-red-50' : ''}`}>
                              {key}
                              {isRequired && <span className="text-red-600 ml-1">*</span>}
                            </th>
                          )
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {preview.map((row, i) => (
                        <tr key={i} className="hover:bg-gray-50">
                          {Object.values(row).map((value, j) => (
                            <td key={j} className="px-4 py-2 border-b text-gray-900">
                              {String(value)}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-4">
                <h3 className="font-semibold text-red-800 mb-2">Validation Errors:</h3>
                <ul className="list-disc list-inside text-red-700 space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>
                      {error.row > 0 ? `Row ${error.row + 1}: ` : ''}{error.error}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <button
              type="submit"
              disabled={!file || loading || ((importType === 'specimens' || importType === 'combined') && !containerType)}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
            >
              {loading ? 'Validating...' : 'Validate & Continue'}
            </button>
          </form>
        )}

        {currentStep === 'collections' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold mb-2 text-gray-900">Create Missing Collections</h2>
              <p className="text-sm text-gray-600">
                The following collections need to be created. Please specify a location for each one.
              </p>
            </div>

            <div className="space-y-4">
              {missingCollections.map((collection, index) => (
                <div key={index} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-medium text-gray-900">
                        {collection.name || collection.barcode || collection.collectionBarcode || `Collection ${index + 1}`}
                      </h3>
                      {(collection.barcode || collection.collectionBarcode) && (
                        <p className="text-sm text-gray-500">
                          Barcode: {collection.barcode || collection.collectionBarcode}
                        </p>
                      )}
                      {!collection.name && (collection.barcode || collection.collectionBarcode) && (
                        <p className="text-xs text-gray-400 mt-1">
                          A name will be generated from the barcode
                        </p>
                      )}
                    </div>
                    {collection.status === 'success' && (
                      <span className="text-green-600 text-sm font-medium">✓ Created</span>
                    )}
                    {collection.status === 'creating' && (
                      <span className="text-blue-600 text-sm">Creating...</span>
                    )}
                    {collection.status === 'error' && (
                      <span className="text-red-600 text-sm">Error</span>
                    )}
                  </div>

                  {collection.status === 'error' && collection.error && (
                    <div className="mb-3 text-sm text-red-600">{collection.error}</div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Location *
                    </label>
                    <select
                      value={collection.locationId || ''}
                      onChange={(e) => {
                        const updated = [...missingCollections]
                        updated[index].locationId = parseInt(e.target.value) || null
                        setMissingCollections(updated)
                      }}
                      disabled={collection.status === 'creating' || collection.status === 'success'}
                      className="form-select w-full"
                    >
                      <option value="">Select location</option>
                      {locations
                        .filter(loc => loc.canContainCollections)
                        .map((loc) => (
                        <option key={loc.id} value={loc.id}>
                          {loc.path || loc.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  {(getCollectionType() === 'micronix_plate' || getCollectionType() === 'cryovial_box') && !collection.barcode && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Barcode (Optional)
                      </label>
                      <input
                        type="text"
                        value={collection.collectionBarcode || ''}
                        onChange={(e) => {
                          const updated = [...missingCollections]
                          updated[index].collectionBarcode = e.target.value
                          setMissingCollections(updated)
                        }}
                        disabled={collection.status === 'creating' || collection.status === 'success'}
                        className="form-input w-full"
                        placeholder="Enter barcode (optional)"
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="flex space-x-4">
              <button
                type="button"
                onClick={() => setCurrentStep('upload')}
                className="px-4 py-2 border rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleCreateCollections}
                disabled={loading || missingCollections.some(c => !c.locationId && c.status !== 'success')}
                className="flex-1 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed font-medium"
              >
                {loading ? 'Creating Collections...' : 'Create Collections & Continue'}
              </button>
            </div>
          </div>
        )}

        {currentStep === 'import' && (
          <div className="space-y-6">
            {importResult && (
              <div className={`border rounded p-4 ${importResult.success ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'}`}>
                <h3 className={`font-semibold mb-2 ${importResult.success ? 'text-green-800' : 'text-yellow-800'}`}>
                  Import {importResult.success ? 'Successful' : 'Completed with Errors'}
                </h3>
                <p className={importResult.success ? 'text-green-700' : 'text-yellow-700'}>
                  Created: {importResult.created} {importResult.created === 1 ? 'item' : 'items'}
                </p>
                {importResult.errors && importResult.errors.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-yellow-800 mb-1">Errors:</p>
                    <ul className="list-disc list-inside text-yellow-700 space-y-1">
                      {importResult.errors.map((error, i) => (
                        <li key={i}>
                          Row {error.index + 1}: {error.error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            {!importResult && (
              <div className="text-center py-4">
                <p className="text-gray-600">Import in progress...</p>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                setCurrentStep('upload')
                setFile(null)
                setPreview([])
                setImportResult(null)
                setCsvRows([])
                setMissingCollections([])
                setValidatedData([])
              }}
              className="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 font-medium"
            >
              Start New Import
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
