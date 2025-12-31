import { useState, useCallback, useEffect } from 'react'
import { exportApi, exportConfigurationsApi, type ExportConfiguration } from '../lib/api'

export default function BarcodeExport() {
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [barcodes, setBarcodes] = useState<string[]>([])
  const [csvError, setCsvError] = useState<string | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'csv' | 'xlsx' | 'json'>('csv')
  const [error, setError] = useState<string | null>(null)
  const [exportSummary, setExportSummary] = useState<{
    total_containers: number
    barcodes_found: string[]
    barcodes_not_found: string[]
  } | null>(null)
  const [summaryExpanded, setSummaryExpanded] = useState(false)
  const [exportConfigurations, setExportConfigurations] = useState<ExportConfiguration[]>([])
  const [selectedConfigName, setSelectedConfigName] = useState<string>('')
  const [loadingConfigs, setLoadingConfigs] = useState(true)

  useEffect(() => {
    loadExportConfigurations()
  }, [])

  const loadExportConfigurations = async () => {
    try {
      setLoadingConfigs(true)
      const res = await exportConfigurationsApi.getAll()
      if (res.data && res.data.configurations) {
        setExportConfigurations(res.data.configurations)
        // Set default config if available
        const defaultConfig = res.data.configurations.find(c => c.isDefault)
        if (defaultConfig) {
          setSelectedConfigName(defaultConfig.name)
        } else if (res.data.configurations.length > 0) {
          setSelectedConfigName(res.data.configurations[0].name)
        }
      }
    } catch (err: any) {
      console.error('Failed to load export configurations:', err)
    } finally {
      setLoadingConfigs(false)
    }
  }

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
        config_name: selectedConfigName || undefined,
      })

      const summary = response.data.summary
      setExportSummary(summary)

      // Handle file download
      let blob: Blob
      let filename: string

      if (typeof response.data.data === 'string') {
        // Base64 encoded
        const binaryString = atob(response.data.data)
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
        blob = new Blob([JSON.stringify(response.data.data, null, 2)], { type: 'application/json' })
      }
      
      filename = response.data.filename || `barcode_export_${Date.now()}.${exportFormat}`
      
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)

      // Show inline summary
      if (summary) {
        setSummaryExpanded(true)
      }
    } catch (error: any) {
      console.error('Export failed:', error)
      setError(error.response?.data?.error || 'Export failed')
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-4">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Micronix Barcode Export</h1>
        <p className="text-sm text-gray-600 mt-1">
          Upload a CSV file containing micronix tube barcodes to export linked subject and specimen information.
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-lg shadow p-6 space-y-6">
        {/* CSV Upload Section */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
            className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          />
          <p className="mt-1 text-xs text-gray-500">
            CSV should contain a "barcode" column with micronix tube barcodes (one per row)
          </p>
          {csvError && (
            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {csvError}
            </div>
          )}
          {barcodes.length > 0 && (
            <div className="mt-2 p-2 bg-green-50 border border-green-200 rounded text-green-700 text-sm">
              Successfully parsed {barcodes.length} barcode{barcodes.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Export Configuration Selector */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Export Configuration
          </label>
          {loadingConfigs ? (
            <div className="text-sm text-gray-500">Loading configurations...</div>
          ) : (
            <select
              value={selectedConfigName}
              onChange={(e) => setSelectedConfigName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Default (all columns)</option>
              {exportConfigurations.map(config => (
                <option key={config.name} value={config.name}>
                  {config.name} {config.isDefault && '(Default)'}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-gray-500">
            Select which columns to include in the export. Configure options in Settings.
          </p>
        </div>

        {/* Export Format Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
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
                  className="text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700 uppercase">{format}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Export Summary */}
        {exportSummary && (
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => setSummaryExpanded(!summaryExpanded)}
              className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 flex items-center justify-between transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-5 h-5 text-green-600 transition-transform duration-300 ${
                    summaryExpanded ? 'rotate-0' : 'rotate-180'
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-sm font-medium text-gray-900">Export Summary</span>
                <span className="text-xs text-gray-500 ml-2">
                  ({exportSummary.total_containers.toLocaleString()} containers)
                </span>
              </div>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform duration-300 ${
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
              <div className="px-4 py-4 space-y-4 bg-white">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">Total Containers Exported:</span>
                    <span className="text-2xl font-bold text-blue-600">
                      {exportSummary.total_containers.toLocaleString()}
                    </span>
                  </div>
                </div>

                {exportSummary.barcodes_found.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-2">
                      Barcodes Found ({exportSummary.barcodes_found.length})
                    </h4>
                    <div className="max-h-48 overflow-y-auto border border-gray-200 rounded p-2">
                      {exportSummary.barcodes_found.map((barcode, idx) => (
                        <div key={idx} className="text-sm text-gray-700 py-1">
                          {barcode}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {exportSummary.barcodes_not_found.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-red-700 mb-2">
                      Barcodes Not Found ({exportSummary.barcodes_not_found.length})
                    </h4>
                    <div className="max-h-32 overflow-y-auto border border-red-200 rounded p-2 bg-red-50">
                      {exportSummary.barcodes_not_found.map((barcode, idx) => (
                        <div key={idx} className="text-sm text-red-700 py-1">
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
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {exporting ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>
  )
}

