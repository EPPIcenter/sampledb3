import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { collectionsApi } from '../lib/api/collections';
import type { ValidatePlateScanResult, InferenceReport } from '../lib/api/collections';
import { scannerConfigurationsApi } from '../lib/api/settings';
import type { ScannerConfiguration } from '../lib/api/settings';
import { extractPlateStemFromFilename, findPlateCandidatesFromStem } from '../lib/plate-filename-match'
import { parseScannerPlateCsv } from '../lib/scanner-plate-csv'
import { inferDestinationPlateForScan } from '../lib/plate-destination-inference'
import '../styles/storage.css'


type WellStatus = ValidatePlateScanResult['wells'][number]['status']

function statusLabel(s: WellStatus): string {
  switch (s) {
    case 'match':
      return 'Match'
    case 'mismatch':
      return 'Mismatch'
    case 'missing_in_scan':
      return 'Missing in scan'
    case 'extra_in_scan':
      return 'Extra in scan'
    default:
      return s
  }
}

function statusClass(s: WellStatus): string {
  switch (s) {
    case 'match':
      return 'bg-app-trend-up/10 text-app-trend-up border-app-trend-up/30'
    case 'mismatch':
      return 'bg-app-trend-down/10 text-app-trend-down border-app-trend-down'
    case 'missing_in_scan':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'extra_in_scan':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    default:
      return 'bg-app-surface text-app-text'
  }
}

