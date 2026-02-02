import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import api, { qpcrExperimentsApi, scannerConfigurationsApi, type QpcrExperimentDetailResponse, type QpcrExperimentWell, type ScannerConfiguration } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import QpcrWellPlate from '../components/qpcr/QpcrWellPlate'
import { getContainerTypeIcon, getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'
import { useUser } from '../contexts/UserContext'
import '../styles/qpcr.css'

/** Container API response shape (GET /containers/:id) */
interface WellDetailContainerResponse {
  container: {
    id: number
    containerType?: string
    collection?: { type: string; id: number; name: string; position?: string; barcode?: string }
    locationPath?: string
    [key: string]: unknown
  }
  specimen: {
    id: number
    specimenType?: { id: number; name: string }
    collectionDate?: string
    [key: string]: unknown
  } | null
  source: {
    type: 'subject' | 'control'
    id: number
    name: string
    study?: { id: number; title: string; code: string }
    definition?: { id: number; name: string }
    [key: string]: unknown
  } | null
}

const INSTRUMENTS = [
  { id: 'biorad' as const, label: 'Bio-Rad CFX 96', ext: 'csv', format: 'biorad' },
  { id: 'quant_studio' as const, label: 'Quant Studio', ext: 'txt', format: 'quant_studio' },
]

const DEFAULT_TARGET_NAME = 'varATS'
const DEFAULT_FLUOROPHORE = 'FAM'
const DEFAULT_REPORTER = 'FAM'
const DEFAULT_INSTRUMENT_TYPE = 'QuantStudio 5 Real-Time PCR System'

const FLUOROPHORE_OPTIONS = ['FAM', 'HEX', 'VIC', 'TET', 'NED', 'CY5', 'ROX', 'SYBR']

function fluorophoreOptions(current: string): string[] {
  const set = new Set([...FLUOROPHORE_OPTIONS, current].filter(Boolean))
  return [...set]
}

function orDefault(value: string | null | undefined, defaultVal: string): string {
  const t = value?.trim()
  if (!t) return defaultVal
  const lower = t.toLowerCase()
  if (lower === 'fluorophore' || lower === 'reporter' || lower === 'instrument_type') return defaultVal
  return t
}

function getStatusLabel(status: string): string {
  switch (status) {
    case 'setup':
      return 'Setup'
    case 'template_exported':
      return 'Template ready'
    case 'results_uploaded':
      return 'Results imported'
    default:
      return status
  }
}

function getStatusPillClass(status: string): string {
  switch (status) {
    case 'setup':
      return 'qpcr-pill-setup'
    case 'template_exported':
      return 'qpcr-pill-template'
    case 'results_uploaded':
      return 'qpcr-pill-results'
    default:
      return 'inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700'
  }
}

const STEPS = [
  { id: 1, label: 'Plate', short: '1. Plate' },
  { id: 2, label: 'Template', short: '2. Template' },
  { id: 3, label: 'Run', short: '3. Run' },
  { id: 4, label: 'Import', short: '4. Import' },
]

function getCurrentStep(status: string, hasPlate: boolean): number {
  if (status === 'results_uploaded') return 4
  if (status === 'template_exported') return 3
  if (hasPlate) return 2
  return 1
}

/** Normalize well param (e.g. A1 or A01 -> A01) for URL and display. */
function normalizeWellParam(value: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed || !/^[A-Ha-h](0?[1-9]|1[0-2])$/.test(trimmed)) return null
  const row = trimmed.charAt(0).toUpperCase()
  const col = parseInt(trimmed.slice(1), 10)
  if (col < 1 || col > 12) return null
  return `${row}${col.toString().padStart(2, '0')}`
}

