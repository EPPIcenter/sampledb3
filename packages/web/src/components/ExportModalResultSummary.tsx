export interface ExportSummaryData {
  total_containers: number
  subjects_with_results: Array<{ name: string; count: number }>
  subjects_no_results: string[]
  subjects_not_found: string[]
  errors?: string[]
}

interface ExportModalResultSummaryProps {
  exportSummary: ExportSummaryData
  expanded: boolean
  onToggleExpand: () => void
}

export default function ExportModalResultSummary({
  exportSummary,
  expanded,
  onToggleExpand,
}: ExportModalResultSummaryProps) {
  return (
    <div className="mb-6 border border-app-border rounded-lg overflow-hidden transition-all duration-300">
      <button
        type="button"
        onClick={onToggleExpand}
        className="w-full px-4 py-3 bg-app-surface hover:bg-app-border/50 flex items-center justify-between transition-colors text-app-text"
      >
        <div className="flex items-center gap-2">
          <svg
            className={`w-5 h-5 text-app-trend-up transition-transform duration-300 ${expanded ? 'rotate-0' : 'rotate-180'}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-sm font-medium">Export Summary</span>
          <span className="text-xs text-app-text-muted ml-2">
            ({exportSummary.total_containers.toLocaleString()} containers)
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-app-text-muted transition-transform duration-300 ${expanded ? 'rotate-180' : 'rotate-0'}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        className={`overflow-hidden transition-all duration-300 ${
          expanded ? 'max-h-[800px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 py-4 space-y-4 bg-app-card">
          <div className="p-4 bg-app-accent-muted/50 rounded-lg border border-app-accent/30">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-app-text-muted">Total Containers Exported:</span>
              <span className="text-2xl font-bold text-app-accent-hover">
                {exportSummary.total_containers.toLocaleString()}
              </span>
            </div>
          </div>

          {exportSummary.subjects_with_results.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-app-text-muted mb-2">
                Subjects with Results ({exportSummary.subjects_with_results.length})
              </h4>
              <div className="max-h-48 overflow-y-auto border border-app-border rounded p-2">
                {exportSummary.subjects_with_results.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center py-1 text-sm text-app-text">
                    <span>{item.name}</span>
                    <span className="font-medium text-app-accent">
                      {item.count.toLocaleString()} container{item.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {exportSummary.subjects_no_results.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-app-standard mb-2">
                Subjects with No Results ({exportSummary.subjects_no_results.length})
              </h4>
              <div className="max-h-32 overflow-y-auto border border-app-standard/50 rounded p-2 bg-app-standard-muted/50">
                {exportSummary.subjects_no_results.map((name, idx) => (
                  <div key={idx} className="text-sm text-app-standard py-1">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {exportSummary.subjects_not_found.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-app-trend-down mb-2">
                Subjects Not Found ({exportSummary.subjects_not_found.length})
              </h4>
              <div className="max-h-32 overflow-y-auto border border-app-trend-down/50 rounded p-2 bg-app-card">
                {exportSummary.subjects_not_found.map((name, idx) => (
                  <div key={idx} className="text-sm text-app-trend-down py-1">
                    {name}
                  </div>
                ))}
              </div>
            </div>
          )}

          {exportSummary.errors && exportSummary.errors.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-app-trend-down mb-2">Errors</h4>
              <div className="border border-app-trend-down/50 rounded p-2 bg-app-card">
                {exportSummary.errors.map((error, idx) => (
                  <div key={idx} className="text-sm text-app-trend-down py-1">
                    {error}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
