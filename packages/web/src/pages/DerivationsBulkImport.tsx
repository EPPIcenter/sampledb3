import { useState, useEffect, useRef, useMemo } from 'react'
import { useNavigate, useSearchParams, Navigate, Link } from 'react-router-dom'
import { derivationsApi } from '../lib/api/derivations';
import type { BulkDerivationSettings, ValidationResult, DerivationCsvImportResultRow } from '../lib/api/derivations';
import { collectionsApi } from '../lib/api/collections';
import { specimenTypesApi } from '../lib/api/reference-data';
import { getCollectionNameColumn } from '../lib/container-columns'
import { generateDerivationsTemplate, type TemplateOptions } from '../lib/template-generator'
import { useDerivationsBulkImportBootstrap } from '../hooks/useDerivationsBulkImportBootstrap'
import { useUser } from '../contexts/UserContext'
import LocationPicker from '../components/LocationPicker'
import { PageError } from '../ui'
import { DERIVATION_TYPES } from '../lib/derivation-types'
import '../styles/storage.css'

interface MissingDerivationCollection {
  name?: string
  barcode?: string
  containerType: 'micronix_tube' | 'cryovial_tube'
  locationId: number | null
  status: 'pending' | 'creating' | 'success' | 'error'
  error?: string
}

const CONTAINER_TYPES = [
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'paper', label: 'Paper' },
]

const SOURCE_TYPES = [
  { value: 'control_batch', label: 'Control Batch (e.g., DBS spots, control cryovials)' },
  { value: 'study_subject', label: 'Study Subject (e.g., participant specimens)' },
]

type UrlStep = 'upload' | 'collections' | 'review' | 'import'
type SourceType = 'control_batch' | 'study_subject'
type ParentContainerType = 'paper' | 'cryovial_tube' | 'micronix_tube'

function parseCsvPreview(csv: string): Record<string, string>[] {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < Math.min(6, lines.length); i++) {
    const values = lines[i].split(',')
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = values[j]?.trim() ?? ''
    })
    rows.push(row)
  }
  return rows
}

/** Parse full CSV into headers and rows (naive split; used for editable review). */
function parseFullCsv(csv: string): { headers: string[]; rows: Record<string, string>[] } {
  const lines = csv.trim().split(/\r?\n/).filter((l) => l.trim())
  if (lines.length < 2) return { headers: [], rows: [] }
  const headers = lines[0].split(',').map((h) => h.trim())
  const rows: Record<string, string>[] = []
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',')
    const row: Record<string, string> = {}
    headers.forEach((header, j) => {
      row[header] = values[j]?.trim() ?? ''
    })
    rows.push(row)
  }
  return { headers, rows }
}

/** Serialize headers and rows back to CSV (escape values that contain comma or quote). */
function serializeToCsv(headers: string[], rows: Record<string, string>[]): string {
  const escape = (v: string): string => {
    if (v.includes(',') || v.includes('"') || v.includes('\n')) {
      return `"${v.replace(/"/g, '""')}"`
    }
    return v
  }
  const headerLine = headers.map(escape).join(',')
  const dataLines = rows.map((r) => headers.map((h) => escape(r[h] ?? '')).join(','))
  return [headerLine, ...dataLines].join('\n')
}

/** Required and optional CSV columns for the current source, parent type, and settings. */
function getRequiredAndOptionalColumns(
  sourceType: SourceType,
  parentContainerType: ParentContainerType,
  settings: BulkDerivationSettings
): { required: string[]; optional: string[] } {
  const required: string[] = []
  const optional: string[] = []

  // Parent identification (required)
  if (sourceType === 'control_batch') {
    required.push('parent_control_batch_name', 'parent_specimen_type_name')
    if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    }
  } else {
    if (parentContainerType === 'paper') {
      required.push('parent_study_short_code', 'parent_subject_name', 'parent_specimen_type_name')
      optional.push('parent_collection_date')
    } else if (parentContainerType === 'cryovial_tube') {
      required.push('parent_box_barcode', 'parent_position')
    } else {
      required.push('parent_container_barcode')
    }
  }

  // Per-row derivation fields (required in CSV when not set in Import settings)
  if (!settings.derivationType) required.push('derivation_type')
  if (!settings.specimenTypeName) required.push('specimen_type_name')
  if (!settings.containerType) required.push('container_type')
  if (!settings.protocol) required.push('protocol')
  if (!settings.derivationDate) required.push('derivation_date')

  // Derived container placement
  const fixedContainerType = settings.containerType
  if (fixedContainerType === 'micronix_tube') {
    required.push('plate_name or collection_barcode')
  } else if (fixedContainerType === 'cryovial_tube') {
    required.push('box_name or collection_barcode')
  } else if (fixedContainerType === 'paper') {
    required.push('bag_name')
  } else {
    required.push('plate_name / box_name / bag_name (depends on container_type)')
    optional.push('collection_barcode')
  }
  required.push('position')
  optional.push('container_barcode')
  optional.push('notes')

  // Quantity fields: only optional in CSV when not set in Import settings
  if (settings.quantity === undefined) optional.push('quantity')
  if (!settings.unitSymbol) optional.push('unit_symbol')
  if (settings.quantityUsed === undefined) optional.push('quantity_used')
  if (settings.reduceParentQuantity === undefined) optional.push('reduce_parent_quantity')

  return { required, optional }
}

