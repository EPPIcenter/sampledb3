interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    positive?: boolean
  }
}

export default function StatCard({ title, value, subtitle, trend }: StatCardProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-sm font-medium text-gray-500 mb-1">{title}</h3>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-bold text-gray-900">{value.toLocaleString()}</p>
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