export default function QpcrExperimentDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { canWrite } = useUser()
  const [data, setData] = useState<QpcrExperimentDetailResponse | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scannerConfigs, setScannerConfigs] = useState<ScannerConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [plateUploading, setPlateUploading] = useState(false)
  const [plateError, setPlateError] = useState<string | null>(null)
  const [resultsUploading, setResultsUploading] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)
  const instrumentSelectRef = useRef<HTMLSelectElement>(null)
  const [targetName, setTargetName] = useState(DEFAULT_TARGET_NAME)
  const [fluorophore, setFluorophore] = useState(DEFAULT_FLUOROPHORE)
  const [reporter, setReporter] = useState(DEFAULT_REPORTER)
  const [instrumentType, setInstrumentType] = useState(DEFAULT_INSTRUMENT_TYPE)
  const [savingSettings, setSavingSettings] = useState(false)
  const selectedWellPosition = normalizeWellParam(searchParams.get('well'))
  const [wellDetails, setWellDetails] = useState<WellDetailContainerResponse | null>(null)
  const [wellDetailsLoading, setWellDetailsLoading] = useState(false)
  const [wellDetailsError, setWellDetailsError] = useState<string | null>(null)
  const prevExperimentSyncRef = useRef<{
    id: number
    targetName: string
    fluorophore: string
    reporter: string
    instrumentType: string
  } | null>(null)

  const loadData = () => {
    if (!id) return
    const numId = parseInt(id, 10)
    if (isNaN(numId)) return
    qpcrExperimentsApi.get(numId).then((res) => setData(res.data)).catch(() => {})
  }

  useEffect(() => {
    if (id) {
      const numId = parseInt(id, 10)
      if (isNaN(numId)) {
        setError('Invalid experiment ID')
        setLoading(false)
        return
      }
      qpcrExperimentsApi.get(numId)
        .then((res) => setData(res.data))
        .catch((err: { response?: { data?: { error?: string } } }) => {
          setError(err.response?.data?.error ?? 'Failed to load experiment')
        })
        .finally(() => setLoading(false))
      scannerConfigurationsApi.getShared().then((res) => {
        const configs = (res.data as { configurations?: ScannerConfiguration[] })?.configurations ?? []
        setScannerConfigs(configs)
        const defaultConfig = configs.find((c) => c.isDefault === true) ?? configs[0]
        if (defaultConfig) setSelectedConfigId(defaultConfig.id)
      }).catch(() => {})
    }
  }, [id])

  // Sync form state from data.experiment when it changes (during render to avoid extra pass)
  if (data?.experiment) {
    const exp = data.experiment
    const nextTarget = orDefault(exp.targetName ?? null, DEFAULT_TARGET_NAME)
    const nextFluorophore = orDefault(exp.fluorophore ?? null, DEFAULT_FLUOROPHORE)
    const nextReporter = orDefault(exp.reporter ?? null, DEFAULT_REPORTER)
    const nextInstrument = orDefault(exp.instrumentType ?? null, DEFAULT_INSTRUMENT_TYPE)
    const prev = prevExperimentSyncRef.current
    if (
      prev === null ||
      prev.id !== exp.id ||
      prev.targetName !== nextTarget ||
      prev.fluorophore !== nextFluorophore ||
      prev.reporter !== nextReporter ||
      prev.instrumentType !== nextInstrument
    ) {
      prevExperimentSyncRef.current = {
        id: exp.id,
        targetName: nextTarget,
        fluorophore: nextFluorophore,
        reporter: nextReporter,
        instrumentType: nextInstrument,
      }
      setTargetName(nextTarget)
      setFluorophore(nextFluorophore)
      setReporter(nextReporter)
      setInstrumentType(nextInstrument)
    }
  }

  // When URL well param or wells data changes, fetch container details for that well (must run before any early return)
  useEffect(() => {
    if (!selectedWellPosition || !data?.wells) {
      setWellDetails(null)
      setWellDetailsError(null)
      setWellDetailsLoading(false)
      return
    }
    const well = data.wells.find((w) => w.wellPosition === selectedWellPosition)
    const containerId = well?.storageContainerId
    setWellDetailsError(null)
    if (containerId != null) {
      setWellDetailsLoading(true)
      setWellDetails(null)
      api
        .get<WellDetailContainerResponse>(`/containers/${containerId}`)
        .then((res) => {
          setWellDetails(res.data)
          setWellDetailsError(null)
        })
        .catch((err: { response?: { data?: { error?: string } } }) => {
          setWellDetailsError(err.response?.data?.error ?? 'Failed to load container details')
          setWellDetails(null)
        })
        .finally(() => setWellDetailsLoading(false))
    } else {
      setWellDetails(null)
      setWellDetailsLoading(false)
    }
  }, [selectedWellPosition, data?.wells])

  if (loading) {
    return (
      <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <SkeletonDetailPage sections={1} />
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="text-center py-12 text-red-600 font-medium">{error ?? 'Experiment not found'}</div>
          <Link to="/qpcr-experiments" className="text-teal-600 hover:underline text-sm font-medium">
            Back to qPCR experiments
          </Link>
        </div>
      </div>
    )
  }

  const { experiment, wells } = data
  const hasPlate = wells.length > 0
  const currentStep = getCurrentStep(experiment.status, hasPlate)

  const breadcrumbItems = [
    { label: 'qPCR Experiments', to: '/qpcr-experiments' },
    { label: experiment.name ?? `Experiment ${experiment.id}`, to: undefined },
  ]

  const apiBase = '/api'
  const templateBase = `${apiBase}/qpcr-experiments/${experiment.id}/template`
  const templateUrl = (format: 'biorad' | 'quant_studio') => {
    const params = new URLSearchParams({ format, targetName: targetName.trim() || DEFAULT_TARGET_NAME })
    if (format === 'biorad') {
      params.set('fluorophore', fluorophore.trim() || DEFAULT_FLUOROPHORE)
    } else {
      params.set('reporter', reporter.trim() || DEFAULT_REPORTER)
      params.set('instrumentType', instrumentType.trim() || DEFAULT_INSTRUMENT_TYPE)
    }
    return `${templateBase}?${params.toString()}`
  }

  const handleSaveSettings = async () => {
    if (!id) return
    setSavingSettings(true)
    try {
      await qpcrExperimentsApi.update(parseInt(id), {
        targetName: targetName.trim() || null,
        fluorophore: fluorophore.trim() || null,
        reporter: reporter.trim() || null,
        instrumentType: instrumentType.trim() || null,
      })
      loadData()
    } finally {
      setSavingSettings(false)
    }
  }

  const handleDelete = async () => {
    if (!id || !window.confirm('Delete this experiment and all its plate layout, template, and results? This cannot be undone.')) return
    setDeleting(true)
    try {
      await qpcrExperimentsApi.delete(parseInt(id))
      navigate('/qpcr-experiments', { replace: true })
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err && typeof (err as { response?: { data?: { error?: string } } }).response?.data?.error === 'string'
        ? (err as { response: { data: { error: string } } }).response.data.error
        : 'Failed to delete experiment'
      setError(message)
    } finally {
      setDeleting(false)
    }
  }

  const handleWellSelect = (position: string, _well: QpcrExperimentWell | undefined) => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        next.set('well', position)
        return next
      },
      { replace: false }
    )
  }

  return (
    <div className="qpcr-theme min-h-screen bg-gradient-to-b from-slate-50 to-white">
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-8">
          <EntityBreadcrumbs items={breadcrumbItems} />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">
                {experiment.name ?? `qPCR Experiment ${experiment.id}`}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-3 text-sm">
                <span className={getStatusPillClass(experiment.status)}>
                  {getStatusLabel(experiment.status)}
                </span>
                {experiment.plateBarcode && (
                  <span className="text-slate-500">Plate: {experiment.plateBarcode}</span>
                )}
              </div>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="qpcr-btn-danger"
              >
                {deleting ? 'Deleting…' : 'Delete experiment'}
              </button>
            )}
          </div>
        </div>

        {/* Step indicator */}
        <nav aria-label="Workflow steps" className="mb-8">
          <ol className="flex flex-wrap items-center gap-2 sm:gap-4">
            {STEPS.map((step, index) => {
              const isActive = currentStep === step.id
              const isPast = currentStep > step.id
              return (
                <li key={step.id} className="flex items-center gap-2 sm:gap-4">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-teal-500 text-white'
                        : isPast
                          ? 'bg-teal-100 text-teal-800'
                          : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {step.id}
                  </span>
                  <span
                    className={`text-sm font-medium hidden sm:inline ${
                      isActive ? 'text-slate-800' : isPast ? 'text-slate-600' : 'text-slate-500'
                    }`}
                  >
                    {step.label}
                  </span>
                  {index < STEPS.length - 1 && (
                    <span className="h-px w-4 bg-slate-200 sm:w-8" aria-hidden />
                  )}
                </li>
              )
            })}
          </ol>
        </nav>

        {/* Step 1: Plate layout */}
        <section className="qpcr-card p-6 mb-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">1. Plate layout</h2>
          <p className="text-sm text-slate-600 mb-4">
            Upload a CSV with micronix barcodes and well positions. Use the same scanner configuration as for container move.
          </p>
          {canWrite && (
            <div className="space-y-3">
              {plateError && (
                <p className="text-sm text-red-600 rounded-lg bg-red-50 px-3 py-2" role="alert">
                  {plateError}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Scanner config</label>
                  <select
                    value={selectedConfigId ?? ''}
                    onChange={(e) => setSelectedConfigId(e.target.value || null)}
                    className="qpcr-select w-auto min-w-[140px]"
                  >
                    {scannerConfigs.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-1">
                  <input
                    type="file"
                    accept=".csv"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !id || !selectedConfigId) return
                      setPlateError(null)
                      setPlateUploading(true)
                      try {
                        const csvText = await file.text()
                        const res = await qpcrExperimentsApi.uploadPlate(parseInt(id), { csvText, scannerConfigurationId: selectedConfigId })
                        if (res.data.unresolved?.length) {
                          setPlateError(`${res.data.unresolved.length} unresolved barcode(s): ${res.data.unresolved.map((u) => `${u.wellPosition}:${u.barcode}`).join(', ')}`)
                        }
                        loadData()
                      } catch (err: unknown) {
                        const msg = err && typeof err === 'object' && 'response' in err
                          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                          : 'Upload failed'
                        setPlateError(msg ?? 'Upload failed')
                      } finally {
                        setPlateUploading(false)
                        e.target.value = ''
                      }
                    }}
                    disabled={plateUploading || !selectedConfigId}
                  />
                  {plateUploading ? 'Uploading…' : 'Choose CSV'}
                </label>
              </div>
            </div>
          )}

          {hasPlate && (
            <div className="mt-6 pt-6 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-x-6 gap-y-3 items-start">
              <div className="lg:col-span-2">
                <h3 className="text-sm font-medium text-slate-700">96-well plate</h3>
                <p className="text-xs text-slate-500 mt-1">Click a well to view container, specimen, and subject details.</p>
              </div>
              <div className="shrink-0">
                <QpcrWellPlate
                  wells={wells}
                  selectedWellPosition={selectedWellPosition}
                  onWellSelect={handleWellSelect}
                />
              </div>
              <div className="qpcr-well-panel qpcr-card min-w-0 lg:min-w-[280px] lg:max-w-md p-4">
                {selectedWellPosition == null ? (
                  <p className="text-sm text-slate-500">Click a well to view container, specimen, and subject details.</p>
                ) : (
                  <>
                    <div className="mb-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-700">
                        Well {selectedWellPosition}
                      </span>
                    </div>
                    {wellDetailsLoading && (
                      <p className="text-sm text-slate-500">Loading…</p>
                    )}
                    {wellDetailsError && (
                      <p className="text-sm text-red-600 rounded-lg bg-red-50 px-3 py-2" role="alert">
                        {wellDetailsError}
                      </p>
                    )}
                    {!wellDetailsLoading && !wellDetailsError && wellDetails == null && (
                      <p className="text-sm text-slate-500">No container in this well.</p>
                    )}
                    {!wellDetailsLoading && !wellDetailsError && wellDetails != null && (
                      <div className="qpcr-reveal flex flex-col gap-4">
                        <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-slate-500 mt-0.5 shrink-0" aria-hidden>
                            {wellDetails.container?.containerType != null
                              ? getContainerTypeIcon(wellDetails.container.containerType)
                              : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-500">Container</p>
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {wellDetails.container?.containerType != null
                                ? getContainerTypeName(wellDetails.container.containerType)
                                : '—'}
                              {wellDetails.container?.collection?.name != null && (
                                <> · {wellDetails.container.collection.name}</>
                              )}
                            </p>
                            {wellDetails.container?.collection?.position != null && (
                              <p className="text-xs text-slate-500">Position: {wellDetails.container.collection.position}</p>
                            )}
                            {wellDetails.container?.id != null && (
                              <Link
                                to={`/containers/${wellDetails.container.id}`}
                                className="qpcr-well-panel-link text-sm mt-1 inline-block"
                              >
                                View container →
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          <span className="text-slate-500 mt-0.5 shrink-0" aria-hidden>
                            {wellDetails.specimen?.specimenType?.name != null
                              ? getSpecimenTypeIcon(wellDetails.specimen.specimenType.name)
                              : null}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-500">Specimen</p>
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {wellDetails.specimen?.specimenType?.name ?? '—'}
                            </p>
                            {wellDetails.specimen?.collectionDate != null && (
                              <p className="text-xs text-slate-500">Collected: {wellDetails.specimen.collectionDate}</p>
                            )}
                            {wellDetails.specimen?.id != null && (
                              <Link
                                to={`/specimens/${wellDetails.specimen.id}`}
                                className="qpcr-well-panel-link text-sm mt-1 inline-block"
                              >
                                View specimen →
                              </Link>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-3 rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-500">
                              {wellDetails.source?.type === 'subject' ? 'Subject' : 'Control'}
                            </p>
                            <p className="text-sm font-medium text-slate-800 truncate">
                              {wellDetails.source?.name ?? '—'}
                            </p>
                            {wellDetails.source?.type === 'subject' && wellDetails.source.study != null && (
                              <p className="text-xs text-slate-500">
                                Study: {wellDetails.source.study.code}
                                {wellDetails.source.study.title != null ? ` — ${wellDetails.source.study.title}` : ''}
                              </p>
                            )}
                            {wellDetails.source?.type === 'control' && wellDetails.source.definition != null && (
                              <p className="text-xs text-slate-500">{wellDetails.source.definition.name}</p>
                            )}
                            {wellDetails.source?.type === 'subject' && wellDetails.source.id != null && (
                              <Link
                                to={`/subjects/${wellDetails.source.id}`}
                                className="qpcr-well-panel-link text-sm mt-1 inline-block"
                              >
                                View subject →
                              </Link>
                            )}
                            {wellDetails.source?.type === 'control' && wellDetails.source.id != null && (
                              <Link
                                to={`/blood-controls/batches/${wellDetails.source.id}`}
                                className="qpcr-well-panel-link text-sm mt-1 inline-block"
                              >
                                View batch →
                              </Link>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Step 2: Template */}
        <section className={`qpcr-card p-6 mb-6 ${!hasPlate ? 'opacity-75' : ''}`}>
          <h2 className="text-lg font-semibold text-slate-800 mb-1">2. Template settings and download</h2>
          <p className="text-sm text-slate-600 mb-4">
            Templates use study subject names for samples and parasite density for standard controls. Defaults match typical varATS TaqMan assays. Change as needed for your assay.
          </p>
          <div className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Target name</label>
                <input
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  className="qpcr-input text-sm"
                  placeholder="e.g. varATS"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Fluorophore (Bio-Rad)</label>
                <select
                  value={fluorophore}
                  onChange={(e) => setFluorophore(e.target.value)}
                  className="qpcr-select text-sm"
                >
                  {fluorophoreOptions(fluorophore).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500 mb-1">Reporter (Quant Studio)</label>
                <select
                  value={reporter}
                  onChange={(e) => setReporter(e.target.value)}
                  className="qpcr-select text-sm"
                >
                  {fluorophoreOptions(reporter).map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
                <p className="mt-0.5 text-xs text-slate-500">Quencher: SYBR → None, others → NFQ-MGB.</p>
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-500 mb-1">Instrument type (Quant Studio)</label>
                <input
                  type="text"
                  value={instrumentType}
                  onChange={(e) => setInstrumentType(e.target.value)}
                  className="qpcr-input text-sm"
                  placeholder="e.g. QuantStudio 5 Real-Time PCR System"
                />
              </div>
            </div>
            {canWrite && (
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={savingSettings}
                className="qpcr-btn-secondary text-sm"
              >
                {savingSettings ? 'Saving…' : 'Save settings'}
              </button>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {INSTRUMENTS.map((inst) => (
              <a
                key={inst.id}
                href={templateUrl(inst.format as 'biorad' | 'quant_studio')}
                download={`qpcr-experiment-${experiment.id}-${inst.id}-template.${inst.ext}`}
                className={hasPlate ? 'qpcr-btn-primary' : 'qpcr-btn-primary opacity-50 pointer-events-none cursor-not-allowed'}
                aria-disabled={!hasPlate}
                onClick={(e) => !hasPlate && e.preventDefault()}
              >
                Download {inst.label} ({inst.ext.toUpperCase()})
              </a>
            ))}
          </div>
          {!hasPlate && (
            <p className="mt-2 text-xs text-slate-500">Upload a plate layout above to enable template download.</p>
          )}
        </section>

        {/* Bridge */}
        <p className="text-sm text-slate-600 mb-6 py-3 px-4 rounded-xl bg-slate-50 border border-slate-100">
          <strong>3. Run.</strong> Load the downloaded template on your qPCR instrument and run the assay. Then return here to import results.
        </p>

        {/* Step 4: Import results */}
        <section className="qpcr-card p-6">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">4. Import results</h2>
          <p className="text-sm text-slate-600 mb-4">
            Upload the result file from your instrument (Bio-Rad CSV or Quant Studio XLS).
          </p>
          {canWrite && (
            <div className="space-y-3">
              {resultsError && (
                <p className="text-sm text-red-600 rounded-lg bg-red-50 px-3 py-2" role="alert">
                  {resultsError}
                </p>
              )}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-500 mb-1">Instrument</label>
                  <select
                    ref={instrumentSelectRef}
                    className="qpcr-select w-auto min-w-[180px]"
                    defaultValue="Biorad_CFX"
                  >
                    <option value="Biorad_CFX">Bio-Rad CFX (CSV)</option>
                    <option value="QuantStudio">Quant Studio (XLS)</option>
                  </select>
                </div>
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-dashed border-slate-200 bg-slate-50/50 px-5 py-3 text-sm font-medium text-slate-700 hover:border-teal-300 hover:bg-teal-50/50 transition-colors focus-within:ring-2 focus-within:ring-teal-500 focus-within:ring-offset-1">
                  <input
                    type="file"
                    accept=".csv,.xls,.xlsx"
                    className="sr-only"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file || !id) return
                      setResultsError(null)
                      setResultsUploading(true)
                      try {
                        const buf = await file.arrayBuffer()
                        const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
                        const resultInstrument = (instrumentSelectRef.current?.value as 'Biorad_CFX' | 'QuantStudio') ?? 'Biorad_CFX'
                        await qpcrExperimentsApi.uploadResults(parseInt(id), { fileContent: base64, fileName: file.name, instrumentType: resultInstrument })
                        loadData()
                      } catch (err: unknown) {
                        const msg = err && typeof err === 'object' && 'response' in err
                          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
                          : 'Upload failed'
                        setResultsError(msg ?? 'Upload failed')
                      } finally {
                        setResultsUploading(false)
                        e.target.value = ''
                      }
                    }}
                    disabled={resultsUploading}
                  />
                  {resultsUploading ? 'Uploading…' : 'Choose file'}
                </label>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
