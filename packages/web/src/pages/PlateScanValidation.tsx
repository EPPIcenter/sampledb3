import { useState, useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  collectionsApi,
  scannerConfigurationsApi,
  type ScannerConfiguration,
  type ValidatePlateScanResult,
} from '../lib/api'
import { extractPlateStemFromFilename, findPlateCandidatesFromStem } from '../lib/plate-filename-match'
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
      return 'bg-green-100 text-green-800 border-green-200'
    case 'mismatch':
      return 'bg-red-100 text-red-800 border-red-200'
    case 'missing_in_scan':
      return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'extra_in_scan':
      return 'bg-sky-100 text-sky-800 border-sky-200'
    default:
      return 'bg-gray-100 text-gray-700'
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

export default function PlateScanValidation() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvText, setCsvText] = useState<string>('')
  const [scannerConfigurations, setScannerConfigurations] = useState<ScannerConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [plates, setPlates] = useState<Array<{ id: number; name: string }>>([])
  const [selectedPlateId, setSelectedPlateId] = useState<number | null>(null)
  const [plateSearch, setPlateSearch] = useState('')
  const [candidates, setCandidates] = useState<Array<{ id: number; name: string; matchType: string }>>([])
  const [result, setResult] = useState<ValidatePlateScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      const configsData = (configsRes.data as { configurations?: ScannerConfiguration[] } & { value?: { configurations?: ScannerConfiguration[] } })?.value ?? configsRes.data
      const configs = (configsData as { configurations?: ScannerConfiguration[] }).configurations ?? []
      setScannerConfigurations(configs)
      const defaultConfig = configs.find((c: ScannerConfiguration) => c.isDefault === true)
      setSelectedConfigId(defaultConfig?.id ?? configs[0]?.id ?? null)
    }).catch((err) => {
      console.error('Failed to load plates or scanner configs:', err)
      setError('Failed to load plate list or scanner configurations.')
    })
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    setResult(null)
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
    const stem = extractPlateStemFromFilename(file.name)
    const list = plates.map((p) => ({ id: p.id, name: p.name }))
    const cands = findPlateCandidatesFromStem(stem, list)
    setCandidates(cands.map((c) => ({ id: c.id, name: c.name, matchType: c.matchType })))
    if (cands.length === 1) {
      setSelectedPlateId(cands[0].id)
    } else {
      setSelectedPlateId(null)
    }
  }

  const handleValidate = async () => {
    if (!csvText || selectedPlateId == null || !selectedConfigId) {
      setError('Please select a CSV file, a plate, and a scanner configuration.')
      return
    }
    setLoading(true)
    setError(null)
    setResult(null)
    try {
      const res = await collectionsApi.validatePlateScan({
        csvText,
        plateId: selectedPlateId,
        scannerConfigurationId: selectedConfigId,
      })
      setResult(res.data)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : 'Validation failed.'
      setError(message ?? 'Validation failed.')
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

  return (
    <div className="storage-page min-h-screen">
      <div className="max-w-6xl mx-auto px-4 py-8 relative z-10">
        <div className="mb-6 storage-reveal storage-reveal-1">
          <nav className="text-sm text-gray-600 mb-2">
            <Link to="/" className="storage-link hover:underline">Dashboard</Link>
            <span className="mx-2">/</span>
            <span className="text-gray-800">Validate Plate Scan</span>
          </nav>
          <h1 className="text-2xl font-bold text-gray-900">Validate Plate Scan</h1>
          <p className="text-gray-600 mt-1">
            Upload a scanned plate CSV and compare it to a micronix plate in the database. The filename can include dates or times; the system will suggest a plate from the name.
          </p>
        </div>

        {error && (
          <div className="storage-card p-4 mb-6 border-red-200 bg-red-50 text-red-800 storage-reveal storage-reveal-2">
            {error}
          </div>
        )}

        <div className="storage-card p-6 mb-6 storage-reveal storage-reveal-2">
          <h2 className="storage-section-title mb-4">Upload and configure</h2>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Scanner configuration</label>
              <select
                value={selectedConfigId ?? ''}
                onChange={(e) => setSelectedConfigId(e.target.value || null)}
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[rgb(var(--dashboard-accent))] focus:border-[rgb(var(--dashboard-accent))]"
              >
                {scannerConfigurations.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.isDefault ? ' (Default)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CSV file</label>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="block w-full max-w-md text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded file:border file:border-gray-300 file:bg-white file:font-medium file:text-gray-700 hover:file:bg-gray-50"
              />
              {csvFile && (
                <p className="text-sm text-gray-500 mt-1">
                  {csvFile.name}
                  {candidates.length > 0 && (
                    <span className="ml-2">
                      — {candidates.length} plate{candidates.length !== 1 ? 's' : ''} suggested from filename
                    </span>
                  )}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Plate</label>
              {selectedPlate ? (
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-gray-800">
                    Selected: <span className="font-semibold">{selectedPlate.name}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPlateId(null)}
                    className="text-sm text-[rgb(var(--dashboard-accent))] hover:underline focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dashboard-accent))] rounded"
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
                className="w-full max-w-md px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[rgb(var(--dashboard-accent))] focus:border-[rgb(var(--dashboard-accent))] mb-2"
              />
              <div
                role="listbox"
                aria-label="Plate list"
                className="w-full max-w-md border border-gray-300 rounded-lg overflow-hidden max-h-[240px] overflow-y-auto bg-white"
              >
                {suggestedFiltered.length === 0 && otherFiltered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-gray-500">
                    {plates.length === 0 ? 'No plates in database.' : 'No plates match your search.'}
                  </div>
                ) : (
                  <>
                    {suggestedFiltered.length > 0 && (
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 sticky top-0">
                        Suggested from filename
                      </div>
                    )}
                    {suggestedFiltered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={selectedPlateId === p.id}
                        onClick={() => setSelectedPlateId(p.id)}
                        className={`w-full px-4 py-2.5 text-left text-sm border-b border-gray-100 last:border-b-0 hover:bg-[rgb(var(--dashboard-accent-muted))] focus:outline-none focus:bg-[rgb(var(--dashboard-accent-muted))] ${
                          selectedPlateId === p.id ? 'bg-[rgb(var(--dashboard-accent-muted))] font-medium' : ''
                        }`}
                      >
                        {p.name}
                        {p.matchType ? (
                          <span className="ml-2 text-gray-500 font-normal">({p.matchType.replace(/_/g, ' ')})</span>
                        ) : null}
                      </button>
                    ))}
                    {otherFiltered.length > 0 && (
                      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-200 text-xs font-medium text-gray-600 sticky top-0">
                        {candidates.length > 0 ? 'All plates' : 'Plates'}
                      </div>
                    )}
                    {otherFiltered.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        role="option"
                        aria-selected={selectedPlateId === p.id}
                        onClick={() => setSelectedPlateId(p.id)}
                        className={`w-full px-4 py-2.5 text-left text-sm border-b border-gray-100 last:border-b-0 hover:bg-[rgb(var(--dashboard-accent-muted))] focus:outline-none focus:bg-[rgb(var(--dashboard-accent-muted))] ${
                          selectedPlateId === p.id ? 'bg-[rgb(var(--dashboard-accent-muted))] font-medium' : ''
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
            <div>
              <button
                type="button"
                onClick={handleValidate}
                disabled={loading || !csvText || selectedPlateId == null || !selectedConfigId}
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
                <h2 className="storage-section-title m-0">Result: {result.plate.name}</h2>
                <button
                  type="button"
                  onClick={() => downloadReport(result)}
                  className="storage-btn-secondary inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium hover:border-[rgb(var(--dashboard-accent))] focus:outline-none focus:ring-2 focus:ring-[rgb(var(--dashboard-accent))] focus:ring-offset-2"
                  aria-label="Download validation report as CSV"
                >
                  <svg className="w-4 h-4 shrink-0 text-[rgb(var(--dashboard-accent))]" aria-hidden fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download report
                </button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{result.summary.matched}</div>
                  <div className="text-sm text-gray-600">Matched</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{result.summary.mismatch}</div>
                  <div className="text-sm text-gray-600">Mismatch</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{result.summary.missingInScan}</div>
                  <div className="text-sm text-gray-600">Missing in scan</div>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                  <div className="text-2xl font-semibold text-gray-900">{result.summary.extraInScan}</div>
                  <div className="text-sm text-gray-600">Extra in scan</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {result.summary.exhaustedCount > 0 && (
                  <span className="text-amber-700 font-medium">{result.summary.exhaustedCount} exhausted</span>
                )}
                {result.summary.taggedCount > 0 && (
                  <span className="text-gray-600">{result.summary.taggedCount} with tags</span>
                )}
              </div>
              <p className="mt-2 text-sm text-gray-600">
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
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Position</th>
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Scanned</th>
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Expected</th>
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Scanned barcode from</th>
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Status</th>
                      <th className="border border-gray-200 bg-gray-50 px-2 py-1 text-left font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wellList.map((w) => (
                      <tr key={w.position} className="border-b border-gray-100 hover:bg-gray-50/50">
                        <td className="border border-gray-100 px-2 py-1 font-mono">{w.position}</td>
                        <td className="border border-gray-100 px-2 py-1 font-mono text-gray-700">{w.scanBarcode ?? '—'}</td>
                        <td className="border border-gray-100 px-2 py-1 font-mono text-gray-700">{w.expectedBarcode ?? '—'}</td>
                        <td className="border border-gray-100 px-2 py-1 text-gray-700">
                          {w.scanBarcodeOrigin ? (
                            <span title={`Plate ID: ${w.scanBarcodeOrigin.plateId}`}>
                              {w.scanBarcodeOrigin.plateName}
                              {w.scanBarcodeOrigin.position ? `, ${w.scanBarcodeOrigin.position}` : ''}
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="border border-gray-100 px-2 py-1">
                          <span className={`inline-block px-2 py-0.5 rounded border text-xs font-medium ${statusClass(w.status)}`}>
                            {statusLabel(w.status)}
                          </span>
                        </td>
                        <td className="border border-gray-100 px-2 py-1">
                          <div className="flex flex-wrap gap-1">
                            {w.exhausted && (
                              <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-xs">Exhausted</span>
                            )}
                            {w.tags.map((t) => (
                              <span key={t} className="inline-block px-2 py-0.5 rounded bg-gray-200 text-gray-700 text-xs">
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
      </div>
    </div>
  )
}
