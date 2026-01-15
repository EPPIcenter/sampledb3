import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, type AdminSystemStats } from '../lib/api'

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
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load admin statistics')
      console.error('Error loading admin stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">Admin Dashboard</h1>
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-red-800">{error}</p>
            <button
              onClick={loadStats}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const adminCards = [
    {
      title: 'User Management',
      description: 'Manage users, roles, and permissions',
      icon: 'users',
      to: '/admin/users',
      color: 'blue',
    },
    {
      title: 'System Settings',
      description: 'Configure application settings',
      icon: 'settings',
      to: '/admin/settings',
      color: 'purple',
    },
    {
      title: 'System Statistics',
      description: 'View detailed system analytics',
      icon: 'barChart',
      to: '/admin/statistics',
      color: 'green',
    },
  ]

  const statCards = [
    {
      label: 'Active Users',
      value: stats.users.active,
      subtitle: `${stats.users.deleted} deleted`,
      icon: 'users',
      color: 'blue',
    },
    {
      label: 'Active Sessions',
      value: stats.sessions.active,
      subtitle: 'Currently logged in',
      icon: 'activity',
      color: 'green',
    },
    {
      label: 'Studies',
      value: stats.entities.studies,
      subtitle: `${stats.entities.subjects} subjects`,
      icon: 'database',
      color: 'purple',
    },
    {
      label: 'Specimens',
      value: stats.entities.specimens,
      subtitle: `${stats.entities.containers} containers`,
      icon: 'database',
      color: 'indigo',
    },
    {
      label: 'Locations',
      value: stats.locations.total,
      subtitle: 'Storage locations',
      icon: 'database',
      color: 'orange',
    },
    {
      label: 'Reference Data',
      value: Object.values(stats.referenceData).reduce((a, b) => a + b, 0),
      subtitle: 'Types, tags, units, etc.',
      icon: 'settings',
      color: 'teal',
    },
  ]

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
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
          <p className="text-gray-600 mt-1">Manage and monitor your SampleDB system</p>
        </div>

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {adminCards.map((card) => {
            return (
              <Link
                key={card.to}
                to={card.to}
                className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 border border-gray-200 hover:border-gray-300"
              >
                <div className="flex items-start">
                  <div className={`p-3 rounded-lg bg-${card.color}-100`}>
                    {renderIcon(card.icon, `h-6 w-6 text-${card.color}-600`)}
                  </div>
                  <div className="ml-4 flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">{card.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{card.description}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Statistics Grid */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">System Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {statCards.map((card, index) => {
              const colorClasses = {
                blue: 'bg-blue-100 text-blue-600',
                green: 'bg-green-100 text-green-600',
                purple: 'bg-purple-100 text-purple-600',
                indigo: 'bg-indigo-100 text-indigo-600',
                orange: 'bg-orange-100 text-orange-600',
                teal: 'bg-teal-100 text-teal-600',
              }
              return (
                <div
                  key={index}
                  className="bg-white rounded-lg shadow p-6 border border-gray-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">{card.label}</p>
                      <p className="text-3xl font-bold text-gray-900 mt-2">{card.value.toLocaleString()}</p>
                      {card.subtitle && (
                        <p className="text-sm text-gray-500 mt-1">{card.subtitle}</p>
                      )}
                    </div>
                    <div className={`p-3 rounded-lg ${colorClasses[card.color as keyof typeof colorClasses]}`}>
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
          <div className="bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Users by Role</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {Object.entries(stats.users.byRole).map(([role, count]) => (
                <div key={role} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700 capitalize">{role}</span>
                  <span className="text-2xl font-bold text-gray-900">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
