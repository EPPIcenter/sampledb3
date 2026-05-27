import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { subjectsApi } from '../lib/api/subjects';
import { specimensApi } from '../lib/api/specimens';
import { collectionsApi } from '../lib/api/collections';
import { importsApi } from '../lib/api/imports';
import type { BulkCombinedAtomicMode } from '../lib/api/imports';
import {
  fetchBulkImportMissingCollections,
  useBulkImportTemplateSpecimenTypes,
  type BulkImportMissingCollection,
} from '../hooks/useBulkImportWorkflow'
import { getQueryErrorMessage } from '../ui'
import { buildBulkImportTemplateContent } from '../lib/bulk-import-csv'
import {
  getBulkImportCollectionType,
  getBulkImportRequiredFields,
  getBulkImportOptionalFields,
  parseBulkImportCSV,
  mapBulkImportRowsToPayload,
  getBulkImportRowCollectionName,
  type CSVRow,
  type BulkImportValidationError,
  type ImportType as LibImportType,
} from '../lib/bulk-import-validation'
import { getCollectionNameColumn } from '../lib/container-columns'
import { type ContainerType } from './ContainerRegistration'
import {
  buildBulkCombinedRequestPayload,
  buildCollectionLocationMap,
  buildSpecimensWithLocationIds,
} from '../lib/bulk-import-payload'
import {
  formatBulkImportSuccessMessage,
  type BulkImportCombinedSummary,
} from '../lib/bulk-import-success-message'
import LocationPicker from './LocationPicker'
import '../styles/storage.css'

export type ImportType = LibImportType
type Step = 'upload' | 'collections' | 'import'

type MissingCollection = BulkImportMissingCollection

export interface BulkImportFlowProps {
  /** When set, CSV does not require study_short_code; it is injected from this value. */
  fixedStudyShortCode?: string
  /** When set, show this link in the result step (e.g. "Back to study"). */
  backLink?: { to: string; label: string }
}

