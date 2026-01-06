import { useState, useRef } from 'react'
import { derivationsApi, type DerivationCsvImportResultRow } from '../lib/api'
import { useNavigate } from 'react-router-dom'

export default function DerivationsImport() {
  const navigate = useNavigate()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [csvContent, setCsvContent] = useState<string>('')
  const [dryRun, setDryRun] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [results, setResults] = useState<DerivationCsvImportResultRow[] | null>(null)

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      setCsvContent(text)
      setError(null)
      setResults(null)
    }
    reader.onerror = () => {
      setError('Failed to read file')
    }
    reader.readAsText(file)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!csvContent.trim()) {
      setError('Please select a CSV file')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await derivationsApi.importCsv(csvContent, dryRun)
      setResults(response.data.rows || [])
      
      if (!dryRun) {
        // If not dry run, show success message
        setTimeout(() => {
          navigate('/derivations')
        }, 2000)
      }
    } catch (err: any) {
      console.error('Failed to import derivations:', err)
      setError(err.response?.data?.error || err.response?.data?.details || 'Failed to import derivations')
    } finally {
      setLoading(false)
    }
  }

  const downloadTemplate = () => {
    const template = `parent_container_barcode,parent_container_type,parent_box_barcode,parent_position,parent_study_short_code,parent_subject_name,parent_specimen_type_name,parent_collection_date,specimen_type_name,container_type,derivation_type,quantity,unit_symbol,quantity_used,reduce_parent_quantity,extraction_date,protocol,notes,collection_name,collection_barcode,collection_type,position,container_barcode
MT001,micronix_tube,,,,,,,DNA,micronix_tube,dna_extraction,50,µL,10,true,2024-01-15,Standard DNA Extraction Protocol,Extracted from DBS spot,Plate-001,PL001,micronix_plate,A01,CHILD001
,,cryovial_tube,BOX-001,A01,,,Whole Blood,DNA,micronix_tube,dna_extraction,100,µL,50,true,2024-01-15,Standard DNA Extraction Protocol,,Plate-002,PL002,micronix_plate,B01,CHILD002
,,,TCC08,SUBJ-001,DBS,2024-01-10,DNA,micronix_tube,dna_extraction,50,µL,,true,2024-01-15,Standard DNA Extraction Protocol,,Plate-003,PL003,micronix_plate,C01,CHILD003`
    
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

  const successCount = results?.filter(r => r.success).length || 0
  const errorCount = results?.filter(r => !r.success).length || 0
  const warningCount = results?.filter(r => r.warnings && r.warnings.length > 0).length || 0

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Import Derivations (CSV)</h1>
        <p className="text-gray-600">
          Upload a CSV file to create multiple derivations at once. Use the template below to format your data correctly.
        </p>
      </div>

      <div className="bg-white rounded-lg border border-gray-100 p-6 mb-6">
        <div className="mb-4">
          <button
            onClick={downloadTemplate}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Download CSV Template
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              CSV File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              onChange={handleFileSelect}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              disabled={loading}
            />
            {csvContent && (
              <div className="mt-2 text-sm text-green-600">
                ✓ File loaded ({csvContent.split('\n').length - 1} rows)
              </div>
            )}
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="dryRun"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="mr-2"
              disabled={loading}
            />
            <label htmlFor="dryRun" className="text-sm text-gray-700">
              Dry run (validate only, don't create derivations)
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={loading || !csvContent}
            >
              {loading ? (dryRun ? 'Validating...' : 'Importing...') : (dryRun ? 'Validate CSV' : 'Import Derivations')}
            </button>
            <button
              type="button"
              onClick={() => navigate('/derivations')}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>

      {/* Results */}
      {results && (
        <div className="bg-white rounded-lg border border-gray-100 p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Import Results {dryRun && '(Dry Run)'}
          </h2>
          
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="text-sm text-green-700 font-medium">Successful</div>
              <div className="text-2xl font-bold text-green-900">{successCount}</div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded p-3">
              <div className="text-sm text-red-700 font-medium">Errors</div>
              <div className="text-2xl font-bold text-red-900">{errorCount}</div>
            </div>
            <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
              <div className="text-sm text-yellow-700 font-medium">Warnings</div>
              <div className="text-2xl font-bold text-yellow-900">{warningCount}</div>
            </div>
          </div>

          <div className="max-h-96 overflow-y-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Row</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Details</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {results.map((row, idx) => (
                  <tr key={idx} className={row.success ? 'bg-green-50' : 'bg-red-50'}>
                    <td className="px-3 py-2 text-sm text-gray-900">{row.index + 1}</td>
                    <td className="px-3 py-2 text-sm">
                      {row.success ? (
                        <span className="text-green-700 font-medium">✓ Success</span>
                      ) : (
                        <span className="text-red-700 font-medium">✗ Error</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {row.error && (
                        <div className="text-red-700">{row.error}</div>
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
                        <div className="text-green-700">
                          Derivation ID: {row.derivationId}, Child Container: {row.childContainerId}
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
  )
}

