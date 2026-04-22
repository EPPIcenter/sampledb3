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
  /** Optional 1–5 for stagger reveal animation */
  index?: number
}

const colorClasses = {
  blue: 'bg-app-accent-muted text-app-accent',
  green: 'bg-emerald-50 text-emerald-600',
  purple: 'bg-violet-50 text-violet-600',
  orange: 'bg-amber-50 text-amber-600',
  indigo: 'bg-indigo-50 text-indigo-600',
}

function MetricIcon({ title, colorClass }: { title: string; colorClass: string }) {
  const iconClass = 'w-5 h-5 flex-shrink-0'
  switch (title) {
    case 'Studies':
      return (
        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
        </span>
      )
    case 'Specimens':
      return (
        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
        </span>
      )
    case 'Subjects':
      return (
        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        </span>
      )
    case 'Containers':
      return (
        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        </span>
      )
    case 'Locations':
      return (
        <span className={`flex-shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${colorClass}`}>
          <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </span>
      )
    default:
      return null
  }
}

export default function MetricCard({ title, value, linkTo, trend, color = 'blue', onClick, index }: MetricCardProps) {
  const colorClass = colorClasses[color]
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : value
  const revealClass = index != null && index >= 1 && index <= 8 ? `dashboard-reveal dashboard-reveal-${index}` : ''

  const content = (
    <div
      className={`dashboard-card p-6 transition-all duration-200 cursor-pointer hover:shadow-md hover:border-[rgb(var(--app-accent)/0.4)] overflow-hidden min-w-0 ${revealClass}`}
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
      <div className="flex items-start justify-between gap-3 min-w-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <h2 className="text-xs font-medium text-[rgb(var(--app-text-muted))] mb-1.5 leading-tight">{title}</h2>
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 min-w-0">
            <p className="text-xl sm:text-2xl font-bold text-[rgb(var(--app-text))] tabular-nums break-words">{formattedValue}</p>
            {trend && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <svg
                  className={`w-4 h-4 ${trend.positive !== false ? 'text-[rgb(var(--app-trend-up))]' : 'text-[rgb(var(--app-trend-down))]'}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden
                >
                  {trend.positive !== false ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  )}
                </svg>
                <span
                  className={`text-xs font-medium ${trend.positive !== false ? 'text-[rgb(var(--app-trend-up))]' : 'text-[rgb(var(--app-trend-down))]'}`}
                >
                  {trend.positive !== false ? '+' : ''}
                  {trend.value}%
                </span>
                {trend.label && (
                  <span className="text-[10px] text-[rgb(var(--app-text-muted))]">{trend.label}</span>
                )}
              </div>
            )}
          </div>
        </div>
        <MetricIcon title={title} colorClass={colorClass} />
      </div>
    </div>
  )

  if (linkTo) {
    return (
      <Link to={linkTo} className="block min-w-0" aria-label={`${title}: ${formattedValue}`}>
        {content}
      </Link>
    )
  }

  return content
}
