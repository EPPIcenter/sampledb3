import { Link } from 'react-router-dom'
import SkeletonList from '../SkeletonList'

interface ActivityItem {
  id: number
  type: 'specimen' | 'study' | 'container' | 'subject' | 'control' | 'location'
  timestamp: string
  label?: string
  context?: string
}

interface ActivityFeedProps {
  activities: ActivityItem[]
  loading?: boolean
}

function formatRelativeTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins} minute${diffMins !== 1 ? 's' : ''} ago`
  if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`
  if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  return date.toLocaleDateString()
}

function getActivityUrl(item: ActivityItem): string {
  switch (item.type) {
    case 'specimen':
      return `/specimens/${item.id}`
    case 'study':
      return `/studies/${item.id}`
    case 'container':
      return `/containers/${item.id}`
    case 'subject':
      return `/subjects/${item.id}`
    case 'control':
      return `/blood-controls/${item.id}`
    case 'location':
      return `/locations/${item.id}`
    default:
      return '#'
  }
}

function getActivityIcon(type: ActivityItem['type']) {
  const iconClass = 'w-4 h-4'
  switch (type) {
    case 'specimen':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
        </svg>
      )
    case 'study':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      )
    case 'container':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
        </svg>
      )
    case 'subject':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      )
    case 'control':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'location':
      return (
        <svg className={iconClass} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return null
  }
}

/* Dashboard palette: muted badge colors that fit the lab theme */
function getActivityBadgeColor(type: ActivityItem['type']): string {
  switch (type) {
    case 'specimen':
      return 'bg-emerald-50 text-emerald-700'
    case 'study':
      return 'bg-blue-50 text-blue-700'
    case 'container':
      return 'bg-amber-50 text-amber-700'
    case 'subject':
      return 'bg-violet-50 text-violet-700'
    case 'control':
      return 'bg-rose-50 text-rose-700'
    case 'location':
      return 'bg-indigo-50 text-indigo-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}

function groupActivitiesByDate(activities: ActivityItem[]): {
  today: ActivityItem[]
  yesterday: ActivityItem[]
  thisWeek: ActivityItem[]
  older: ActivityItem[]
} {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const weekAgo = new Date(today)
  weekAgo.setDate(weekAgo.getDate() - 7)

  const grouped = {
    today: [] as ActivityItem[],
    yesterday: [] as ActivityItem[],
    thisWeek: [] as ActivityItem[],
    older: [] as ActivityItem[],
  }

  activities.forEach((activity) => {
    const activityDate = new Date(activity.timestamp)
    if (activityDate >= today) {
      grouped.today.push(activity)
    } else if (activityDate >= yesterday) {
      grouped.yesterday.push(activity)
    } else if (activityDate >= weekAgo) {
      grouped.thisWeek.push(activity)
    } else {
      grouped.older.push(activity)
    }
  })

  return grouped
}

function renderActivityGroup(title: string, activities: ActivityItem[]) {
  if (activities.length === 0) return null

  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold text-[rgb(var(--dashboard-text-muted))] uppercase tracking-wider mb-2">{title}</h3>
      <div className="space-y-2">
        {activities.map((item, index) => (
          <Link
            key={`${item.type}-${item.id}-${index}`}
            to={getActivityUrl(item)}
            className="block p-3 border border-[rgb(var(--dashboard-border))] rounded-lg hover:border-[rgb(var(--dashboard-accent)/0.4)] hover:bg-[rgb(var(--dashboard-surface))] transition-all duration-200"
            aria-label={`${item.label || `${item.type} #${item.id}`}`}
          >
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 p-1.5 rounded-lg ${getActivityBadgeColor(item.type)}`}>
                {getActivityIcon(item.type)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded ${getActivityBadgeColor(item.type)}`}>
                    {item.type}
                  </span>
                  <span className="font-medium text-[rgb(var(--dashboard-text))] truncate">
                    {item.label || `${item.type.charAt(0).toUpperCase() + item.type.slice(1)} #${item.id}`}
                  </span>
                </div>
                {item.context && (
                  <p className="text-sm text-[rgb(var(--dashboard-text-muted))] truncate">{item.context}</p>
                )}
              </div>
              <span className="text-xs text-[rgb(var(--dashboard-text-muted))] flex-shrink-0 whitespace-nowrap">
                {formatRelativeTime(item.timestamp)}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function ActivityFeed({ activities, loading }: ActivityFeedProps) {
  if (loading) {
    return (
      <section className="dashboard-card p-6" aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title" className="dashboard-section-title mb-4">Recent Activity</h2>
        <SkeletonList count={5} itemHeight="h-16" />
      </section>
    )
  }

  if (activities.length === 0) {
    return (
      <section className="dashboard-card p-6" aria-labelledby="recent-activity-title">
        <h2 id="recent-activity-title" className="dashboard-section-title mb-4">Recent Activity</h2>
        <div className="text-center py-8 text-[rgb(var(--dashboard-text-muted))]">No recent activity</div>
      </section>
    )
  }

  const grouped = groupActivitiesByDate(activities)

  return (
    <section className="dashboard-card p-6" aria-labelledby="recent-activity-title">
      <h2 id="recent-activity-title" className="dashboard-section-title mb-4">Recent Activity</h2>
      <div className="space-y-4">
        {renderActivityGroup('Today', grouped.today)}
        {renderActivityGroup('Yesterday', grouped.yesterday)}
        {renderActivityGroup('This Week', grouped.thisWeek)}
        {renderActivityGroup('Older', grouped.older)}
      </div>
    </section>
  )
}

