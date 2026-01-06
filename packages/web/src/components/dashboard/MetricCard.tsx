import { Link } from 'react-router-dom'

interface MetricCardProps {
  title: string
  value: number | string
  linkTo?: string
  trend?: {
    value: number
    label?: string
    positive?: boolean
  }
  color?: 'blue' | 'green' | 'purple' | 'orange' | 'indigo'
  onClick?: () => void
}

const colorClasses = {
  blue: {
    bg: 'bg-blue-50',
    text: 'text-blue-600',
    hover: 'hover:bg-blue-100',
  },
  green: {
    bg: 'bg-green-50',
    text: 'text-green-600',
    hover: 'hover:bg-green-100',
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-600',
    hover: 'hover:bg-purple-100',
  },
  orange: {
    bg: 'bg-orange-50',
    text: 'text-orange-600',
    hover: 'hover:bg-orange-100',
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-600',
    hover: 'hover:bg-indigo-100',
  },
}

export default function MetricCard({ title, value, linkTo, trend, color = 'blue', onClick }: MetricCardProps) {
  const colors = colorClasses[color]
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value

  const content = (
    <div
      className={`bg-white rounded-lg shadow p-6 transition-all cursor-pointer ${linkTo || onClick ? 'hover:shadow-md' : ''} ${colors.hover}`}
      onClick={onClick}
      role={linkTo || onClick ? 'button' : undefined}
      tabIndex={linkTo || onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if ((linkTo || onClick) && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          if (onClick) onClick()
          else if (linkTo) window.location.href = linkTo
        }
      }}
      aria-label={linkTo || onClick ? `${title}: ${formattedValue}` : undefined}
    >
      <h2 className="text-sm font-medium text-gray-500 mb-2">{title}</h2>
      <div className="flex items-baseline justify-between">
        <p className={`text-3xl font-bold ${colors.text}`}>{formattedValue}</p>
        {trend && (
          <div className="flex items-center gap-1">
            <svg
              className={`w-4 h-4 ${trend.positive !== false ? 'text-green-600' : 'text-red-600'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              {trend.positive !== false ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              )}
            </svg>
            <span
              className={`text-sm font-medium ${
                trend.positive !== false ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {trend.positive !== false ? '+' : ''}
              {trend.value}%
            </span>
            {trend.label && (
              <span className="text-xs text-gray-500 ml-1">{trend.label}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )

  if (linkTo) {
    return (
      <Link to={linkTo} className="block" aria-label={`${title}: ${formattedValue}`}>
        {content}
      </Link>
    )
  }

  return content
}

