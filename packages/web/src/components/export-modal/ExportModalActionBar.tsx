interface ExportModalActionBarProps {
  exporting: boolean
  count: number | null
  loadingCount: boolean
  uploadMode: 'manual' | 'csv'
  csvDataLength: number
  onCancel: () => void
  onExport: () => void
}

export default function ExportModalActionBar({
  exporting,
  count,
  loadingCount,
  uploadMode,
  csvDataLength,
  onCancel,
  onExport,
}: ExportModalActionBarProps) {
  return (
    <div className="flex justify-end gap-3">
      <button
        onClick={onCancel}
        className="px-4 py-2 text-sm font-medium text-app-text bg-app-card border border-app-border rounded-lg hover:bg-app-surface"
      >
        Cancel
      </button>
      <button
        onClick={onExport}
        disabled={exporting || count === 0 || loadingCount || (uploadMode === 'csv' && csvDataLength === 0)}
        className="px-4 py-2 text-sm font-medium text-white bg-app-accent rounded-lg hover:bg-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {exporting ? 'Exporting...' : 'Export'}
      </button>
    </div>
  )
}