/** Escape a CSV field (wrap in quotes and double internal quotes). */
function csvEscape(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

/** Build a CSV report from validation result: summary block then well rows. */
function buildValidationReportCsv(result: ValidatePlateScanResult): string {
  const { plate, summary, wells } = result
  const lines: string[] = []
  lines.push('Plate scan validation report')
  lines.push(`Plate,${csvEscape(plate.name)}`)
  lines.push(`Plate ID,${plate.id}`)
  if (result.inferredPlate) {
    lines.push('Inferred plate,Yes')
  }
  lines.push(`Generated,${new Date().toISOString()}`)
  lines.push('')
  lines.push('Summary')
  lines.push(`Total expected,${summary.totalExpected}`)
  lines.push(`Matched,${summary.matched}`)
  lines.push(`Mismatch,${summary.mismatch}`)
  lines.push(`Missing in scan,${summary.missingInScan}`)
  lines.push(`Extra in scan,${summary.extraInScan}`)
  lines.push(`Exhausted count,${summary.exhaustedCount}`)
  lines.push(`Tagged count,${summary.taggedCount}`)
  lines.push('')
  const header = ['Position', 'Scanned', 'Expected', 'Scanned barcode from (plate)', 'Scanned barcode from (position)', 'Status', 'Exhausted', 'Tags']
  lines.push(header.map(csvEscape).join(','))
  for (const w of wells) {
    const originPlate = w.scanBarcodeOrigin ? w.scanBarcodeOrigin.plateName : ''
    const originPos = w.scanBarcodeOrigin ? w.scanBarcodeOrigin.position : ''
    const tags = w.tags.length ? w.tags.join('; ') : ''
    const row = [
      w.position,
      w.scanBarcode ?? '',
      w.expectedBarcode ?? '',
      originPlate,
      originPos,
      statusLabel(w.status),
      w.exhausted ? 'Yes' : 'No',
      tags,
    ]
    lines.push(row.map((c) => csvEscape(String(c))).join(','))
  }
  return lines.join('\r\n')
}

function downloadReport(result: ValidatePlateScanResult): void {
  const csv = buildValidationReportCsv(result)
  const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const safeName = result.plate.name.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').slice(0, 80)
  a.download = `plate-scan-validation_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

/** Build CSV from inference report (unknown barcodes + plate breakdown). */
function buildInferenceReportCsv(report: InferenceReport): string {
  const lines: string[] = []
  lines.push('Plate scan inference report')
  lines.push('No single plate could be inferred from the scan.')
  lines.push(`Generated,${new Date().toISOString()}`)
  lines.push('')
  lines.push('Unknown barcodes (not in database)')
  lines.push(`Count,${report.unknownBarcodes.length}`)
  if (report.unknownBarcodes.length > 0) {
    lines.push(report.unknownBarcodes.map(csvEscape).join(','))
  }
  lines.push('')
  lines.push('Plate breakdown')
  lines.push(['Plate ID', 'Plate name', 'Tubes on scan', 'In expected position'].map(csvEscape).join(','))
  for (const row of report.plateBreakdown) {
    lines.push([row.plateId, row.plateName, row.tubeCount, row.inExpectedPositionCount].map((c) => csvEscape(String(c))).join(','))
  }
  return lines.join('\r\n')
}

function downloadInferenceReport(report: InferenceReport): void {
  const csv = buildInferenceReportCsv(report)
  const blob = new Blob([csv], { type: 'text/csv; charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `plate-scan-inference-report_${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

type PlateMode = 'select_plate' | 'infer_plate'

function applyPlateInferenceForValidation(
  text: string,
  fileName: string,
  configId: string | null,
  configs: ScannerConfiguration[],
  plateList: Array<{ id: number; name: string }>
): { error: string | null; candidateRows: Array<{ id: number; name: string; matchType: string }> } {
  const config = configId ? configs.find((c) => c.id === configId) : undefined
  if (!config) {
    const stem = extractPlateStemFromFilename(fileName)
    const cands = findPlateCandidatesFromStem(stem, plateList)
    return {
      error: null,
      candidateRows: cands.map((c) => ({ id: c.id, name: c.name, matchType: c.matchType })),
    }
  }
  const rows = parseScannerPlateCsv(text, config)
  const inference = inferDestinationPlateForScan(fileName, rows, config, plateList)
  if (inference.plateInferenceErrors.length > 0) {
    return {
      error: inference.plateInferenceErrors.map((e) => e.error).join(' '),
      candidateRows: [],
    }
  }
  return {
    error: null,
    candidateRows: inference.inferredMatches.map((c) => ({
      id: c.id,
      name: c.name,
      matchType: c.matchType,
    })),
  }
}

export default function PlateScanValidation() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState<string>('')
  const [scannerConfigurations, setScannerConfigurations] = useState<ScannerConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [plateMode, setPlateMode] = useState<PlateMode>('select_plate')
  const [plates, setPlates] = useState<Array<{ id: number; name: string }>>([])
  const [selectedPlateId, setSelectedPlateId] = useState<number | null>(null)
  const [plateSearch, setPlateSearch] = useState('')
  const [candidates, setCandidates] = useState<Array<{ id: number; name: string; matchType: string }>>([])
  const [result, setResult] = useState<ValidatePlateScanResult | null>(null)
  const [inferenceReport, setInferenceReport] = useState<InferenceReport | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Initial data load. Optional refactor: move to route loader when using a data router to avoid useEffect for fetching.
  useEffect(() => {
    Promise.all([
      collectionsApi.listCollectionsByType('micronix_plate'),
      scannerConfigurationsApi.getAll(),
    ]).then(([collectionsRes, configsRes]) => {
      const collectionsData = (collectionsRes.data as { collections?: unknown[] }).collections ?? []
      setPlates(
        (collectionsData as Array<{ id: number; name: string }>).map((c) => ({
          id: c.id,
          name: c.name,
        }))
      )
      const configsData = (configsRes.data as { configurations?: ScannerConfiguration[] } & { value?: { configurations?: ScannerConfiguration[] } }).value ?? configsRes.data
      const configs = (configsData as { configurations: ScannerConfiguration[] }).configurations
      setScannerConfigurations(configs)
      const defaultConfig = configs.find((c: ScannerConfiguration) => c.isDefault === true)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- fallback when no default config
      setSelectedConfigId(defaultConfig?.id ?? configs[0]?.id ?? null)
    }).catch((err) => {
      console.error('Failed to load plates or scanner configs:', err)
      setError('Failed to load plate list or scanner configurations.')
    })
  }, [])

  useEffect(() => {
    if (!csvText || !csvFile || !selectedConfigId || scannerConfigurations.length === 0) return
    const list = plates.map((p) => ({ id: p.id, name: p.name }))
    const { error: inferErr, candidateRows } = applyPlateInferenceForValidation(
      csvText,
      csvFile.name,
      selectedConfigId,
      scannerConfigurations,
      list
    )
    if (inferErr) {
      setError(inferErr)
      setCandidates([])
      if (plateMode === 'infer_plate') setSelectedPlateId(null)
      return
    }
    setCandidates(candidateRows)
    if (plateMode === 'infer_plate') {
      const single = candidateRows.length === 1 ? candidateRows[0].id : null
      setSelectedPlateId(single)
    }
  }, [selectedConfigId, csvText, csvFile, scannerConfigurations, plates, plateMode])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setResult(null)
    setInferenceReport(null)
    setError(null)
    if (!file) {
      setCsvFile(null)
      setCsvText('')
      setSelectedPlateId(null)
      setCandidates([])
      return
    }
    const text = await file.text()
    setCsvFile(file)
    setCsvText(text)
    const list = plates.map((p) => ({ id: p.id, name: p.name }))
    const { error: inferErr, candidateRows } = applyPlateInferenceForValidation(
      text,
      file.name,
      selectedConfigId,
      scannerConfigurations,
      list
    )
    if (inferErr) {
      setError(inferErr)
      setCandidates([])
      setSelectedPlateId(null)
      return
    }
    setCandidates(candidateRows)
    if (candidateRows.length === 1) {
      setSelectedPlateId(candidateRows[0].id)
    } else {
      setSelectedPlateId(null)
    }
  }

  const handleValidate = async () => {
    const inferMode = plateMode === 'infer_plate'
    if (!csvText || !selectedConfigId) {
      setError('Please select a CSV file and a scanner configuration.')
      return
    }
    if (!inferMode && selectedPlateId == null) {
      setError('Please select a plate, or use "Infer plate from scan".')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    setInferenceReport(null)
    try {
      const res = await collectionsApi.validatePlateScan({
        csvText,
        ...(inferMode ? {} : { plateId: selectedPlateId! }),
        scannerConfigurationId: selectedConfigId,
      })
      const data = res.data
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- discriminator check for union
      if ('inferenceReport' in data && data.inferenceReport) {
        setInferenceReport(data.inferenceReport)
        setResult(null)
      } else {
        setResult(data as ValidatePlateScanResult)
        setInferenceReport(null)
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Validation failed.'
        : 'Validation failed.'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const wellList = result?.wells ?? []

  const searchLower = plateSearch.trim().toLowerCase()
  const suggestedFiltered = useMemo(
    () =>
      searchLower
        ? candidates.filter((c) => c.name.toLowerCase().includes(searchLower))
        : candidates,
    [candidates, searchLower]
  )
  const otherFiltered = useMemo(
    () =>
      plates.filter(
        (p) =>
          !candidates.some((c) => c.id === p.id) &&
          (searchLower ? p.name.toLowerCase().includes(searchLower) : true)
      ),
    [plates, candidates, searchLower]
  )
  const selectedPlate = selectedPlateId != null ? plates.find((p) => p.id === selectedPlateId) ?? candidates.find((c) => c.id === selectedPlateId) : null
  const inferMode = plateMode === 'infer_plate'
  const canValidate = Boolean(csvText && selectedConfigId && (inferMode || selectedPlateId != null))

  return (
    <div className="storage-page min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        <div className="mb-6 storage-reveal storage-reveal-1">
          <nav className="text-sm text-app-text-muted mb-2">
            <Link to="/" className="storage-link hover:underline">Dashboard</Link>
            <span className="mx-2">/</span>
            <span className="text-app-text">Validate Plate Scan</span>
          </nav>
          <h1 className="text-2xl font-bold text-app-text">Validate Plate Scan</h1>
          <p className="text-app-text-muted mt-1">
            Upload a scanned plate CSV and compare it to a micronix plate. Plate suggestions use the scanner configuration: either the file name (dates/times stripped) or a column that repeats the plate name on each row.
          </p>
        </div>

        {error && (
          <div className="storage-card p-4 mb-6 border-app-trend-down bg-app-trend-down/10 text-app-trend-down storage-reveal storage-reveal-2">
            {error}
          </div>
        )}

        <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
          <h2 className="storage-section-title mb-4">Upload and configure</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-app-text mb-1">Scanner configuration</label>
              <select
                value={selectedConfigId ?? ''}
                onChange={(e) => {
                  setSelectedConfigId(e.target.value || null)
                  setResult(null)
                  setInferenceReport(null)
                  setError(null)
                }}
                className="w-full max-w-md px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:border-[rgb(var(--app-accent))]"
              >
                {scannerConfigurations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-app-text mb-1">CSV file</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full max-w-md text-sm text-app-text file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-app-border file:bg-app-card file:font-medium file:text-app-text hover:file:bg-app-surface"
              />
              {csvFile && (
                <p className="text-sm text-app-text-muted mt-1">
                  {csvFile.name}
                  {candidates.length > 0 && !inferMode && (
                    <span className="ml-2">
                      — {candidates.length} plate{candidates.length !== 1 ? 's' : ''} suggested (
                      {selectedConfigId &&
                      scannerConfigurations.find((c) => c.id === selectedConfigId)?.plateNameSource === 'column'
                        ? 'CSV column'
                        : 'file name'}
                      )
                    </span>
                  )}
                </p>
              )}
            </div>
            <fieldset className="space-y-2">
              <legend className="block text-sm font-medium text-app-text mb-1">Plate</legend>
              <div className="flex flex-wrap gap-4">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="plateMode"
                    checked={plateMode === 'select_plate'}
                    onChange={() => {
                      setPlateMode('select_plate')
                      setResult(null)
                      setInferenceReport(null)
                      setError(null)
                    }}
                    className="rounded border-app-border text-[rgb(var(--app-accent))] focus:ring-[rgb(var(--app-accent))]"
                    aria-label="I know the plate"
                  />
                  <span>I know the plate</span>
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="plateMode"
                    checked={plateMode === 'infer_plate'}
                    onChange={() => {
                      setPlateMode('infer_plate')
                      setResult(null)
                      setInferenceReport(null)
                      setError(null)
                    }}
                    className="rounded border-app-border text-[rgb(var(--app-accent))] focus:ring-[rgb(var(--app-accent))]"
                    aria-label="Infer plate from scan"
                  />
                  <span>Infer plate from scan</span>
                </label>
              </div>
            </fieldset>
            {plateMode === 'select_plate' && (
            <div>
              <label className="block text-sm font-medium text-app-text mb-1">Select plate</label>
              {selectedPlate ? (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-app-text">
                    Selected: <span className="font-semibold">{selectedPlate.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedPlateId(null)
                      setResult(null)
                      setInferenceReport(null)
                      setError(null)
                    }}
                    className="text-sm text-[rgb(var(--app-accent))] hover:underline focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))] rounded"
                  >
                    Change
                  </button>
                </div>
              ) : null}
              <input
                type="text"
                value={plateSearch}
                onChange={(e) => setPlateSearch(e.target.value)}
                placeholder="Search by plate name..."
                aria-label="Search plates"
                className="w-full max-w-md px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:border-[rgb(var(--app-accent))] mb-2"
              />
              <div
                role="listbox"
                aria-label="Plate list"
                className="w-full max-w-md border border-app-border rounded-lg overflow-hidden max-h-[240px] overflow-y-auto bg-app-card"
              >
                {suggestedFiltered.length === 0 && otherFiltered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-app-text-muted">
                    {plates.length === 0 ? 'No plates in database.' : 'No plates match your search.'}
                  </div>
                ) : (
                  <>
                    {suggestedFiltered.length > 0 && (
                      <div className="px-3 py-1.5 bg-app-surface border-b border-app-border text-xs font-medium text-app-text-muted sticky top-0">
                        Suggested (
                        {selectedConfigId &&
                        scannerConfigurations.find((c) => c.id === selectedConfigId)?.plateNameSource === 'column'
                          ? 'column'
                          : 'file name'}
                        )
                      </div>
                    )}
                    {suggestedFiltered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={selectedPlateId === p.id}
                        onClick={() => {
                          setSelectedPlateId(p.id)
                          setResult(null)
                          setInferenceReport(null)
                          setError(null)
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm border-b border-app-border last:border-b-0 hover:bg-[rgb(var(--app-accent-muted))] focus:outline-none focus:bg-[rgb(var(--app-accent-muted))] ${
                          selectedPlateId === p.id ? 'bg-[rgb(var(--app-accent-muted))] font-medium' : ''
                        }`}
                      >
                        {p.name}
                        {p.matchType ? (
                          <span className="ml-2 text-app-text-muted font-normal">({p.matchType.replace(/_/g, ' ')})</span>
                        ) : null}
                      </button>
                    ))}
                    {otherFiltered.length > 0 && (
                      <div className="px-3 py-1.5 bg-app-surface border-b border-app-border text-xs font-medium text-app-text-muted sticky top-0">
                        {candidates.length > 0 ? 'All plates' : 'Plates'}
                      </div>
                    )}
                    {otherFiltered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={selectedPlateId === p.id}
                        onClick={() => {
                          setSelectedPlateId(p.id)
                          setResult(null)
                          setInferenceReport(null)
                          setError(null)
                        }}
                        className={`w-full px-4 py-2.5 text-left text-sm border-b border-app-border last:border-b-0 hover:bg-[rgb(var(--app-accent-muted))] focus:outline-none focus:bg-[rgb(var(--app-accent-muted))] ${
                          selectedPlateId === p.id ? 'bg-[rgb(var(--app-accent-muted))] font-medium' : ''
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </>
                )}
              </div>
              {csvFile && candidates.length > 1 && selectedPlateId == null && (
                <p className="text-xs text-amber-700 mt-1">Multiple plates match the filename. Search above and choose one.</p>
              )}
            </div>
            )}
            <div>
              <button
                type="button"
                onClick={handleValidate}
                disabled={loading || !canValidate}
                className="storage-btn-primary px-4 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Validating…' : 'Validate scan'}
              </button>
            </div>
          </div>
        </div>

        {result && (
          <>
            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-3">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <h2 className="storage-section-title m-0" data-testid="result-heading">
                Result: {result.plate.name}{result.inferredPlate ? ' (inferred)' : ''}
              </h2>
                <button
                  type="button"
                  onClick={() => downloadReport(result)}
                  className="storage-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium hover:border-[rgb(var(--app-accent))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:ring-offset-2"
                  aria-label="Download validation report as CSV"
                >
                  <svg className="w-4 h-4 shrink-0 text-[rgb(var(--app-accent))]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download report
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-2xl font-semibold text-app-text">{result.summary.matched}</div>
                  <div className="text-sm text-app-text-muted">Matched</div>
                </div>
                <div className="p-3 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-2xl font-semibold text-app-text">{result.summary.mismatch}</div>
                  <div className="text-sm text-app-text-muted">Mismatch</div>
                </div>
                <div className="p-3 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-2xl font-semibold text-app-text">{result.summary.missingInScan}</div>
                  <div className="text-sm text-app-text-muted">Missing in scan</div>
                </div>
                <div className="p-3 rounded-lg bg-app-surface border border-app-border">
                  <div className="text-2xl font-semibold text-app-text">{result.summary.extraInScan}</div>
                  <div className="text-sm text-app-text-muted">Extra in scan</div>
                </div>
              </div>
              {result.inferredPlate && (
                <p className="text-sm text-app-text-muted mb-2">Plate was inferred from the barcodes on the scan.</p>
              )}
              <div className="flex flex-wrap gap-4 text-sm">
                {result.summary.exhaustedCount > 0 && (
                  <span className="text-amber-700 font-medium">{result.summary.exhaustedCount} exhausted</span>
                )}
                {result.summary.taggedCount > 0 && (
                  <span className="text-app-text-muted">{result.summary.taggedCount} with tags</span>
                )}
              </div>
              <p className="mt-2 text-sm text-app-text-muted">
                {result.summary.mismatch === 0 && result.summary.missingInScan === 0 && result.summary.extraInScan === 0
                  ? 'Scan matches the database.'
                  : 'There are discrepancies. Review the well grid below.'}
              </p>
            </div>

            <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-4">
              <h2 className="storage-section-title mb-4">Well grid</h2>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Position</th>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Scanned</th>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Expected</th>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Scanned barcode from</th>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Status</th>
                      <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wellList.map((w) => (
                      <tr key={w.position} className="border-b border-app-border hover:bg-app-surface/50">
                        <td className="border border-app-border px-2 py-1 font-mono">{w.position}</td>
                        <td className="border border-app-border px-2 py-1 font-mono text-app-text">{w.scanBarcode ?? '—'}</td>
                        <td className="border border-app-border px-2 py-1 font-mono text-app-text">{w.expectedBarcode ?? '—'}</td>
                        <td className="border border-app-border px-2 py-1 text-app-text">
                          {w.scanBarcodeOrigin ? (
                            <span title={`Plate ID: ${w.scanBarcodeOrigin.plateId}`}>
                              {w.scanBarcodeOrigin.plateName}
                              {w.scanBarcodeOrigin.position ? `, ${w.scanBarcodeOrigin.position}` : ''}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="border border-app-border px-2 py-1">
                          <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusClass(w.status)}`}>
                            {statusLabel(w.status)}
                          </span>
                        </td>
                        <td className="border border-app-border px-2 py-1">
                          <div className="flex flex-wrap gap-1">
                            {w.exhausted && (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Exhausted</span>
                            )}
                            {w.tags.map((t) => (
                              <span key={t} className="inline-block px-2 py-0.5 rounded bg-app-surface text-app-text text-xs">
                                {t}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {inferenceReport && (
          <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-3" data-testid="inference-report">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <h2 className="storage-section-title m-0">Inference report – no single plate could be inferred</h2>
              <button
                type="button"
                onClick={() => downloadInferenceReport(inferenceReport)}
                className="storage-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium hover:border-[rgb(var(--app-accent))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--app-accent))] focus:ring-offset-2"
                aria-label="Download inference report as CSV"
              >
                <svg className="w-4 h-4 shrink-0 text-[rgb(var(--app-accent))]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Download report
              </button>
            </div>
            {inferenceReport.unknownBarcodes.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-app-text mb-2">
                  Unknown barcodes (not in database): {inferenceReport.unknownBarcodes.length}
                </h3>
                <p className="text-sm text-app-text-muted font-mono">
                  {inferenceReport.unknownBarcodes.join(', ')}
                </p>
              </div>
            )}
            {inferenceReport.plateBreakdown.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-app-text mb-2">Plate breakdown</h3>
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead>
                      <tr>
                        <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Plate name</th>
                        <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">Tubes on scan</th>
                        <th className="border border-app-border bg-app-surface px-2 py-1 text-left font-medium">In expected position</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inferenceReport.plateBreakdown.map((row) => (
                        <tr key={row.plateId} className="border-b border-app-border hover:bg-app-surface/50">
                          <td className="border border-app-border px-2 py-1 text-app-text">{row.plateName}</td>
                          <td className="border border-app-border px-2 py-1 font-mono">{row.tubeCount}</td>
                          <td className="border border-app-border px-2 py-1 font-mono">{row.inExpectedPositionCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {inferenceReport.unknownBarcodes.length === 0 && inferenceReport.plateBreakdown.length === 0 && (
              <p className="text-sm text-app-text-muted">No known barcodes or plates found in the scan.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
