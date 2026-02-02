import React, { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { qpcrExperimentsApi, scannerConfigurationsApi, type QpcrExperimentDetailResponse, type QpcrExperimentWell, type ScannerConfiguration } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useUser } from '../contexts/UserContext'

const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']
const COLS = 12

function wellPositionToKey(row: string, col: number): string {
  return `${row}${col.toString().padStart(2, '0')}`
}

function getWellLabel(well: QpcrExperimentWell | undefined): string {
  if (!well) return ''
  if (well.source?.type === 'subject') return well.source.name
  if (well.source?.type === 'control') {
    const density = well.standardDensity != null ? ` (${well.standardDensity})` : ''
    return `${well.source.name}${density}`
  }
  return well.barcode ?? ''
}

function getWellContentType(well: QpcrExperimentWell | undefined): 'standard' | 'unknown' | 'negative' | 'empty' {
  if (!well || !well.barcode) return 'empty'
  switch (well.contentType) {
    case 'standard':
      return 'standard'
    case 'negative':
      return 'negative'
    case 'unknown':
      return 'unknown'
    default:
      return 'unknown'
  }
}

const WELL_STYLES: Record<'standard' | 'unknown' | 'negative' | 'empty', string> = {
  standard: 'bg-amber-100 border-amber-400 text-amber-900',
  unknown: 'bg-sky-50 border-sky-300 text-sky-800',
  negative: 'bg-slate-100 border-slate-300 text-slate-600',
  empty: 'bg-gray-50 border-gray-200 text-gray-400',
}

