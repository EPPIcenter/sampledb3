interface ExportModalCsvUploadSectionProps {
  csvError: string | null
  csvDataLength: number
  dateTolerance: number
  onUpload: (file: File) => void
  onDateToleranceChange: (value: number) => void
}

export default function ExportModalCsvUploadSection({
  csvError,
  csvDataLength,
  dateTolerance,
  onUpload,
  onDateToleranceChange,
}: ExportModalCsvUploadSectionProps) {
  return (
    <div className="space-y-4 mb-6">
      <div>
        <label className="block text-sm font-medium text-app-text mb-2">Upload CSV File</label>
        <input
          type="file"
          accept=".csv"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onUpload(file)
          }}
          className="file-input-accent"
        />
        <p className="mt-1 text-xs text-app-text-muted">
          CSV should contain: subject_name (required), collection_date (optional), date_from (optional),
          date_to (optional)
        </p>
        {csvError && (
          <div className="mt-2 p-2 bg-app-trend-down/10 border border-app-trend-down rounded text-app-trend-down text-sm">
            {csvError}
          </div>
        )}
        {csvDataLength > 0 && (
          <div className="mt-2 p-2 bg-app-trend-up/10 border border-app-trend-up rounded text-app-trend-up text-sm">
            Successfully parsed {csvDataLength} subject{csvDataLength !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-app-text mb-2">Date Tolerance (days)</label>
        <input
          type="number"
          min="0"
          value={dateTolerance}
          onChange={(e) => onDateToleranceChange(parseInt(e.target.value) || 0)}
          className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent bg-app-card text-app-text"
          placeholder="0 (exact match)"
        />
        <p className="mt-1 text-xs text-app-text-muted">
          Applies to all subjects with collection_date. Default: 0 (exact match). Example: 2 means ±2 days.
        </p>
      </div>
    </div>
  )
}
