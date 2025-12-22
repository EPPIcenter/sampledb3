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
        <label className="block text-sm font-medium text-gray-700 mb-1">
          From Date
        </label>
        <input
          type="date"
          value={minDate}
          onChange={(e) => setMinDate(e.target.value)}
          className="px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">
          To Date
        </label>
        <input
          type="date"
          value={maxDate}
          max={maxAvailableDate}
          onChange={(e) => setMaxDate(e.target.value)}
          className="px-3 py-2 border border-gray-100 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        />
      </div>
      <button
        onClick={reset}
        className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
      >
        Reset
      </button>
      {showCount && filteredCount !== undefined && totalCount !== undefined && (
        <div className="text-xs text-gray-500 mt-1">
          Showing {filteredCount.toLocaleString()} of {totalCount.toLocaleString()} items
        </div>
      )}
    </div>
  )
}

