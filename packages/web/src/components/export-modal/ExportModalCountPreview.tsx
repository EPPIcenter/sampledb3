interface ExportModalCountPreviewProps {
  count: number | null
  loadingCount: boolean
}

export default function ExportModalCountPreview({ count, loadingCount }: ExportModalCountPreviewProps) {
  return (
    <div className="mb-6 p-4 bg-app-surface rounded-lg">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-app-text">Matching Containers:</span>
        {loadingCount ? (
          <span className="text-sm text-app-text-muted">Calculating...</span>
        ) : (
          <span className="text-lg font-bold text-app-accent">
            {count !== null ? count.toLocaleString() : '—'}
          </span>
        )}
      </div>
    </div>
  )
}