export default function BulkImportFlow({ fixedStudyShortCode, backLink }: BulkImportFlowProps) {
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep: Step = (() => {
    const s = searchParams.get('step') ?? 'upload'
    if (s === 'review') return 'import' // legacy URL: review merged into import
    if (s === 'upload' || s === 'collections' || s === 'import') return s
    return 'upload'
  })()

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
  const effectiveStep: Step =
    currentStep !== 'upload' && !file ? 'upload' : currentStep

  useEffect(() => {
    if (searchParams.get('step') === 'review') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', 'import')
        return next
      })
    }
  }, [searchParams, setSearchParams])
  useEffect(() => {
    if (effectiveStep === 'upload' && currentStep !== 'upload') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', 'upload')
        return next
      })
    }
  }, [effectiveStep, currentStep, setSearchParams])
  const [workflowLoading, setWorkflowLoading] = useState(false)
  const templateSpecimenTypes = useBulkImportTemplateSpecimenTypes({ importType, containerType })
  const [preview, setPreview] = useState<CSVRow[]>([])
  const [validationErrors, setValidationErrors] = useState<BulkImportValidationError[]>([])
  const [importResult, setImportResult] = useState<{
    success: boolean
    /** Subjects- or specimens-only; omitted when using combinedSummary. */
    created?: number
    containersCreated?: number
    combinedSummary?: BulkImportCombinedSummary
    errors?: Array<{ index: number; error: string }>
  } | null>(null)
  const [csvRows, setCsvRows] = useState<CSVRow[]>([])
  const [missingCollections, setMissingCollections] = useState<MissingCollection[]>([])
  const [validatedData, setValidatedData] = useState<Record<string, unknown>[]>([])
  const [atomicMode, setAtomicMode] = useState<BulkCombinedAtomicMode>('full_file')

  const getCollectionType = () =>
    getBulkImportCollectionType(containerType)

  const getRequiredFields = () =>
    getBulkImportRequiredFields({ importType, containerType, fixedStudyShortCode })

  const getOptionalFields = () => getBulkImportOptionalFields(containerType)

  const getSpecimenOptionalFields = (): string[] => {
    if (importType === 'specimens' || importType === 'combined') return ['collection_date']
    return []
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
    const fileInput = document.getElementById('import-csv-file')
    if (fileInput) {
      ;(fileInput as HTMLInputElement).value = ''
    }
  }

  const getRowCollectionName = (row: CSVRow) =>
    getBulkImportRowCollectionName(row, containerType)

  const downloadTemplate = () => {
    if (templateSpecimenTypes.isError) {
      return
    }

    const { csvContent, filename } = buildBulkImportTemplateContent({
      importType,
      containerType: containerType === '' ? 'none' : containerType,
      fixedStudyShortCode,
      specimenTypeNames: templateSpecimenTypes.specimenTypeNames,
    })

    const blob = new Blob([csvContent], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    a.click()
    window.URL.revokeObjectURL(url)
  }

  const runPreReviewServerValidation = async (
    data: Record<string, unknown>[],
    missing: MissingCollection[]
  ): Promise<BulkImportValidationError[]> => {
    if (importType === 'subjects') {
      const validateRes = await subjectsApi.validateBulk({
        subjects: data as Array<{ studyShortCode: string; name: string }>,
      })
      if (validateRes.valid || validateRes.errors.length === 0) {
        return []
      }
      return validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message }))
    }
    if (importType === 'specimens') {
      const map = buildCollectionLocationMap(missing)
      const specimensWithLocations = buildSpecimensWithLocationIds(data, map)
      type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
      const validateRes = await specimensApi.validateBulk({
        specimens: specimensWithLocations as SpecimenBulkItem[],
      })
      if (validateRes.valid) {
        return []
      }
      return validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message }))
    }
    if (importType === 'combined') {
      const payload = buildBulkCombinedRequestPayload(data, {
        containerType,
        fixedStudyShortCode,
        missingCollections: missing,
        atomicMode,
      })
      const validateRes = await importsApi.bulkCombinedValidate(payload)
      if (validateRes.valid || validateRes.errors.length === 0) {
        return []
      }
      return validateRes.errors.map((e) => ({
        row: e.rowIndex ?? e.subjectIndex + 1,
        error: e.message,
      }))
    }
    return []
  }

  const handleValidateAndCheck = async () => {
    if (!file) return

    setWorkflowLoading(true)
    setValidationErrors([])

    try {
      const text = await file.text()
      const rows = parseBulkImportCSV(text)
      setCsvRows(rows)

      if (rows.length === 0) {
        setValidationErrors([{ row: 0, error: 'CSV file is empty or has no data rows' }])
        setWorkflowLoading(false)
        return
      }

      const data = mapBulkImportRowsToPayload(rows, {
        importType,
        containerType,
        fixedStudyShortCode,
      })
      setValidatedData(data)

      if (importType !== 'subjects' && containerType !== 'none') {
        const collectionType = getCollectionType()
        if (collectionType) {
          try {
            const missing = await fetchBulkImportMissingCollections({
              rows,
              collectionType,
              getRowCollectionName,
            })
            setMissingCollections(missing)

            if (missing.length > 0) {
              setCurrentStep('collections')
              setWorkflowLoading(false)
              return
            }
          } catch (err: unknown) {
            setValidationErrors([
              {
                row: 0,
                error: getQueryErrorMessage(err, 'Failed to check collections'),
              },
            ])
            setWorkflowLoading(false)
            return
          }
        }
      }

      const preErrors = await runPreReviewServerValidation(data, [])
      if (preErrors.length > 0) {
        setValidationErrors(preErrors)
        setWorkflowLoading(false)
        return
      }

      await handleImport(data)
    } catch (error: unknown) {
      const message = getQueryErrorMessage(error, 'Validation failed')
      setValidationErrors([{ row: 0, error: message }])
    } finally {
      setWorkflowLoading(false)
    }
  }

  const handleCreateCollections = async () => {
    setWorkflowLoading(true)
    const collectionType = getCollectionType()
    if (!collectionType) {
      setWorkflowLoading(false)
      return
    }

    const updated = [...missingCollections]
    let allSuccess = true

    for (let i = 0; i < updated.length; i++) {
      const collection = updated[i]
      if (collection.status === 'success' || collection.locationId == null) continue

      updated[i].status = 'creating'
      setMissingCollections([...updated])

      try {
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
        } else {
          await collectionsApi.createBag({
            name,
            locationId: collection.locationId,
          })
        }

        updated[i].status = 'success'
        updated[i].name = name
      } catch (error: unknown) {
        const err = error as { response?: { data?: { error?: string } } }
        updated[i].status = 'error'
        updated[i].error = err.response?.data?.error ?? 'Failed to create collection'
        allSuccess = false
      }
    }

    setMissingCollections(updated)

    if (allSuccess && updated.every(c => c.status === 'success' || c.status === 'pending')) {
      const preErrors = await runPreReviewServerValidation(validatedData, updated)
      if (preErrors.length > 0) {
        setValidationErrors(preErrors)
        setWorkflowLoading(false)
        return
      }
      await handleImport(validatedData)
    } else {
      setWorkflowLoading(false)
    }
  }

  const handleImport = async (data: Record<string, unknown>[]) => {
    setCurrentStep('import')
    setWorkflowLoading(true)
    setImportResult(null)
    setValidationErrors([])

    try {
      if (importType === 'subjects') {
        const validateRes = await subjectsApi.validateBulk({ subjects: data as Array<{ studyShortCode: string; name: string }> })
        if (!validateRes.valid && validateRes.errors.length) {
          setValidationErrors(validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message })))
          setCurrentStep('import')
          setWorkflowLoading(false)
          return
        }
        const response = await subjectsApi.createBulk({ subjects: data as Array<{ studyShortCode: string; name: string }> })
        setImportResult({
          success: true,
          created: response.created,
          errors: response.errors,
        })
      } else if (importType === 'specimens') {
        const collectionLocationMap = buildCollectionLocationMap(missingCollections)
        const specimensWithLocations = buildSpecimensWithLocationIds(data, collectionLocationMap)
        type SpecimenBulkItem = Parameters<typeof specimensApi.createBulk>[0]['specimens'][number]
        const validateRes = await specimensApi.validateBulk({ specimens: specimensWithLocations as SpecimenBulkItem[] })
        if (!validateRes.valid && validateRes.errors.length > 0) {
          setValidationErrors(validateRes.errors.map((e) => ({ row: e.index + 1, error: e.message })))
          setCurrentStep('import')
          setWorkflowLoading(false)
          return
        }
        const response = await specimensApi.createBulk({ specimens: specimensWithLocations as SpecimenBulkItem[] })
        setImportResult({
          success: true,
          created: response.created,
          containersCreated: response.containersCreated,
          errors: response.errors,
        })
      } else {
        const { studyShortCode, atomicMode: am, createCollections, subjects } = buildBulkCombinedRequestPayload(
          data,
          {
            containerType,
            fixedStudyShortCode,
            missingCollections,
            atomicMode,
          }
        )

        const validateRes = await importsApi.bulkCombinedValidate({
          studyShortCode,
          atomicMode: am,
          createCollections,
          subjects,
        })
        if (!validateRes.valid && validateRes.errors.length > 0) {
          setValidationErrors(
            validateRes.errors.map((e) => ({
              row: e.rowIndex ?? e.subjectIndex + 1,
              error: e.message,
            }))
          )
          setCurrentStep('import')
          setWorkflowLoading(false)
          return
        }

        try {
          const response = await importsApi.bulkCombined({
            studyShortCode,
            atomicMode: am,
            createCollections,
            subjects,
          })
          setImportResult({
            success: !response.errors?.length,
            combinedSummary: response.summary,
            errors: response.errors,
          })
          setCurrentStep('import')
        } catch (err: unknown) {
          const error = err as { response?: { data?: { error?: string } } }
          setImportResult({
            success: false,
            created: 0,
            errors: [{ index: 0, error: error.response?.data?.error ?? 'Import failed' }],
          })
          setCurrentStep('import')
        }
      }
    } catch (error: unknown) {
      const err = error as { response?: { data?: { error?: string; errors?: Array<{ index: number; error: string }> }; message?: string } }
      const data = err.response?.data
      const summaryError = data?.error || (err as Error).message || 'Import failed'
      setValidationErrors([{ row: 0, error: summaryError }])
      setImportResult({
        success: false,
        created: 0,
        errors: Array.isArray(data?.errors) ? data.errors : [{ index: 0, error: summaryError }],
      })
    } finally {
      setWorkflowLoading(false)
    }
  }

  const getRequiredColumnsDisplay = () => {
    const required = getRequiredFields()
    const optional = getOptionalFields()
    const infoBoxStyle = { background: 'rgb(var(--app-accent-muted))', border: '1px solid rgb(var(--app-accent) / 0.3)', color: 'rgb(var(--app-text))' } as const

    if (importType === 'subjects') {
      return (
        <div className="rounded p-4 text-sm" style={infoBoxStyle}>
          <h4 className="font-semibold mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium">Required:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>{required.join(', ')}</span>
            </div>
          </div>
        </div>
      )
    }

    if (!containerType || containerType === 'none') {
      const specimenOptional = getSpecimenOptionalFields()
      return (
        <div className="rounded p-4 text-sm" style={infoBoxStyle}>
          <h4 className="font-semibold mb-2">Required CSV Columns</h4>
          <div className="space-y-1">
            <div>
              <span className="font-medium">Required:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>{required.join(', ')}</span>
            </div>
            {specimenOptional.length > 0 && (
              <div>
                <span className="font-medium">Optional:</span>
                <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>collection_date (YYYY-MM-DD)</span>
              </div>
            )}
          </div>
        </div>
      )
    }

    const baseRequired = required.filter(f => ['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))
    const containerSpecific = required.filter(f => !['study_short_code', 'subject_name', 'specimen_type_name'].includes(f))
    const specimenOptional = getSpecimenOptionalFields()
    const allOptional = [...specimenOptional, ...optional]

    return (
      <div className="rounded p-4 text-sm" style={infoBoxStyle}>
        <h4 className="font-semibold mb-2">Required CSV Columns for {String(containerType).replace('_', ' ')}</h4>
        <div className="space-y-2">
          <div>
            <span className="font-medium">Base Required:</span>
            <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>{baseRequired.join(', ')}</span>
          </div>
          <div>
            <span className="font-medium">Container Required:</span>
            <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>{containerSpecific.join(', ')}</span>
          </div>
          {allOptional.length > 0 && (
            <div>
              <span className="font-medium">Optional:</span>
              <span className="ml-2 font-mono" style={{ color: 'rgb(var(--app-accent-on-tint))' }}>{allOptional.join(', ')}</span>
            </div>
          )}
          {(containerType === 'micronix_tube' || containerType === 'cryovial_tube' || containerType === 'static_well') && (
            <div className="mt-2 pt-2 border-t" style={{ borderColor: 'rgb(var(--app-accent) / 0.3)', color: 'rgb(var(--app-accent-on-tint))' }}>
              <strong>Position format:</strong> A01, B12 (letter + 2 digits) - <strong>Required</strong>
            </div>
          )}
        </div>
      </div>
    )
  }

  const uploadHelperText = () => {
    if (fixedStudyShortCode) {
      return `This import is for study ${fixedStudyShortCode}. You do not need a study column. Upload a CSV with subject names, specimen type names, and container names/barcodes as needed.`
    }
    return `Upload a CSV file. Use study short codes, specimen type names, subject names, and container names/barcodes as identifiers.`
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10 max-w-4xl">
        {!fixedStudyShortCode && (
          <div className="mb-6">
            <h1 className="text-3xl font-bold">Bulk Import</h1>
            <p className="text-sm text-app-text-muted mt-1">
              <a href="/docs/guides/bulk-operations/import/" className="text-app-accent hover:text-app-accent-hover hover:underline">
                Import guide
              </a>
            </p>
          </div>
        )}
        {(importType === 'specimens' || importType === 'combined') && (
          <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
            <div className="storage-step-indicator">
              <div className={`storage-step-item ${effectiveStep === 'upload' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">1</span>
                <span>Upload & Validate</span>
              </div>
              <div className="storage-step-connector" />
              <div className={`storage-step-item ${effectiveStep === 'collections' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">2</span>
                <span>Create Collections{missingCollections.length === 0 && effectiveStep === 'upload' ? ' (if needed)' : ''}</span>
              </div>
              <div className="storage-step-connector" />
              <div className={`storage-step-item ${effectiveStep === 'import' ? 'storage-step-item--active' : ''}`}>
                <span className="storage-step-item__circle">3</span>
                <span>Import</span>
              </div>
            </div>
          </div>
        )}

        <div className="storage-card p-6 storage-reveal storage-reveal-2">
          {effectiveStep === 'upload' && (
            <form onSubmit={(e) => { e.preventDefault(); handleValidateAndCheck(); }} className="space-y-6">
              <div>
                <label htmlFor="import-type" className="block text-sm font-medium text-app-text mb-2">
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
                <p className="text-sm text-app-text-muted mt-1">
                  {importType === 'subjects' && (fixedStudyShortCode ? 'Import subjects for this study.' : 'Import study subjects using study short codes and subject names')}
                  {importType === 'specimens' && (fixedStudyShortCode ? 'Import specimens for existing subjects in this study.' : 'Import specimens for existing subjects using study short codes, subject names, and specimen type names')}
                  {importType === 'combined' && (fixedStudyShortCode ? 'Create subjects and their specimens for this study. Subjects will be created if they don\'t exist.' : 'Create subjects and their specimens in one import. Subjects will be created if they don\'t exist.')}
                </p>
              </div>

              {(importType === 'specimens' || importType === 'combined') && (
                <div>
                  <label htmlFor="container-type" className="block text-sm font-medium text-app-text mb-2">
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
                  <p className="text-sm text-app-text-muted mt-1">
                    All specimens in this batch will use the same container type. Select the container type for containers, or "No Containers" to skip container creation.
                  </p>
                </div>
              )}

              {importType === 'combined' && (
                <div>
                  <label className="block text-sm font-medium text-app-text mb-2">Atomicity</label>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="atomicity"
                        checked={atomicMode === 'full_file'}
                        onChange={() => setAtomicMode('full_file')}
                        className="form-radio"
                      />
                      <span>Full file (all-or-nothing)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="atomicity"
                        checked={atomicMode === 'per_subject'}
                        onChange={() => setAtomicMode('per_subject')}
                        className="form-radio"
                      />
                      <span>Per subject</span>
                    </label>
                  </div>
                  <p className="text-sm text-app-text-muted mt-1">
                    {atomicMode === 'full_file'
                      ? 'The entire file is imported in one transaction. If anything fails, nothing is committed.'
                      : 'Each subject is imported in its own transaction. Some subjects can succeed while others fail.'}
                  </p>
                </div>
              )}

              {(importType === 'subjects' || !!containerType) && (
                <div>
                  {getRequiredColumnsDisplay()}
                </div>
              )}

              {(importType === 'subjects' || !!containerType) && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="import-csv-file" className="block text-sm font-medium text-app-text">
                      CSV File *
                    </label>
                    <div className="flex items-center gap-3">
                      {file && (
                        <button type="button" onClick={handleClearFile} className="text-sm text-app-trend-down hover:text-app-trend-down/80 underline">
                          Clear File
                        </button>
                      )}
                      <button type="button" onClick={downloadTemplate} className="storage-link text-sm underline bg-transparent border-0 cursor-pointer p-0">
                        Download Template
                      </button>
                    </div>
                  </div>
                  <input
                    id="import-csv-file"
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    className="file-input-accent"
                    required
                  />
                  {file && (
                    <p className="text-sm text-app-trend-up mt-1">Selected: {file.name}</p>
                  )}
                  {!file && (
                    <p className="text-sm text-app-text-muted mt-1">
                      {uploadHelperText()}
                      {(importType === 'specimens' || importType === 'combined') && ' Optional columns: collection_date (YYYY-MM-DD)' + (containerType && containerType !== 'none' ? '; comment (per container).' : '.')}
                    </p>
                  )}
                  {templateSpecimenTypes.isError && (
                    <p className="text-sm text-app-trend-down mt-2">
                      {templateSpecimenTypes.errorMessage}
                      {' '}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => void templateSpecimenTypes.refetch()}
                      >
                        Retry
                      </button>
                    </p>
                  )}
                </div>
              )}

              {preview.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-app-text">Preview (first 5 rows)</h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-app-surface">
                        <tr>
                          {Object.keys(preview[0] ?? {}).map((key) => {
                            const required = getRequiredFields()
                            const isRequired = required.includes(key)
                            return (
                              <th key={key} className={`px-4 py-2 text-left border-b text-app-text font-medium border-app-border ${isRequired ? 'bg-app-trend-down/10' : ''}`}>
                                {key}
                                {isRequired && <span className="text-app-trend-down ml-1">*</span>}
                              </th>
                            )
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {preview.map((row, i) => (
                          <tr key={i} className="hover:bg-app-surface">
                            {Object.values(row).map((value, j) => (
                              <td key={j} className="px-4 py-2 border-b text-app-text border-app-border">
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
                <div className="bg-app-trend-down/10 border border-app-trend-down rounded p-4">
                  <h3 className="font-semibold text-app-trend-down mb-2">Validation Errors:</h3>
                  <ul className="list-disc list-inside text-app-trend-down space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>
                        {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="submit"
                disabled={!file || workflowLoading || ((importType === 'specimens' || importType === 'combined') && !containerType)}
                className="storage-btn-primary w-full py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
              >
                {workflowLoading ? 'Validating...' : 'Validate & Continue'}
              </button>
            </form>
          )}

          {effectiveStep === 'collections' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2 text-app-text">Create Missing Collections</h2>
                <p className="text-sm text-app-text-muted">
                  The following collections need to be created. Please specify a location for each one.
                </p>
              </div>

              {validationErrors.length > 0 && (
                <div className="bg-app-trend-down/10 border border-app-trend-down rounded p-4">
                  <h3 className="font-semibold text-app-trend-down mb-2">Validation errors</h3>
                  <p className="text-sm text-app-trend-down mb-2">
                    Fix your CSV and run Validate & Continue again, or adjust the fields below, before continuing to import.
                  </p>
                  <ul className="list-disc list-inside text-app-trend-down space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>
                        {error.row > 0 ? `Row ${error.row}: ` : ''}
                        {error.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="space-y-4">
                {missingCollections.map((collection, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-app-text">
                          {collection.name || collection.barcode || collection.collectionBarcode || `Collection ${index + 1}`}
                        </h3>
                        {(collection.barcode || collection.collectionBarcode) && (
                          <p className="text-sm text-app-text-muted">Barcode: {collection.barcode || collection.collectionBarcode}</p>
                        )}
                        {!collection.name && (collection.barcode || collection.collectionBarcode) && (
                          <p className="text-xs text-app-text-muted mt-1">A name will be generated from the barcode</p>
                        )}
                      </div>
                      {collection.status === 'success' && <span className="text-app-trend-up text-sm font-medium">✓ Created</span>}
                      {collection.status === 'creating' && <span className="text-app-accent text-sm">Creating...</span>}
                      {collection.status === 'error' && <span className="text-app-trend-down text-sm">Error</span>}
                    </div>

                    {collection.status === 'error' && collection.error && (
                      <div className="mb-3 text-sm text-app-trend-down">{collection.error}</div>
                    )}

                    <div>
                      <label className="block text-sm font-medium text-app-text mb-2">Location *</label>
                      <LocationPicker
                        value={collection.locationId ?? null}
                        onChange={(locationId) => {
                          const updated = [...missingCollections]
                          updated[index].locationId = locationId
                          setMissingCollections(updated)
                        }}
                        filterCollectionsOnly
                        disabled={collection.status === 'creating' || collection.status === 'success'}
                      />
                    </div>

                    {(getCollectionType() === 'micronix_plate' || getCollectionType() === 'cryovial_box') && !collection.barcode && (
                      <div className="mt-3">
                        <label className="block text-sm font-medium text-app-text mb-2">Barcode (Optional)</label>
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

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setValidationErrors([])
                    setCurrentStep('upload')
                  }}
                  className="storage-btn-secondary"
                >
                  Back
                </button>
                {importType === 'combined' && atomicMode === 'full_file' ? (
                  <button
                    type="button"
                    onClick={async () => {
                      setWorkflowLoading(true)
                      setValidationErrors([])
                      try {
                        const preErrors = await runPreReviewServerValidation(
                          validatedData,
                          missingCollections
                        )
                        if (preErrors.length > 0) {
                          setValidationErrors(preErrors)
                          return
                        }
                        await handleImport(validatedData)
                      } finally {
                        setWorkflowLoading(false)
                      }
                    }}
                    disabled={workflowLoading || missingCollections.some((c) => c.locationId == null)}
                    className="storage-btn-primary py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {workflowLoading ? 'Validating...' : 'Continue to Import'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleCreateCollections}
                    disabled={workflowLoading || missingCollections.some((c) => c.locationId == null && c.status !== 'success')}
                    className="storage-btn-primary flex-1 py-2 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                  >
                    {workflowLoading ? 'Creating Collections...' : 'Create Collections & Continue'}
                  </button>
                )}
              </div>
            </div>
          )}

          {effectiveStep === 'import' && (
            <div className="space-y-6">
              {validationErrors.length > 0 && (
                <div className="bg-app-trend-down/10 border border-app-trend-down rounded p-4">
                  <h3 className="font-semibold text-app-trend-down mb-2">Validation Errors (fix before importing):</h3>
                  <p className="text-sm text-app-trend-down mb-2">The following issues were found. Update your CSV and run Validate & Continue again.</p>
                  <ul className="list-disc list-inside text-app-trend-down space-y-1">
                    {validationErrors.map((error, i) => (
                      <li key={i}>
                        {error.row > 0 ? `Row ${error.row}: ` : ''}{error.error}
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    onClick={() => setCurrentStep('upload')}
                    className="mt-3 storage-btn-secondary"
                  >
                    Back to Upload
                  </button>
                </div>
              )}
              {importResult && (
                <div className={`border rounded p-4 ${importResult.success ? 'bg-app-trend-up/10 border-app-trend-up/30' : 'bg-yellow-50 border-yellow-200'}`}>
                  <h3 className={`font-semibold mb-2 ${importResult.success ? 'text-app-trend-up' : 'text-yellow-800'}`}>
                    Import {importResult.success ? 'Successful' : 'Completed with Errors'}
                  </h3>
                  <p className={importResult.success ? 'text-app-trend-up' : 'text-yellow-700'}>
                    {formatBulkImportSuccessMessage(importResult, importType)}
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

              {!importResult && workflowLoading && (
                <div className="text-center py-4">
                  <p className="text-app-text-muted">Import in progress...</p>
                </div>
              )}

              <div className="flex flex-wrap gap-3">
                {backLink && (
                  <Link to={backLink.to} className="storage-btn-secondary py-2 font-medium inline-block">
                    {backLink.label}
                  </Link>
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
                  className="storage-btn-primary py-2 font-medium"
                >
                  Start New Import
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
