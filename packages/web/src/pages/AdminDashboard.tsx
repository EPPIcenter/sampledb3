import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, type AdminSystemStats } from '../lib/api'
import '../styles/admin.css'

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminSystemStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStats()
  }, [])

  const loadStats = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await adminApi.getSystemStats()
      setStats(response.data)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setError(message || 'Failed to load admin statistics')
      console.error('Error loading admin stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="admin-page">
        <div className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'rgb(var(--dashboard-text))' }}>Admin Dashboard</h1>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div key={i} className="admin-card p-6 animate-pulse">
                  <div className="h-4 admin-skeleton rounded w-3/4 mb-4" />
                  <div className="h-8 admin-skeleton rounded w-1/2" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="admin-page">
        <div className="relative z-10 p-6">
          <div className="max-w-7xl mx-auto">
            <h1 className="text-2xl font-bold mb-6" style={{ color: 'rgb(var(--dashboard-text))' }}>Admin Dashboard</h1>
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="text-red-800">{error}</p>
              <button
                onClick={loadStats}
                className="admin-btn-primary mt-4 px-4 py-2 rounded-lg"
              >
                Retry
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const adminCards = [
    { title: 'User Management', description: 'Manage users, roles, and permissions', icon: 'users', to: '/admin/users' },
    { title: 'Location Management', description: 'Create and manage storage locations', icon: 'database', to: '/locations' },
    { title: 'System Settings', description: 'Configure application settings', icon: 'settings', to: '/admin/settings' },
    { title: 'System Statistics', description: 'View detailed system analytics', icon: 'barChart', to: '/admin/statistics' },
    { title: 'Data Integrity', description: 'Audit empty collections and data consistency', icon: 'database', to: '/admin/data-integrity' },
  ]

  const statCards = [
    { label: 'Active Users', value: stats.users.active, subtitle: `${stats.users.deleted} deleted`, icon: 'users' },
    { label: 'Active Sessions', value: stats.sessions.active, subtitle: 'Currently logged in', icon: 'activity' },
    { label: 'Studies', value: stats.entities.studies, subtitle: `${stats.entities.subjects} subjects`, icon: 'database' },
    { label: 'Specimens', value: stats.entities.specimens, subtitle: `${stats.entities.containers} containers`, icon: 'database' },
    { label: 'Locations', value: stats.locations.total, subtitle: 'Storage locations', icon: 'database' },
    { label: 'Reference Data', value: Object.values(stats.referenceData).reduce((a, b) => a + b, 0), subtitle: 'Types, tags, units, etc.', icon: 'settings' },
  ]

  const statIconBgClass = 'bg-[rgb(var(--dashboard-accent-muted))] text-[rgb(var(--dashboard-accent))]'

  const renderIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'users':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )
      case 'settings':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'barChart':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )
      case 'activity':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )
      case 'database':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        )
      default:
        return null
    }
  }

  return (
    <div className="admin-page">
      <div className="relative z-10 p-6">
        <div className="max-w-7xl mx-auto">
          <header className="mb-6 admin-reveal admin-reveal-1">
            <h1 className="text-2xl font-bold">Admin Dashboard</h1>
            <p className="mt-1 text-[rgb(var(--dashboard-text-muted))]">
              Manage and monitor your SampleDB system.
              {' '}
              <a href="/docs/guides/advanced/deployment/" className="text-blue-600 hover:text-blue-800 hover:underline">
                Deployment guide
              </a>
            </p>
          </header>

          {/* Quick Actions */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {adminCards.map((card, i) => {
              const revealClass = ['admin-reveal-2', 'admin-reveal-3', 'admin-reveal-4'][i] ?? 'admin-reveal-4'
              return (
              <Link
                key={card.to}
                to={card.to}
                className={`admin-card p-6 admin-reveal ${revealClass} flex items-start gap-4 transition-all duration-200 hover:border-[rgb(var(--dashboard-accent))] hover:shadow-md`}
              >
                <div className={`p-3 rounded-lg ${statIconBgClass}`}>
                  {renderIcon(card.icon, 'h-6 w-6')}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-semibold" style={{ color: 'rgb(var(--dashboard-text))' }}>{card.title}</h3>
                  <p className="text-sm mt-1 text-[rgb(var(--dashboard-text-muted))]">{card.description}</p>
                </div>
              </Link>
              )
            })}
          </div>

          {/* Statistics Grid */}
          <div className="mb-8">
            <h2 className="admin-section-title mb-4">System Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {statCards.map((card, index) => {
                const revealClass = ['admin-reveal-5', 'admin-reveal-6', 'admin-reveal-7', 'admin-reveal-8', 'admin-reveal-5', 'admin-reveal-6'][index] ?? 'admin-reveal-6'
                return (
                <div
                  key={index}
                  className={`admin-card p-6 admin-reveal ${revealClass}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[rgb(var(--dashboard-text-muted))]">{card.label}</p>
                      <p className="text-3xl font-bold mt-2" style={{ color: 'rgb(var(--dashboard-text))' }}>{card.value.toLocaleString()}</p>
                      {card.subtitle && (
                        <p className="text-sm mt-1 text-[rgb(var(--dashboard-text-muted))]">{card.subtitle}</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${statIconBgClass}`}>
                      {renderIcon(card.icon, 'h-6 w-6')}
                    </div>
                  </div>
                </div>
                )
              })}
            </div>
          </div>

          {/* Users by Role */}
          {stats.users.byRole && Object.keys(stats.users.byRole).length > 0 && (
            <div className="admin-card p-6">
              <h2 className="admin-section-title mb-4">Users by Role</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {Object.entries(stats.users.byRole).map(([role, count]) => (
                  <div
                    key={role}
                    className="flex items-center justify-between p-4 rounded-lg border border-[rgb(var(--dashboard-border))] bg-[rgb(var(--dashboard-surface))]"
                  >
                    <span className="text-sm font-medium capitalize" style={{ color: 'rgb(var(--dashboard-text))' }}>{role}</span>
                    <span className="text-2xl font-bold" style={{ color: 'rgb(var(--dashboard-text))' }}>{count}</span>
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
