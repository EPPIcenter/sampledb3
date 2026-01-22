interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
  unfilteredValue?: number
  showUnfilteredWarning?: boolean
}

export default function StatCard({ title, value, subtitle, trend, unfilteredValue, showUnfilteredWarning }: StatCardProps) {
  const hasUnfiltered = unfilteredValue !== undefined && unfilteredValue !== Number(value)
  
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <div className="flex items-baseline justify-between">
        <div className="flex-1">
          <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
          {hasUnfiltered && showUnfilteredWarning && (
            <div className="mt-1 flex items-center gap-1.5">
              <svg 
                className="w-4 h-4 text-amber-500" 
                fill="currentColor" 
                viewBox="0 0 20 20"
                aria-hidden="true"
              >
                <path 
                  fillRule="evenodd" 
                  d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.93c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" 
                  clipRule="evenodd" 
                />
              </svg>
              <span className="text-xs text-amber-600 font-medium">
                Total: {unfilteredValue.toLocaleString()} (filtered by date range)
              </span>
            </div>
          )}
        </div>
        {trend && (
          <span
            className={`text-sm font-medium ${
              trend.positive !== false ? 'text-green-600' : 'text-red-600'
            }`}
          >
            {trend.positive !== false ? '+' : ''}
            {trend.value}% {trend.label}
          </span>
        )}
      </div>
      {subtitle && <p className="text-sm text-gray-500 mt-2">{subtitle}</p>}
    </div>
  )
}

