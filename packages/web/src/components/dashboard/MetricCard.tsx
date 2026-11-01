import { Link } from 'react-router-dom'
import { Button } from '../../ui'

interface MetricCardProps {
  title: string
  /** Ignored unless `status` is `ready`. */
  value?: number | string
  /** `loading` and `error` replace the value; an errored tile never shows a number. */
  status?: 'loading' | 'error' | 'ready'
  /** Shown on an errored tile. */
  errorMessage?: string
  /** Offers a retry button on an errored tile. */
  onRetry?: () => void
  linkTo?: string
  trend?: {
    value: number
    label?: string
    positive?: boolean
    /** Says what the trend compares; read by screen readers and shown on hover. */
    description?: string
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

function TrendBadge({ trend }: { trend: NonNullable<MetricCardProps['trend']> }) {
  const up = trend.positive !== false
  const tone = up ? 'text-[rgb(var(--app-trend-up))]' : 'text-[rgb(var(--app-trend-down))]'
  return (
    <div className="flex items-center gap-1 flex-shrink-0 whitespace-nowrap" title={trend.description}>
      <svg className={`w-4 h-4 ${tone}`} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
        {up ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        )}
      </svg>
      <span className={`text-xs font-medium ${tone}`}>
        {up ? '+' : '-'}
        {trend.value}%
      </span>
      {trend.label && <span className="text-[10px] text-[rgb(var(--app-text-muted))]">{trend.label}</span>}
      {trend.description && <span className="sr-only">{trend.description}</span>}
    </div>
  )
}

/**
 * Dashboard stat tile. The icon sits in the title row so the value gets the tile's full
 * inner width, and the value never wraps or breaks: a six-digit count such as `118,069`
 * needs about 6rem at `text-2xl`. The Dashboard's grid keeps every tile wide enough for that.
 */
export default function MetricCard({
  title,
  value,
  status = 'ready',
  errorMessage = 'Could not load this count.',
  onRetry,
  linkTo,
  trend,
  color = 'blue',
  onClick,
  index,
}: MetricCardProps) {
  const colorClass = colorClasses[color]
  const formattedValue = typeof value === 'number' ? value.toLocaleString() : (value ?? '')
  const revealClass = index != null && index >= 1 && index <= 8 ? `dashboard-reveal dashboard-reveal-${index}` : ''
  const header = (
    <div className="flex items-center justify-between gap-3 mb-1.5">
      <h2 className="text-xs font-medium text-[rgb(var(--app-text-muted))] leading-tight min-w-0">{title}</h2>
      <MetricIcon title={title} colorClass={colorClass} />
    </div>
  )

  if (status !== 'ready') {
    return (
      <div
        className={`dashboard-card p-6 min-w-0 ${revealClass}`}
        aria-busy={status === 'loading' || undefined}
      >
        {header}
        {status === 'loading' ? (
          <div role="status" className="h-8 w-24 rounded bg-[rgb(var(--app-border))] animate-pulse">
            <span className="sr-only">Loading {title}</span>
          </div>
        ) : (
          <div role="alert" className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-sm text-[rgb(var(--app-text-muted))]">{errorMessage}</p>
            {onRetry && (
              <Button variant="secondary" onClick={onRetry} aria-label={`Retry loading ${title}`}>
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    )
  }

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
      {header}
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <p className="text-xl sm:text-2xl font-bold text-[rgb(var(--app-text))] tabular-nums whitespace-nowrap">
          {formattedValue}
        </p>
        {trend && <TrendBadge trend={trend} />}
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