export default function QpcrExperimentDetail() {
  const { id } = useParams<{ id: string }>()
  const { canWrite } = useUser()
  const [data, setData] = useState<QpcrExperimentDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [scannerConfigs, setScannerConfigs] = useState<ScannerConfiguration[]>([])
  const [selectedConfigId, setSelectedConfigId] = useState<string | null>(null)
  const [plateUploading, setPlateUploading] = useState(false)
  const [plateError, setPlateError] = useState<string | null>(null)
  const [resultsUploading, setResultsUploading] = useState(false)
  const [resultsError, setResultsError] = useState<string | null>(null)

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

  if (loading) {
    return <SkeletonDetailPage sections={1} />
  }

  if (error || !data) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">
          {error ?? 'Experiment not found'}
        </div>
        <Link to="/qpcr-experiments" className="text-blue-600 hover:underline">
          Back to qPCR experiments
        </Link>
      </div>
    )
  }

  const { experiment, wells } = data
  const wellMap = new Map<string, QpcrExperimentWell>()
  wells.forEach((w) => wellMap.set(w.wellPosition, w))

  const breadcrumbItems = [
    { label: 'qPCR Experiments', to: '/qpcr-experiments' },
    { label: experiment.name ?? `Experiment ${experiment.id}`, to: undefined },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs items={breadcrumbItems} />
      </div>

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {experiment.name ?? `qPCR Experiment ${experiment.id}`}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Format: {experiment.templateFormat === 'biorad' ? 'Biorad CFX' : 'QuantStudio'} · Status: {experiment.status}
            {experiment.plateBarcode && ` · Plate: ${experiment.plateBarcode}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a
            href={`/api/qpcr-experiments/${experiment.id}/template?format=biorad`}
            download={`qpcr-experiment-${experiment.id}-biorad-template.csv`}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Download Biorad CSV
          </a>
          <a
            href={`/api/qpcr-experiments/${experiment.id}/template?format=quant_studio`}
            download={`qpcr-experiment-${experiment.id}-quantstudio-template.tsv`}
            className="px-3 py-1.5 text-sm font-medium rounded-md border border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          >
            Download QuantStudio TSV
          </a>
        </div>
      </div>

      {canWrite && (
        <>
          <section className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Upload plate layout (CSV)</h2>
            <p className="text-sm text-gray-600 mb-3">Upload a CSV with barcode and position columns. Use the same scanner configuration as for container move.</p>
            {plateError && <p className="text-sm text-red-600 mb-2">{plateError}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Scanner config</label>
                <select
                  value={selectedConfigId ?? ''}
                  onChange={(e) => setSelectedConfigId(e.target.value || null)}
                  className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                >
                  {scannerConfigs.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <input
                  type="file"
                  accept=".csv"
                  className="text-sm"
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
                      const msg = err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { error?: string } } }).response?.data?.error : 'Upload failed'
                      setPlateError(msg ?? 'Upload failed')
                    } finally {
                      setPlateUploading(false)
                      e.target.value = ''
                    }
                  }}
                  disabled={plateUploading || !selectedConfigId}
                />
              </div>
              {plateUploading && <span className="text-sm text-gray-500">Uploading…</span>}
            </div>
          </section>
          <section className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Upload results</h2>
            <p className="text-sm text-gray-600 mb-3">Upload Biorad CSV or QuantStudio XLS result file.</p>
            {resultsError && <p className="text-sm text-red-600 mb-2">{resultsError}</p>}
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Instrument</label>
                <select id="instrument-type" className="border border-gray-300 rounded px-2 py-1.5 text-sm">
                  <option value="Biorad_CFX">Biorad CFX (CSV)</option>
                  <option value="QuantStudio">QuantStudio (XLS)</option>
                </select>
              </div>
              <div>
                <input
                  type="file"
                  accept=".csv,.xls,.xlsx"
                  className="text-sm"
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file || !id) return
                    setResultsError(null)
                    setResultsUploading(true)
                    try {
                      const buf = await file.arrayBuffer()
                      const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)))
                      const instrumentType = (document.getElementById('instrument-type') as HTMLSelectElement)?.value as 'Biorad_CFX' | 'QuantStudio'
                      await qpcrExperimentsApi.uploadResults(parseInt(id), { fileContent: base64, fileName: file.name, instrumentType })
                      loadData()
                    } catch (err: unknown) {
                      const msg = err && typeof err === 'object' && 'response' in err ? (err as { response?: { data?: { error?: string } } }).response?.data?.error : 'Upload failed'
                      setResultsError(msg ?? 'Upload failed')
                    } finally {
                      setResultsUploading(false)
                      e.target.value = ''
                    }
                  }}
                  disabled={resultsUploading}
                />
              </div>
              {resultsUploading && <span className="text-sm text-gray-500">Uploading…</span>}
            </div>
          </section>
        </>
      )}

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Plate layout (96-well)</h2>
        <div className="inline-block border border-gray-300 rounded-lg p-2 bg-white">
          <div className="grid gap-0.5" style={{ gridTemplateColumns: `auto repeat(${COLS}, minmax(2rem, 2rem))` }}>
            <div className="w-6" />
            {Array.from({ length: COLS }, (_, i) => (
              <div key={i} className="text-center text-[10px] font-medium text-gray-500">
                {(i + 1).toString().padStart(2, '0')}
              </div>
            ))}
            {ROWS.map((row) => (
              <React.Fragment key={row}>
                <div className="text-[10px] font-medium text-gray-500 flex items-center justify-center pr-1">
                  {row}
                </div>
                {Array.from({ length: COLS }, (_, colIdx) => {
                  const pos = wellPositionToKey(row, colIdx + 1)
                  const well = wellMap.get(pos)
                  const contentType = getWellContentType(well)
                  const label = getWellLabel(well)
                  return (
                    <div
                      key={pos}
                      className={`min-w-[2rem] min-h-[2rem] border rounded flex items-center justify-center text-[10px] font-medium truncate px-0.5 ${WELL_STYLES[contentType]}`}
                      title={well ? `${pos}: ${label || well.barcode || 'empty'}` : pos}
                    >
                      {label ? (label.length > 4 ? `${label.slice(0, 3)}…` : label) : well?.barcode ? '…' : ''}
                    </div>
                  )
                })}
              </React.Fragment>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap gap-4 mt-3 text-xs">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-amber-400 bg-amber-100" /> Standard
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-sky-300 bg-sky-50" /> Unknown (study sample)
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-slate-300 bg-slate-100" /> Negative
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded border border-gray-200 bg-gray-50" /> Empty
          </span>
        </div>
      </section>
    </div>
  )
}
