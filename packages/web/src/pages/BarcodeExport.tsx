import { useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { exportApi } from '../lib/api/export';
import { useExportConfigurations } from '../hooks/useExportWorkflow'
import { PageError } from '../ui'
import { formatLocalDateTime } from '../lib/date-utils'
import {
  formatExportConfigId,
  getExportColumnsForConfigId,
} from '../lib/export-config-selection'
import '../styles/storage.css'

export default function BarcodeExport() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv')
  const [error, setError] = useState<string | null>(null)
  
  // CSV export options
  const [csvDelimiter, setCsvDelimiter] = useState<',' | ';' | '\t'>(',')
  const [csvBOM, setCsvBOM] = useState<boolean>(true)
  const [csvLineEnding, setCsvLineEnding] = useState<'LF' | 'CRLF'>('CRLF')
  const [exportSummary, setExportSummary] = useState<{
    total_containers: number
    barcodes_found: string[]
    barcodes_not_found: string[]
  } | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [focusedConfigIndex, setFocusedConfigIndex] = useState<number | null>(null)
  const {
    configurations: exportConfigurations,
    selectedConfigId,
    setSelectedConfigId,
    loading: loadingConfigs,
    error: configLoadError,
    loadConfigurations,
  } = useExportConfigurations()

  const parseCSV = useCallback((file: File) => {
    return new Promise<string[]>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        try {
          const text = e.target?.result as string
          if (!text) {
            reject(new Error('File is empty'))
            return
          }

          const lines = text.split('\n').filter(line => line.trim())
          if (lines.length === 0) {
            reject(new Error('CSV file is empty'))
            return
          }

          // Parse header
          const headerLine = lines[0].trim()
          const headers = headerLine.split(',').map(h => h.trim().toLowerCase().replace(/^"|"$/g, ''))
          
          // Find barcode column index
          const barcodeIdx = headers.findIndex(h => h === 'barcode')
          if (barcodeIdx === -1) {
            reject(new Error('CSV must contain a "barcode" column'))
            return
          }

          // Parse data rows
          const barcodeList: string[] = []

          for (let i = 1; i < lines.length; i++) {
            const line = lines[i].trim()
            if (!line) continue

            // Simple CSV parsing (handles quoted values)
            const values: string[] = []
            let current = ''
            let inQuotes = false
            
            for (let j = 0; j < line.length; j++) {
              const char = line[j]
              if (char === '"') {
                if (inQuotes && line[j + 1] === '"') {
                  current += '"'
                  j++
                } else {
                  inQuotes = !inQuotes
                }
              } else if (char === ',' && !inQuotes) {
                values.push(current.trim())
                current = ''
              } else {
                current += char
              }
            }
            values.push(current.trim())

            const barcode = values[barcodeIdx]?.replace(/^"|"$/g, '').trim()
            if (barcode) {
              barcodeList.push(barcode)
            }
          }

          if (barcodeList.length === 0) {
            reject(new Error('No valid barcodes found in CSV'))
            return
          }

          resolve(barcodeList)
        } catch (err: any) {
          reject(new Error(`Failed to parse CSV: ${err.message}`))
        }
      }
      reader.onerror = () => reject(new Error('Failed to read file'))
      reader.readAsText(file)
    })
  }, [])

  const handleCSVUpload = useCallback(async (file: File) => {
    try {
      setCsvError(null)
      setExportSummary(null)
      setSummaryExpanded(false)
      const data = await parseCSV(file)
      setBarcodes(data)
      setCsvFile(file)
    } catch (err: any) {
      setCsvError(err.message)
      setBarcodes([])
      setCsvFile(null)
    }
  }, [parseCSV])

  const handleExport = async () => {
    if (barcodes.length === 0) {
      setError('Please upload a CSV file with barcodes first')
      return
    }

    try {
      setExporting(true)
      setError(null)
      setExportSummary(null)

      const response = await exportApi.containersByBarcodes({
        barcodes,
        format: exportFormat,
        columns: getExportColumnsForConfigId(exportConfigurations, selectedConfigId),
        csv_delimiter: exportFormat === 'csv' ? csvDelimiter : undefined,
        csv_bom: exportFormat === 'csv' ? csvBOM : undefined,
        csv_line_ending: exportFormat === 'csv' ? csvLineEnding : undefined,
      })

      const summary = response.summary
      setExportSummary(summary)

      // Handle file download
      let blob: Blob
      let filename: string

      if (typeof response.data === 'string') {
        // Base64 encoded
        const binaryString = atob(response.data)
        const bytes = new Uint8Array(binaryString.length)
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i)
        }
        const mimeType = exportFormat === 'xlsx' 
          ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
          : 'text/csv'
        blob = new Blob([bytes], { type: mimeType })
      } else {
        // JSON format
        blob = new Blob([JSON.stringify(response.data, null, 2)], { type: 'application/json' })
      }
      
      filename = response.filename || `barcode_export_${formatLocalDateTime()}.${exportFormat}`
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Show inline summary
      setSummaryExpanded(true)
    } catch (error: any) {
      console.error('Export failed:', error)
      setError(error.response?.data?.error || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-2">Micronix Barcode Export</h1>
          <p className="text-sm mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Upload a CSV file containing micronix tube barcodes to export linked subject and specimen information.
          </p>
        </div>

        {configLoadError && (
          <PageError
            title="Could not load export configurations"
            message={configLoadError}
            onRetry={() => void loadConfigurations()}
          />
        )}

        {error && (
          <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
            {error}
          </div>
        )}

        <div className="storage-card p-6 space-y-6 storage-reveal storage-reveal-1">
        {/* CSV Upload Section */}
        <div>
          <label className="block text-sm font-medium text-app-text mb-2">
            Upload CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) {
                handleCSVUpload(file)
              }
            }}
            className="file-input-accent"
          />
          <p className="mt-1 text-xs text-app-text-muted">
            CSV should contain a "barcode" column with micronix tube barcodes (one per row)
          </p>
          {csvError && (
            <div className="mt-2 p-2 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
              {csvError}
            </div>
          )}
          {barcodes.length > 0 && (
            <div className="mt-2 p-2 bg-app-trend-up/10 border border-app-trend-up/30 rounded text-app-trend-up text-sm">
              Successfully parsed {barcodes.length} barcode{barcodes.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Export Configuration Selector */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-app-text">
              Export Configuration
            </label>
            <Link
              to="/settings?category=data-management&section=export-configurations"
              className="storage-link text-xs hover:underline flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage in Settings
            </Link>
          </div>
          {loadingConfigs ? (
            <div className="space-y-1.5">
              {[1, 2, 3].map(i => (
                <div key={i} className="w-full h-10 bg-app-surface rounded border border-app-border animate-pulse" />
              ))}
            </div>
          ) : exportConfigurations.length === 0 ? (
            <div className="text-sm p-3 bg-app-surface rounded border border-app-border">
              <p className="text-app-text mb-2">No export configurations available.</p>
              <Link
                to="/settings?category=data-management&section=export-configurations"
                className="storage-link font-medium inline-flex items-center gap-1"
              >
                Create one in Settings
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          ) : (
            <div 
              className="space-y-1.5"
              role="radiogroup"
              aria-label="Export configuration"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                  e.preventDefault()
                  const currentIndex = focusedConfigIndex ?? exportConfigurations.findIndex(c => formatExportConfigId(c.source!, c.name) === selectedConfigId)
                  let newIndex: number
                  if (e.key === 'ArrowDown') {
                    newIndex = currentIndex < exportConfigurations.length - 1 ? currentIndex + 1 : 0
                  } else {
                    newIndex = currentIndex > 0 ? currentIndex - 1 : exportConfigurations.length - 1
                  }
                  setFocusedConfigIndex(newIndex)
                  const newConfig = exportConfigurations[newIndex]
                  setSelectedConfigId(formatExportConfigId(newConfig.source!, newConfig.name))
                  const button = e.currentTarget.children[newIndex] as HTMLElement
                  button.focus()
                } else if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  if (focusedConfigIndex !== null) {
                    const focusedConfig = exportConfigurations[focusedConfigIndex]
                    setSelectedConfigId(formatExportConfigId(focusedConfig.source!, focusedConfig.name))
                  }
                }
              }}
            >
              {exportConfigurations.map((config, index) => {
                const configId = formatExportConfigId(config.source!, config.name)
                const isSelected = configId === selectedConfigId
                const isFocused = focusedConfigIndex === index
                return (
                  <button
                    key={configId} // Use unique ID to prevent duplicate keys (fixes Bug 2)
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${config.name}, ${config.source === 'personal' ? 'Personal' : 'Shared'} configuration, ${config.columns.length} columns${config.isDefault ? ', Default' : ''}`}
                    onClick={() => {
                      setSelectedConfigId(configId)
                      setFocusedConfigIndex(index)
                    }}
                    onFocus={() => setFocusedConfigIndex(index)}
                    onBlur={() => {
                      // Only clear focus if not selected (selected items should keep focus styling)
                      if (configId !== selectedConfigId) {
                        setFocusedConfigIndex(null)
                      }
                    }}
                    onMouseEnter={() => setFocusedConfigIndex(index)}
                    onMouseLeave={() => {
                      // Only clear focus if not selected (selected items should keep focus styling)
                      if (configId !== selectedConfigId) {
                        setFocusedConfigIndex(null)
                      }
                    }}
                    className={`w-full text-left px-3 py-2 border rounded transition-all focus:outline-none focus:ring-2 focus:ring-offset-1 ${
                      isSelected ? 'shadow-sm' : 'border-app-border'
                    }`}
                    style={isSelected ? { borderColor: 'rgb(var(--app-accent))', background: 'rgb(var(--app-accent-muted))' } : isFocused ? { borderColor: 'rgb(var(--app-accent)/0.5)', background: 'rgb(var(--app-accent-muted)/0.7)' } : undefined}
                    title={config.columns.length > 0 ? `Columns: ${config.columns.slice(0, 5).join(', ')}${config.columns.length > 5 ? `, +${config.columns.length - 5} more` : ''}` : 'No columns'}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <span className="font-medium text-sm truncate" style={isSelected ? { color: 'rgb(var(--app-accent-hover))' } : { color: 'rgb(var(--app-text))' }}>
                          {config.name}
                        </span>
                        {config.isDefault && (
                          <span className="px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0" style={{ background: 'rgb(var(--app-accent-muted))', color: 'rgb(var(--app-accent-hover))' }} aria-label="Default configuration">
                            Default
                          </span>
                        )}
                        <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                          config.source === 'personal'
                            ? 'bg-purple-100 text-purple-700'
                            : 'bg-app-surface text-app-text'
                        }`} aria-label={config.source === 'personal' ? 'Personal configuration' : 'Shared configuration'}>
                          {config.source === 'personal' ? 'Personal' : 'Shared'}
                        </span>
                        <span className="text-xs text-app-text-muted flex-shrink-0" aria-label={`${config.columns.length} columns`}>
                          {config.columns.length} cols
                        </span>
                      </div>
                      {isSelected && (
                        <svg className="w-4 h-4 flex-shrink-0" style={{ color: 'rgb(var(--app-accent-hover))' }} fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
          <p className="mt-2 text-xs text-app-text-muted">
            Select which columns to include in the export. Configure options in Settings.
          </p>
        </div>

        {/* Export Format Selection */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-app-text mb-2">
            Export Format
          </label>
          <div className="flex gap-4">
            {(['csv', 'xlsx', 'json'] as const).map(format => (
              <label key={format} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="radio"
                  name="exportFormat"
                  value={format}
                  checked={exportFormat === format}
                  onChange={() => setExportFormat(format)}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text uppercase">{format}</span>
              </label>
            ))}
          </div>
        </div>

        {/* CSV Options - Only show when CSV format is selected */}
        {exportFormat === 'csv' && (
          <div className="mb-6 p-4 bg-app-surface rounded-lg border border-app-border">
            <h3 className="text-sm font-medium text-app-text mb-3">CSV Options</h3>
            
            {/* Delimiter Selection */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-app-text mb-2">
                Delimiter
              </label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="csvDelimiter"
                    value=","
                    checked={csvDelimiter === ','}
                    onChange={() => setCsvDelimiter(',')}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">Comma (,)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="csvDelimiter"
                    value=";"
                    checked={csvDelimiter === ';'}
                    onChange={() => setCsvDelimiter(';')}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">Semicolon (;)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="csvDelimiter"
                    value="\t"
                    checked={csvDelimiter === '\t'}
                    onChange={() => setCsvDelimiter('\t')}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">Tab</span>
                </label>
              </div>
            </div>

            {/* UTF-8 BOM Toggle */}
            <div className="mb-4">
              <label className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={csvBOM}
                  onChange={(e) => setCsvBOM(e.target.checked)}
                  className="text-app-accent focus:ring-app-accent"
                />
                <span className="text-sm text-app-text">Include UTF-8 BOM (recommended for Excel)</span>
              </label>
              <p className="mt-1 text-xs text-app-text-muted ml-6">
                Helps Excel recognize UTF-8 encoding automatically
              </p>
            </div>

            {/* Line Ending Selection */}
            <div>
              <label className="block text-sm font-medium text-app-text mb-2">
                Line Ending
              </label>
              <div className="flex gap-4">
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="csvLineEnding"
                    value="CRLF"
                    checked={csvLineEnding === 'CRLF'}
                    onChange={() => setCsvLineEnding('CRLF')}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">CRLF (Windows, recommended for Excel)</span>
                </label>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="radio"
                    name="csvLineEnding"
                    value="LF"
                    checked={csvLineEnding === 'LF'}
                    onChange={() => setCsvLineEnding('LF')}
                    className="text-app-accent focus:ring-app-accent"
                  />
                  <span className="text-sm text-app-text">LF (Unix)</span>
                </label>
              </div>
            </div>
          </div>
        )}

        {/* Export Summary */}
        {exportSummary && (
          <div className="border border-app-border rounded-lg overflow-hidden">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full px-4 py-3 bg-app-surface hover:bg-app-surface flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-5 h-5 text-app-trend-up transition-transform duration-300 ${
                    summaryExpanded ? 'rotate-0' : 'rotate-180'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-app-text">Export Summary</span>
                <span className="text-xs text-app-text-muted ml-2">
                  ({exportSummary.total_containers.toLocaleString()} containers)
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-app-text-muted transition-transform duration-300 ${
                  summaryExpanded ? 'rotate-180' : 'rotate-0'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <div
              className={`overflow-hidden transition-all duration-300 ${
                summaryExpanded ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0'
              }`}
            >
              <div className="px-4 py-4 space-y-4 bg-app-card">
                <div className="p-4 rounded-lg" style={{ background: 'rgb(var(--app-accent-muted))' }}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>Total Containers Exported:</span>
                    <span className="text-2xl font-bold" style={{ color: 'rgb(var(--app-accent-hover))' }}>
                      {exportSummary.total_containers.toLocaleString()}
                    </span>
                  </div>
                </div>

                {exportSummary.barcodes_found.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-app-text mb-2">
                      Barcodes Found ({exportSummary.barcodes_found.length})
                    </h4>
                    <div className="max-h-48 overflow-y-auto border border-app-border rounded p-2">
                      {exportSummary.barcodes_found.map((barcode, idx) => (
                        <div key={idx} className="text-sm text-app-text py-1">
                          {barcode}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {exportSummary.barcodes_not_found.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-app-trend-down mb-2">
                      Barcodes Not Found ({exportSummary.barcodes_not_found.length})
                    </h4>
                    <div className="max-h-32 overflow-y-auto border border-app-trend-down rounded p-2 bg-app-trend-down/10">
                      {exportSummary.barcodes_not_found.map((barcode, idx) => (
                        <div key={idx} className="text-sm text-app-trend-down py-1">
                          {barcode}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        <div className="flex justify-end">
          <button
            onClick={handleExport}
            disabled={exporting || barcodes.length === 0}
            className="storage-btn-primary px-6 py-2 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
        </div>
      </div>
    </div>
  )
}