export default function DerivationsBulkImport() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const currentStep = (searchParams.get('step') as UrlStep | null) ?? 'upload'
  const { canWrite } = useUser()

  const setCurrentStep = (step: UrlStep) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  if (!canWrite) {
    return <Navigate to="/derivations" replace />
  }

  const [workflowLoading, setWorkflowLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [defaultsExpanded, setDefaultsExpanded] = useState(false)

  const [sourceType, setSourceType] = useState<SourceType>('control_batch')
  const [parentContainerType, setParentContainerType] = useState<ParentContainerType>('paper')
  const [settings, setSettings] = useState<BulkDerivationSettings>({
    derivationType: '',
    specimenTypeName: '',
    containerType: '',
    protocol: '',
    derivationDate: '',
    quantity: undefined,
    unitSymbol: '',
    quantityUsed: undefined,
    reduceParentQuantity: true,
    validateSourceSpecimenType: false,
    validateParentQuantity: false,
  })

  const bootstrap = useDerivationsBulkImportBootstrap(settings.specimenTypeName)
  const { specimenTypes, units, allowedContainerTypes, bootstrapLoading, bootstrapError, containerTypesError } =
    bootstrap
  const formDisabled = workflowLoading || bootstrapLoading

  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvContent, setCsvContent] = useState<string>('')
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null)
  const [importResults, setImportResults] = useState<DerivationCsvImportResultRow[] | null>(null)
  const importResultsRef = useRef<HTMLDivElement>(null)
  /** Editable rows for review step; headers from parsed CSV. */
  const [reviewHeaders, setReviewHeaders] = useState<string[]>([])
  const [reviewRows, setReviewRows] = useState<Record<string, string>[]>([])

  const effectiveStep: UrlStep =
    currentStep !== 'upload' && !csvContent ? 'upload' : currentStep

  useEffect(() => {
    if (effectiveStep === 'upload' && currentStep !== 'upload') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', 'upload')
        return next
      })
    }
  }, [effectiveStep, currentStep, setSearchParams])

  // Pure derivation: compute base list from validationResult during render
  const baseMissingCollections = useMemo(() => {
    if (!validationResult?.collections.length) return []
    const needCreation = validationResult.collections.filter(
      (c): c is typeof c & { containerType: 'micronix_tube' | 'cryovial_tube' } =>
        c.status === 'will_be_created' &&
        (c.containerType === 'micronix_tube' || c.containerType === 'cryovial_tube')
    )
    return needCreation.map((c) => ({
      name: c.name,
      barcode: c.barcode,
      containerType: c.containerType,
      locationId: null as number | null,
      status: 'pending' as const,
    }))
  }, [validationResult])

  // User-driven updates (locationId, status, error) keyed by index
  const [userUpdates, setUserUpdates] = useState<Record<number, Partial<MissingDerivationCollection>>>({})
  const prevValidationResultRef = useRef<ValidationResult | null>(null)
  const validationResultChanged = validationResult !== prevValidationResultRef.current
  if (validationResultChanged) {
    prevValidationResultRef.current = validationResult
    setUserUpdates({})
  }

  // Display list: merge base with user overrides (skip overrides when validation just changed to avoid stale flash)
  const missingCollections = useMemo(
    () =>
      validationResultChanged
        ? baseMissingCollections
        : baseMissingCollections.map((item, i) => ({ ...item, ...userUpdates[i] })),
    [baseMissingCollections, userUpdates, validationResultChanged]
  )

  useEffect(() => {
    if (
      settings.containerType &&
      allowedContainerTypes.length > 0 &&
      !allowedContainerTypes.includes(settings.containerType)
    ) {
      setSettings((prev) => ({
        ...prev,
        containerType: allowedContainerTypes[0] as BulkDerivationSettings['containerType'],
      }))
    }
  }, [settings.containerType, allowedContainerTypes])

  // Synchronize viewport with DOM: scroll to results section after import completes.
  // (Effect is appropriate here: we react to state-driven DOM update, not the click itself.)
  useEffect(() => {
    if (importResults != null) {
      importResultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [importResults])

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = (event.target?.result as string) || ''
      setCsvContent(text)
      setError(null)
      setValidationResult(null)
      setImportResults(null)
    }
    reader.onerror = () => setError('Failed to read file')
    reader.readAsText(file)
  }

  const handleClearFile = () => {
    setCsvContent('')
    setValidationResult(null)
    setImportResults(null)
    setReviewHeaders([])
    setReviewRows([])
    setError(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const validateCsv = async (): Promise<ValidationResult | null> => {
    if (!csvContent.trim()) {
      setError('Please upload a CSV file')
      return null
    }
    setWorkflowLoading(true)
    setError(null)
    try {
      const result = await derivationsApi.validateCsv(csvContent, settings)
      setValidationResult(result)
      return result
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string; details?: string } } }
      setError(
        errObj.response?.data?.error ??
          errObj.response?.data?.details ??
          'Failed to validate CSV'
      )
      return null
    } finally {
      setWorkflowLoading(false)
    }
  }

  const handleValidateAndContinue = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = await validateCsv()
    if (!result) return
    const { headers, rows } = parseFullCsv(csvContent)
    setReviewHeaders(headers)
    setReviewRows(rows.map((r) => ({ ...r })))
    const hasMissingCollections = result.collections.some(
      (c) =>
        c.status === 'will_be_created' &&
        (c.containerType === 'micronix_tube' || c.containerType === 'cryovial_tube')
    )
    if (hasMissingCollections) {
      setCurrentStep('collections')
    } else {
      setCurrentStep('review')
    }
  }

  const getCsvForImport = (): string => {
    if (reviewHeaders.length > 0 && reviewRows.length > 0) {
      return serializeToCsv(reviewHeaders, reviewRows)
    }
    return csvContent
  }

  const handleImport = async () => {
    const csvToSend = getCsvForImport()
    if (!csvToSend.trim()) {
      setError('Please upload a CSV file')
      return
    }
    setWorkflowLoading(true)
    setError(null)
    try {
      const response = await derivationsApi.importCsv(csvToSend, {
        dryRun: false,
        settings,
      })
      setImportResults(response.rows)
    } catch (err: unknown) {
      const errObj = err as { response?: { data?: { error?: string; details?: string } } }
      setError(
        errObj.response?.data?.error ??
          errObj.response?.data?.details ??
          'Failed to import derivations'
      )
    } finally {
      setWorkflowLoading(false)
    }
  }

  const handleCreateCollections = async () => {
    if (missingCollections.length === 0) return
    let allSuccess = true

    for (let i = 0; i < missingCollections.length; i++) {
      const coll = missingCollections[i]
      if (coll.status === 'success' || !coll.locationId) continue

      setUserUpdates((prev) => ({ ...prev, [i]: { ...prev[i], status: 'creating' } }))

      try {
        const name =
          coll.name ||
          (coll.barcode ? `Collection-${coll.barcode}` : `Collection-${Date.now()}`)
        const barcode = coll.barcode

        if (coll.containerType === 'micronix_tube') {
          await collectionsApi.createMicronixPlate({
            name,
            locationId: coll.locationId!,
            barcode,
          })
        } else {
          await collectionsApi.createCryovialBox({
            name,
            locationId: coll.locationId!,
            barcode,
          })
        }

        setUserUpdates((prev) => ({ ...prev, [i]: { ...prev[i], status: 'success', name } }))
      } catch (err: unknown) {
        const errObj = err as { response?: { data?: { error?: string } } }
        setUserUpdates((prev) => ({
          ...prev,
          [i]: {
            ...prev[i],
            status: 'error',
            error: errObj.response?.data?.error || 'Failed to create collection',
          },
        }))
        allSuccess = false
      }
    }

    if (allSuccess) {
      setError(null)
      const { headers, rows } = parseFullCsv(csvContent)
      setReviewHeaders(headers)
      setReviewRows(rows.map((r) => ({ ...r })))
      setCurrentStep('review')
    }
  }

  const downloadTemplate = async () => {
    let specimenTypes: Array<{ id: number; name: string }> | undefined
    try {
      const res = await specimenTypesApi.list()
      specimenTypes = res.data
    } catch {
      specimenTypes = undefined
    }

    let parentType: TemplateOptions['parentType']
    if (sourceType === 'control_batch') {
      parentType =
        parentContainerType === 'cryovial_tube' ? 'control_batch' : 'control_batch'
    } else {
      if (parentContainerType === 'paper') parentType = 'study_subject'
      else if (parentContainerType === 'cryovial_tube') parentType = 'cryovial_position'
      else parentType = 'barcode'
    }

    const template = generateDerivationsTemplate({
      parentType,
      settings,
      sourceType,
      parentContainerType,
      specimenTypes,
      exampleDerivationType: settings.derivationType || DERIVATION_TYPES[0]?.value,
      exampleProtocol: settings.protocol || undefined,
    })

    const blob = new Blob([template], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'derivations_import_template.csv'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const previewRows = csvContent ? parseCsvPreview(csvContent) : []
  const successCount = importResults?.filter((r) => r.success).length ?? 0
  const errorCount = importResults?.filter((r) => !r.success).length ?? 0
  const warningCount =
    importResults?.filter((r) => r.warnings && r.warnings.length > 0).length ?? 0

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Bulk Derivation Import</h1>
          <p className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Create derivation records that link parent specimens to new specimens. One row per derivation; upload a CSV or use the template.
          </p>
        </div>

        {/* Step indicator: upload | collections (conditional) | import */}
        <div className="storage-card p-4 mb-6 storage-reveal storage-reveal-1">
          <div className="storage-step-indicator">
            <div
              className={`storage-step-item ${effectiveStep === 'upload' ? 'storage-step-item--active' : ''}`}
            >
              <span className="storage-step-item__circle">1</span>
              <span>Upload</span>
            </div>
            <div className="storage-step-connector" />
            <div
              className={`storage-step-item ${effectiveStep === 'collections' ? 'storage-step-item--active' : ''}`}
            >
              <span className="storage-step-item__circle">2</span>
              <span>Collections</span>
            </div>
            <div className="storage-step-connector" />
            <div
              className={`storage-step-item ${effectiveStep === 'review' ? 'storage-step-item--active' : ''}`}
            >
              <span className="storage-step-item__circle">3</span>
              <span>Review & Edit</span>
            </div>
            <div className="storage-step-connector" />
            <div
              className={`storage-step-item ${effectiveStep === 'import' ? 'storage-step-item--active' : ''}`}
            >
              <span className="storage-step-item__circle">4</span>
              <span>Import</span>
            </div>
          </div>
        </div>

        {bootstrapError && (
          <PageError
            title="Could not load import options"
            message={bootstrapError}
            onRetry={() => bootstrap.refetchBootstrap()}
          />
        )}

        {containerTypesError && !bootstrapError && (
          <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
            {containerTypesError}
            <button
              type="button"
              className="ml-2 underline"
              onClick={() => bootstrap.refetchBootstrap()}
            >
              Retry
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
            {error}
          </div>
        )}

        {/* Step: Upload */}
        {effectiveStep === 'upload' && (
          <div className="storage-card p-6 storage-reveal storage-reveal-2">
            <form onSubmit={handleValidateAndContinue} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    Source <span className="text-app-trend-down">*</span>
                  </label>
                  <select
                    value={sourceType}
                    onChange={(e) => {
                      setSourceType(e.target.value as SourceType)
                      setParentContainerType('paper')
                    }}
                    className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                    disabled={formDisabled}
                  >
                    {SOURCE_TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-app-text-muted mt-1">
                    Where parent specimens come from
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text mb-1">
                    Parent container type <span className="text-app-trend-down">*</span>
                  </label>
                  <select
                    value={parentContainerType}
                    onChange={(e) =>
                      setParentContainerType(e.target.value as ParentContainerType)
                    }
                    className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                    disabled={formDisabled}
                  >
                    {sourceType === 'control_batch' ? (
                      <>
                        <option value="paper">Paper (DBS spots)</option>
                        <option value="cryovial_tube">Cryovial Tube</option>
                      </>
                    ) : (
                      <>
                        <option value="paper">Paper (DBS spots)</option>
                        <option value="micronix_tube">Micronix Tube</option>
                        <option value="cryovial_tube">Cryovial Tube</option>
                      </>
                    )}
                  </select>
                  <p className="text-xs text-app-text-muted mt-1">
                    Type of container you're deriving from
                  </p>
                </div>
              </div>

              {/* Collapsible: Import settings (same for entire file) */}
              <div className="border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => setDefaultsExpanded(!defaultsExpanded)}
                  className="w-full px-4 py-3 text-left text-sm font-medium flex items-center justify-between"
                  style={{
                    background: 'rgb(var(--app-accent-muted))',
                    color: 'rgb(var(--app-text))',
                  }}
                >
                  <span>Import settings</span>
                  <span className="text-lg">{defaultsExpanded ? '−' : '+'}</span>
                </button>
                {defaultsExpanded && (
                  <div className="p-4 space-y-4 border-t bg-app-card">
                    <p className="text-sm text-app-text-muted mb-3">
                      Set a value to use it for every row. Choose &quot;In CSV (per row)&quot; or leave a field blank to provide that column in your CSV instead (one value per row).
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-1">
                        Derivation type
                      </label>
                      <select
                        value={settings.derivationType}
                        onChange={(e) =>
                          setSettings({ ...settings, derivationType: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                        disabled={formDisabled}
                      >
                        <option value="">— In CSV (per row) —</option>
                        {DERIVATION_TYPES.map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-1">
                        Derived specimen type
                      </label>
                      <select
                        value={settings.specimenTypeName}
                        onChange={(e) =>
                          setSettings({ ...settings, specimenTypeName: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                        disabled={formDisabled}
                      >
                        <option value="">— In CSV (per row) —</option>
                        {specimenTypes.map((st) => (
                          <option key={st.id} value={st.name}>
                            {st.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-1">
                        Derived container type
                      </label>
                      <select
                        value={settings.containerType}
                        onChange={(e) =>
                          setSettings({
                            ...settings,
                            containerType: e.target.value as BulkDerivationSettings['containerType'],
                          })
                        }
                        className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                        disabled={formDisabled}
                      >
                        <option value="">— In CSV (per row) —</option>
                        {(allowedContainerTypes.length > 0
                          ? CONTAINER_TYPES.filter((t) =>
                              allowedContainerTypes.includes(t.value)
                            )
                          : CONTAINER_TYPES
                        ).map((t) => (
                          <option key={t.value} value={t.value}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-1">
                        Protocol
                      </label>
                      <input
                        type="text"
                        value={settings.protocol}
                        onChange={(e) =>
                          setSettings({ ...settings, protocol: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                        placeholder="Protocol name or reference"
                        disabled={formDisabled}
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-1">
                        Derivation date
                      </label>
                      <input
                        type="date"
                        value={settings.derivationDate}
                        onChange={(e) =>
                          setSettings({ ...settings, derivationDate: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                        disabled={formDisabled}
                      />
                      <p className="text-xs text-app-text-muted mt-1">
                        Leave empty to use a <code className="bg-app-surface px-1 rounded">derivation_date</code> column in your CSV (one value per row).
                      </p>
                    </div>
                    <div className="border-t border-app-border pt-4 mt-2">
                      <p className="text-sm font-medium text-app-text mb-3">Quantity (optional)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-app-text mb-1">
                            Derived container quantity
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={settings.quantity ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === '') {
                                setSettings({ ...settings, quantity: undefined })
                              } else {
                                const n = Number(v)
                                if (!Number.isNaN(n)) setSettings({ ...settings, quantity: n })
                              }
                            }}
                            className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                            placeholder="e.g. 1"
                            disabled={formDisabled}
                          />
                          <p className="text-xs text-app-text-muted mt-1">Leave empty to use CSV column per row.</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-app-text mb-1">
                            Unit
                          </label>
                          <select
                            value={settings.unitSymbol ?? ''}
                            onChange={(e) =>
                              setSettings({ ...settings, unitSymbol: e.target.value || '' })
                            }
                            className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                            disabled={formDisabled}
                          >
                            <option value="">— In CSV (per row) —</option>
                            {units.map((u) => (
                              <option key={u.id} value={u.symbol}>
                                {u.symbol}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-app-text mb-1">
                            Quantity used (from parent)
                          </label>
                          <input
                            type="number"
                            min={0}
                            step="any"
                            value={settings.quantityUsed ?? ''}
                            onChange={(e) => {
                              const v = e.target.value
                              if (v === '') {
                                setSettings({ ...settings, quantityUsed: undefined })
                              } else {
                                const n = Number(v)
                                if (!Number.isNaN(n)) setSettings({ ...settings, quantityUsed: n })
                              }
                            }}
                            className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                            placeholder="e.g. 1"
                            disabled={formDisabled}
                          />
                          <p className="text-xs text-app-text-muted mt-1">Leave empty to use CSV column per row. Used when reducing parent quantity (e.g. DBS spot count).</p>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-app-text mb-1">
                            Reduce parent quantity
                          </label>
                          <select
                            value={settings.reduceParentQuantity === undefined ? '' : String(settings.reduceParentQuantity)}
                            onChange={(e) => {
                              const v = e.target.value
                              setSettings({
                                ...settings,
                                reduceParentQuantity: v === '' ? undefined : v === 'true',
                              })
                            }}
                            className="w-full px-3 py-2 border border-app-border rounded-md focus:outline-none focus:ring-2 focus:ring-app-accent"
                            disabled={formDisabled}
                          >
                            <option value="true">Yes (same for all rows)</option>
                            <option value="false">No (same for all rows)</option>
                            <option value="">— In CSV (per row) —</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {(() => {
                const { required, optional } = getRequiredAndOptionalColumns(
                  sourceType,
                  parentContainerType,
                  settings
                )
                return (
                  <div className="rounded-lg border border-app-border bg-app-surface px-4 py-3 text-sm text-app-text space-y-3">
                    <p className="font-medium text-app-text">
                      CSV template guide
                      {' — '}
                      <a href="/docs/guides/features/derivations/" className="text-app-accent hover:text-app-accent-hover hover:underline">
                        full guide
                      </a>
                    </p>
                    <div>
                      <p className="font-medium text-app-text mb-0.5">Required columns</p>
                      <p className="text-app-text-muted">{required.join(', ')}</p>
                    </div>
                    {optional.length > 0 && (
                      <div>
                        <p className="font-medium text-app-text mb-0.5">Optional columns</p>
                        <p className="text-app-text-muted">{optional.join(', ')}</p>
                      </div>
                    )}
                    <div className="border-t border-app-border pt-3 mt-1 space-y-1.5 text-app-text-muted">
                      <p>
                        <span className="font-medium text-app-text">
                          {settings.containerType
                            ? `${getCollectionNameColumn(settings.containerType)!}${settings.containerType === 'paper' ? '' : ' or collection_barcode'}`
                            : 'plate_name / box_name / bag_name (based on container_type)'}
                        </span>
                        {' '}
                        — Required collection identifier. For tube types, collection barcode can also be used. Collections are created if they don&apos;t exist.
                      </p>
                      <p><span className="font-medium text-app-text">position</span> — Position in the collection (e.g. A01, B02).</p>
                      <p><span className="font-medium text-app-text">quantity, unit_symbol, quantity_used, reduce_parent_quantity</span> — Optional. You can set these in Import settings (same for all rows) or provide columns in the CSV (per row). Use <code className="bg-app-surface px-1 rounded text-xs">quantity_used</code> and <code className="bg-app-surface px-1 rounded text-xs">reduce_parent_quantity</code> to reduce the parent&apos;s remaining quantity (e.g. DBS spot count). Not a blocker if missing or if data is imperfect.</p>
                      <p className="pt-1"><span className="font-medium text-app-text">parent_specimen_type_name</span> is the <em>parent</em> specimen type (e.g. DBS, Whole Blood). The <em>derived</em> specimen type (e.g. DNA (DBS)) is set in Import settings or in the <code className="bg-app-surface px-1 rounded text-xs">specimen_type_name</code> column.</p>
                    </div>
                  </div>
                )
              })()}

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label
                    htmlFor="derivation-csv-file"
                    className="block text-sm font-medium text-app-text"
                  >
                    CSV file <span className="text-app-trend-down">*</span>
                  </label>
                  <div className="flex items-center gap-3">
                    {csvContent && (
                      <button
                        type="button"
                        onClick={handleClearFile}
                        className="text-sm text-app-trend-down hover:text-app-trend-down underline"
                      >
                        Clear file
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={downloadTemplate}
                      className="storage-link text-sm underline bg-transparent border-0 cursor-pointer p-0"
                    >
                      Download template
                    </button>
                  </div>
                </div>
                <input
                  id="derivation-csv-file"
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="file-input-accent"
                  disabled={formDisabled}
                />
                {csvContent && (
                  <p className="text-sm text-app-trend-up mt-1">
                    Selected: {csvContent.split(/\r?\n/).length - 1} rows
                  </p>
                )}
              </div>

              {previewRows.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2 text-app-text">
                    Preview (first 5 rows)
                  </h3>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="min-w-full text-sm">
                      <thead className="bg-app-surface">
                        <tr>
                          {Object.keys(previewRows[0] ?? {}).map((key) => (
                            <th
                              key={key}
                              className="px-4 py-2 text-left border-b text-app-text font-medium"
                            >
                              {key}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((row, i) => (
                          <tr key={i} className="hover:bg-app-surface">
                            {Object.values(row).map((value, j) => (
                              <td
                                key={j}
                                className="px-4 py-2 border-b text-app-text"
                              >
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

              <div className="flex gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => navigate('/derivations')}
                  className="storage-btn-secondary"
                  disabled={formDisabled}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!csvContent.trim() || workflowLoading}
                  className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {workflowLoading ? 'Validating…' : 'Validate & Continue'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step: Collections */}
        {effectiveStep === 'collections' && missingCollections.length > 0 && (
          <div className="space-y-6">
            <div className="storage-card p-6 storage-reveal storage-reveal-2">
              <h2 className="storage-section-title text-xl font-semibold mb-2">
                Create missing collections
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>
                Assign a location for each collection below, then click Create collections & continue.
              </p>
              <div className="space-y-4">
                {missingCollections.map((coll, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 bg-app-card"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <h3 className="font-medium text-app-text">
                          {coll.name ?? coll.barcode ?? `Collection ${index + 1}`}
                        </h3>
                        {(coll.barcode ?? coll.name) && (
                          <p className="text-sm text-app-text-muted">
                            {coll.barcode ? `Barcode: ${coll.barcode}` : ''}
                            {coll.barcode && coll.name ? ' · ' : ''}
                            {coll.name ? `Name: ${coll.name}` : ''}
                          </p>
                        )}
                      </div>
                      {coll.status === 'success' && (
                        <span className="text-app-trend-up text-sm font-medium">Created</span>
                      )}
                      {coll.status === 'creating' && (
                        <span className="text-app-accent text-sm">Creating…</span>
                      )}
                      {coll.status === 'error' && (
                        <span className="text-app-trend-down text-sm">Error</span>
                      )}
                    </div>
                    {coll.status === 'error' && coll.error && (
                      <div className="mb-3 text-sm text-app-trend-down">{coll.error}</div>
                    )}
                    <div>
                      <label className="block text-sm font-medium text-app-text mb-2">
                        Location <span className="text-app-trend-down">*</span>
                      </label>
                      <LocationPicker
                        value={coll.locationId ?? null}
                        onChange={(locationId) => {
                          setUserUpdates((prev) => ({
                            ...prev,
                            [index]: { ...prev[index], locationId: locationId ?? null },
                          }))
                        }}
                        filterCollectionsOnly
                        disabled={coll.status === 'creating' || coll.status === 'success'}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex gap-3 mt-4 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setCurrentStep('upload')}
                  className="storage-btn-secondary"
                  disabled={formDisabled}
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleCreateCollections}
                  disabled={
                    workflowLoading ||
                    missingCollections.some(
                      (c) => (c.status !== 'success' && !c.locationId)
                    )
                  }
                  className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {workflowLoading
                    ? 'Creating & importing…'
                    : 'Create collections & continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Review & Edit */}
        {effectiveStep === 'review' && reviewHeaders.length > 0 && (
          <div className="space-y-6">
            <div className="storage-card p-6 storage-reveal storage-reveal-2">
              <h2 className="storage-section-title text-xl font-semibold mb-2">
                Review and edit data
              </h2>
              <p className="text-sm mb-4" style={{ color: 'rgb(var(--app-text-muted))' }}>
                The default unit for the derived container type (e.g. µL for tubes) is used; you can change it in the review step if needed. Edit any values below before importing.
              </p>
              <div className="overflow-x-auto border border-app-border rounded-lg mb-6">
                <table className="min-w-full text-sm">
                  <thead className="bg-app-surface border-b border-app-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium text-app-text w-10">#</th>
                      {reviewHeaders.map((h) => (
                        <th key={h} className="px-3 py-2 text-left font-medium text-app-text">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-app-border">
                    {reviewRows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="hover:bg-app-surface">
                        <td className="px-3 py-1.5 text-app-text-muted">{rowIndex + 1}</td>
                        {reviewHeaders.map((header) => (
                          <td key={header} className="px-3 py-1.5">
                            <input
                              type="text"
                              value={row[header] ?? ''}
                              onChange={(e) => {
                                const value = e.target.value
                                setReviewRows((prev) =>
                                  prev.map((r, i) =>
                                    i === rowIndex ? { ...r, [header]: value } : r
                                  )
                                )
                              }}
                              className="w-full px-2 py-1 border border-app-border rounded text-app-text focus:ring-1 focus:ring-app-accent focus:border-app-accent"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setCurrentStep(
                      missingCollections.length > 0 ? 'collections' : 'upload'
                    )
                  }
                  className="storage-btn-secondary"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    await handleImport()
                    setCurrentStep('import')
                  }}
                  disabled={formDisabled}
                  className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {workflowLoading ? 'Creating…' : 'Create derivations'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step: Import (Create derivations or result) */}
        {effectiveStep === 'import' && validationResult && (
          <div className="space-y-6">
            <div className="storage-card p-6 storage-reveal storage-reveal-2">
              <h2 className="storage-section-title text-xl font-semibold mb-4">
                Review & create
              </h2>

              <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="bg-app-trend-up/10 border border-app-trend-up/30 rounded p-3">
                  <div className="text-sm text-app-trend-up font-medium">Valid</div>
                  <div className="text-2xl font-bold text-app-text">
                    {validationResult.summary.valid}
                  </div>
                </div>
                <div className="bg-app-trend-down/10 border border-app-trend-down rounded p-3">
                  <div className="text-sm text-app-trend-down font-medium">Invalid</div>
                  <div className="text-2xl font-bold text-app-trend-down">
                    {validationResult.summary.invalid}
                  </div>
                </div>
                <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                  <div className="text-sm text-yellow-700 font-medium">Warnings</div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {validationResult.summary.warnings}
                  </div>
                </div>
                <div
                  className="rounded p-3"
                  style={{
                    background: 'rgb(var(--app-accent-muted))',
                    border: '1px solid rgb(var(--app-accent) / 0.3)',
                  }}
                >
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'rgb(var(--app-accent-hover))' }}
                  >
                    Total
                  </div>
                  <div
                    className="text-2xl font-bold"
                    style={{ color: 'rgb(var(--app-text))' }}
                  >
                    {validationResult.summary.total}
                  </div>
                </div>
              </div>

              {validationResult.collections.length > 0 && (
                <div className="mb-6">
                  <h4 className="text-sm font-medium text-app-text mb-2">Collections</h4>
                  <div className="space-y-1">
                    {validationResult.collections.map((col, idx) => (
                      <div key={idx} className="text-sm">
                        <span className="font-medium">
                          {col.name ?? col.barcode ?? 'Unnamed'}
                        </span>
                        <span
                          className={`ml-2 px-2 py-1 rounded text-xs ${
                            col.status === 'existing'
                              ? 'bg-app-trend-up/10 text-app-trend-up'
                              : 'bg-yellow-100 text-yellow-700'
                          }`}
                        >
                          {col.status === 'existing' ? 'Existing' : 'Will be created'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div
                className="mb-4 p-3 rounded text-sm"
                style={{
                  background: 'rgb(var(--app-accent-muted))',
                  border: '1px solid rgb(var(--app-accent) / 0.3)',
                  color: 'rgb(var(--app-accent-hover))',
                }}
              >
                <strong>All-or-nothing import:</strong> All derivations will be created, or none if any row fails.
              </div>

              <div className="max-h-96 overflow-y-auto mb-6">
                <table className="min-w-full divide-y divide-app-border">
                  <thead className="bg-app-surface sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                        Row
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                        Status
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                        Collection
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                        Details
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-app-card divide-y divide-app-border">
                    {validationResult.rows.map((row) => (
                      <tr
                        key={row.index}
                        className={row.valid ? 'bg-app-trend-up/10' : 'bg-app-trend-down/10'}
                      >
                        <td className="px-3 py-2 text-sm text-app-text">
                          {row.index + 1}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.valid ? (
                            <span className="text-app-trend-up font-medium">✓ Valid</span>
                          ) : (
                            <span className="text-app-trend-down font-medium">✗ Invalid</span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.collectionStatus && (
                            <span
                              className={`px-2 py-1 rounded text-xs ${
                                row.collectionStatus === 'existing'
                                  ? 'bg-app-trend-up/10 text-app-trend-up'
                                  : 'bg-yellow-100 text-yellow-700'
                              }`}
                            >
                              {row.collectionStatus === 'existing'
                                ? 'Existing'
                                : 'Will be created'}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          {row.error && (
                            <div className="text-app-trend-down">{row.error}</div>
                          )}
                          {row.warnings && row.warnings.length > 0 && (
                            <div className="text-yellow-700">
                              <div className="font-medium">Warnings:</div>
                              <ul className="list-disc list-inside">
                                {row.warnings.map((w, i) => (
                                  <li key={i}>{w}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {row.valid && !row.error && (
                            <div className="text-app-trend-up">Ready to import</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {importResults == null ? (
                <div className="flex gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={() => setCurrentStep('upload')}
                    className="storage-btn-secondary"
                    disabled={formDisabled}
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={handleImport}
                    disabled={formDisabled || (validationResult.summary.invalid) > 0}
                    className="storage-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                    title={
                      (validationResult.summary.invalid) > 0
                        ? 'Fix invalid rows before creating derivations'
                        : undefined
                    }
                  >
                    {workflowLoading ? 'Creating…' : 'Create derivations'}
                  </button>
                </div>
              ) : (
                <div className="pt-4 border-t">
                  <Link
                    to="/derivations"
                    className="storage-btn-primary inline-flex items-center"
                  >
                    Back to Derivations
                  </Link>
                </div>
              )}
            </div>

            {/* Import results (after run) */}
            {importResults != null && (
              <div ref={importResultsRef} className="storage-card p-6 storage-reveal storage-reveal-3">
                <h3 className="storage-section-title text-lg font-semibold mb-4">
                  Import results
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="bg-app-trend-up/10 border border-app-trend-up/30 rounded p-3">
                    <div className="text-sm text-app-trend-up font-medium">Successful</div>
                    <div className="text-2xl font-bold text-app-text">
                      {successCount}
                    </div>
                  </div>
                  <div className="bg-app-trend-down/10 border border-app-trend-down rounded p-3">
                    <div className="text-sm text-app-trend-down font-medium">Errors</div>
                    <div className="text-2xl font-bold text-app-trend-down">{errorCount}</div>
                  </div>
                  <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                    <div className="text-sm text-yellow-700 font-medium">Warnings</div>
                    <div className="text-2xl font-bold text-yellow-900">
                      {warningCount}
                    </div>
                  </div>
                </div>
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-app-border">
                    <thead className="bg-app-surface sticky top-0">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                          Row
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-app-text-muted uppercase">
                          Details
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-app-card divide-y divide-app-border">
                      {importResults.map((row, idx) => (
                        <tr
                          key={idx}
                          className={row.success ? 'bg-app-trend-up/10' : 'bg-app-trend-down/10'}
                        >
                          <td className="px-3 py-2 text-sm text-app-text">
                            {row.index + 1}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {row.success ? (
                              <span className="text-app-trend-up font-medium">
                                ✓ Success
                              </span>
                            ) : (
                              <span className="text-app-trend-down font-medium">✗ Error</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm">
                            {row.error && (
                              <div className="text-app-trend-down">{row.error}</div>
                            )}
                            {row.warnings && row.warnings.length > 0 && (
                              <div className="text-yellow-700">
                                <div className="font-medium">Warnings:</div>
                                <ul className="list-disc list-inside">
                                  {row.warnings.map((w, i) => (
                                    <li key={i}>{w}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                            {row.success && !row.error && (
                              <div className="text-app-trend-up">
                                {row.derivationTypeName ?? row.parentSummary ?? row.childSummary ? (
                                  <>
                                    {[row.parentSummary, row.derivationTypeName, row.childSummary]
                                      .filter(Boolean)
                                      .join(' → ')}
                                  </>
                                ) : (
                                  'Created'
                                )}
                              </div>
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
        )}
      </div>
    </div>
  )
}
