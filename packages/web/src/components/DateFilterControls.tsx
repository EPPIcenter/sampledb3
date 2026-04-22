import { useDateFilter } from '../contexts/DateFilterContext'

interface DateFilterControlsProps {
  maxAvailableDate?: string
  showCount?: boolean
  filteredCount?: number
  totalCount?: number
}

export default function DateFilterControls({ 
  maxAvailableDate, 
  showCount = false,
  filteredCount,
  totalCount 
}: DateFilterControlsProps) {
  const { settings, setMinDate, setMaxDate, reset } = useDateFilter()
  const { minDate, maxDate } = settings

  return (
    <div className="mb-4 flex gap-4 items-end flex-wrap">
      <div>
        <label className="block text-sm font-medium text-app-text mb-1">
          From Date
        </label>
        <input
          type="date"
          value={minDate}
          onChange={(e) => setMinDate(e.target.value)}
          className="px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-app-text mb-1">
          To Date
        </label>
        <input
          type="date"
          value={maxDate}
          max={maxAvailableDate}
          onChange={(e) => setMaxDate(e.target.value)}
          className="px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
        />
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm text-app-text bg-app-surface rounded-lg hover:bg-app-surface/80 transition-colors"
      >
        Reset
      </button>
      {showCount && filteredCount !== undefined && totalCount !== undefined && (
        <div className="text-xs text-app-text-muted mt-1">
          Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} items
        </div>
      )}
    </div>
  )
}

