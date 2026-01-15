import { useEffect, useState } from 'react'
import { adminApi, type AdminSystemStats } from '../lib/api'

export default function AdminStatistics() {
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
      setError(err.response?.data?.error || 'Failed to load statistics')
      console.error('Error loading admin stats:', err)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="p-6">
        <div className="max-w-7xl mx-auto">
          <h1 className="text-2xl font-bold text-gray-900 mb-6">System Statistics</h1>
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
          <h1 className="text-2xl font-bold text-gray-900 mb-6">System Statistics</h1>
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

  if (!stats) return null

  const renderIcon = (iconName: string, className: string) => {
    switch (iconName) {
      case 'users':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        )
      case 'database':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
          </svg>
        )
      case 'package':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
          </svg>
        )
      case 'settings':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'mapPin':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        )
      case 'activity':
        return (
          <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        )
      default:
        return null
    }
  }

  const sections = [
    {
      title: 'Users & Sessions',
      icon: 'users',
      items: [
        { label: 'Total Users', value: stats.users.total },
        { label: 'Active Users', value: stats.users.active },
        { label: 'Deleted Users', value: stats.users.deleted },
        { label: 'Active Sessions', value: stats.sessions.active },
        { label: 'Recent Logins (7 days)', value: stats.users.recentLogins },
      ],
    },
    {
      title: 'Entities',
      icon: 'database',
      items: [
        { label: 'Studies', value: stats.entities.studies },
        { label: 'Subjects', value: stats.entities.subjects },
        { label: 'Specimens', value: stats.entities.specimens },
        { label: 'Containers', value: stats.entities.containers },
      ],
    },
    {
      title: 'Containers by Type',
      icon: 'package',
      items: [
        { label: 'Micronix Tubes', value: stats.containers.micronixTubes },
        { label: 'Cryovial Tubes', value: stats.containers.cryovialTubes },
        { label: 'Papers', value: stats.containers.papers },
        { label: 'Static Wells', value: stats.containers.staticWells },
      ],
    },
    {
      title: 'Collections',
      icon: 'package',
      items: [
        { label: 'Micronix Plates', value: stats.collections.micronixPlates },
        { label: 'Cryovial Boxes', value: stats.collections.cryovialBoxes },
        { label: 'Boxes', value: stats.collections.boxes },
        { label: 'Bags', value: stats.collections.bags },
      ],
    },
    {
      title: 'Reference Data',
      icon: 'settings',
      items: [
        { label: 'Specimen Types', value: stats.referenceData.specimenTypes },
        { label: 'Storage Types', value: stats.referenceData.storageTypes },
        { label: 'Tags', value: stats.referenceData.tags },
        { label: 'Units', value: stats.referenceData.units },
        { label: 'Strains', value: stats.referenceData.strains },
      ],
    },
    {
      title: 'Storage',
      icon: 'mapPin',
      items: [{ label: 'Locations', value: stats.locations.total }],
    },
  ]

  return (
    <div className="p-6">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">System Statistics</h1>
          <p className="text-gray-600 mt-1">Comprehensive overview of your SampleDB system</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {sections.map((section, sectionIndex) => {
            return (
              <div key={sectionIndex} className="bg-white rounded-lg shadow p-6 border border-gray-200">
                <div className="flex items-center mb-4">
                  <div className="p-2 bg-blue-100 rounded-lg">
                    {renderIcon(section.icon, 'h-5 w-5 text-blue-600')}
                  </div>
                  <h2 className="text-lg font-semibold text-gray-900 ml-3">{section.title}</h2>
                </div>
                <div className="space-y-3">
                  {section.items.map((item, itemIndex) => (
                    <div key={itemIndex} className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-gray-600">{item.label}</span>
                      <span className="text-lg font-bold text-gray-900">{item.value.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>

        {/* Users by Role */}
        {stats.users.byRole && Object.keys(stats.users.byRole).length > 0 && (
          <div className="mt-6 bg-white rounded-lg shadow p-6 border border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Users by Role</h2>
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
