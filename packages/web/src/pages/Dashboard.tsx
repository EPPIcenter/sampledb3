import { useEffect, useState } from 'react'
import api from '../lib/api'
import { activityApi } from '../lib/api'
import { Link, useNavigate } from 'react-router-dom'

interface ActivityItem {
  id: number
  type: 'specimen' | 'study' | 'container'
  timestamp: string
}

export default function Dashboard() {
  const navigate = useNavigate()
  const [stats, setStats] = useState({
    studies: 0,
    specimens: 0,
    subjects: 0,
    containers: 0,
    locations: 0,
  })
  const [loading, setLoading] = useState(true)
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [barcodeSearch, setBarcodeSearch] = useState('')
  const [specimenIdSearch, setSpecimenIdSearch] = useState('')
  const [studies, setStudies] = useState<Array<{ id: number; title: string; shortCode: string }>>([])

  useEffect(() => {
    loadDashboardData()
  }, [])

  const loadDashboardData = async () => {
    try {
      setLoading(true)
      
      // Load all stats in parallel
      const [studiesRes, specimensRes, subjectsRes, containersRes, locationsRes, activityRes, studiesListRes] = await Promise.all([
        api.get('/studies', { params: { limit: 1 } }),
        api.get('/specimens', { params: { limit: 1 } }),
        api.get('/subjects', { params: { limit: 1 } }).catch(() => ({ data: { subjects: [], pagination: { total: 0 } } })),
        api.get('/containers', { params: { limit: 1 } }).catch(() => ({ data: { containers: [], pagination: { total: 0 } } })),
        api.get('/locations', { params: { limit: 1 } }).catch(() => ({ data: { locations: [], pagination: { total: 0 } } })),
        activityApi.recent(10).catch(() => ({ data: { activity: [] } })),
        api.get('/studies', { params: { limit: 20 } }),
      ])
      
      setStats({
        studies: studiesRes.data.pagination?.total || studiesRes.data.studies?.length || 0,
        specimens: specimensRes.data.pagination?.total || specimensRes.data.specimens?.length || 0,
        subjects: subjectsRes.data.pagination?.total || subjectsRes.data.subjects?.length || 0,
        containers: containersRes.data.pagination?.total || containersRes.data.containers?.length || 0,
        locations: locationsRes.data.pagination?.total || locationsRes.data.locations?.length || 0,
      })
      
      setRecentActivity(activityRes.data.activity || [])
      setStudies(studiesListRes.data.studies || [])
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleBarcodeSearch = (e: React.FormEvent) => {
    e.preventDefault()
    if (barcodeSearch.trim()) {
      // Navigate to specimens page for barcode search
      navigate(`/specimens?barcode=${encodeURIComponent(barcodeSearch.trim())}`)
    }
  }

  const handleSpecimenIdSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const id = parseInt(specimenIdSearch.trim())
    if (!isNaN(id)) {
      navigate(`/specimens/${id}`)
    }
  }

  const handleStudySelect = (studyId: number) => {
    navigate(`/studies/${studyId}`)
  }

  const getActivityLabel = (item: ActivityItem) => {
    switch (item.type) {
      case 'specimen':
        return `Specimen #${item.id}`
      case 'study':
        return `Study #${item.id}`
      case 'container':
        return `Container #${item.id}`
      default:
        return `Item #${item.id}`
    }
  }

  const getActivityUrl = (item: ActivityItem) => {
    switch (item.type) {
      case 'specimen':
        return `/specimens/${item.id}`
      case 'study':
        return `/studies/${item.id}`
      case 'container':
        return `/containers/${item.id}`
      default:
        return '#'
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6 text-gray-900">Dashboard</h1>

      {loading ? (
        <div className="text-center py-8">Loading...</div>
      ) : (
        <>
          {/* Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
            <Link
              to="/studies"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h2 className="text-sm font-medium text-gray-500 mb-2">Studies</h2>
              <p className="text-3xl font-bold text-blue-600">{stats.studies.toLocaleString()}</p>
            </Link>

            <Link
              to="/specimens"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h2 className="text-sm font-medium text-gray-500 mb-2">Specimens</h2>
              <p className="text-3xl font-bold text-green-600">{stats.specimens.toLocaleString()}</p>
            </Link>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-sm font-medium text-gray-500 mb-2">Subjects</h2>
              <p className="text-3xl font-bold text-purple-600">{stats.subjects.toLocaleString()}</p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-sm font-medium text-gray-500 mb-2">Containers</h2>
              <p className="text-3xl font-bold text-orange-600">{stats.containers.toLocaleString()}</p>
            </div>

            <Link
              to="/locations"
              className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow cursor-pointer"
            >
              <h2 className="text-sm font-medium text-gray-500 mb-2">Locations</h2>
              <p className="text-3xl font-bold text-indigo-600">{stats.locations.toLocaleString()}</p>
            </Link>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Quick Actions</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                to="/specimens/new"
                className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-center font-medium transition-colors"
              >
                Register New Specimen
              </Link>
              <Link
                to="/studies/new"
                className="px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 text-center font-medium transition-colors"
              >
                Create New Study
              </Link>
              <Link
                to="/import"
                className="px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-center font-medium transition-colors"
              >
                Bulk Import
              </Link>
              <Link
                to="/bulk"
                className="px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 text-center font-medium transition-colors"
              >
                Bulk Operations
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Search Shortcuts */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">Search Shortcuts</h2>
              <div className="space-y-4">
                <form onSubmit={handleBarcodeSearch}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Search by Barcode
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={barcodeSearch}
                      onChange={(e) => setBarcodeSearch(e.target.value)}
                      placeholder="Enter barcode..."
                      className="form-input flex-1"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Search
                    </button>
                  </div>
                </form>

                <form onSubmit={handleSpecimenIdSearch}>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Find Specimen by ID
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      value={specimenIdSearch}
                      onChange={(e) => setSpecimenIdSearch(e.target.value)}
                      placeholder="Enter specimen ID..."
                      className="form-input flex-1"
                    />
                    <button
                      type="submit"
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Go
                    </button>
                  </div>
                </form>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quick Study Lookup
                  </label>
                  <select
                    onChange={(e) => {
                      const id = parseInt(e.target.value)
                      if (!isNaN(id)) handleStudySelect(id)
                    }}
                    className="form-select"
                    defaultValue=""
                  >
                    <option value="">Select a study...</option>
                    {studies.map((study) => (
                      <option key={study.id} value={study.id}>
                        {study.title} ({study.shortCode})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Recent Activity */}
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4 text-gray-900">Recent Activity</h2>
              {recentActivity.length === 0 ? (
                <div className="text-center py-8 text-gray-500">No recent activity</div>
              ) : (
                <div className="space-y-2">
                  {recentActivity.map((item, index) => (
                    <Link
                      key={`${item.type}-${item.id}-${index}`}
                      to={getActivityUrl(item)}
                      className="block p-3 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <span className={`px-2 py-0.5 text-xs font-medium rounded ${
                            item.type === 'specimen' ? 'bg-green-100 text-green-800' :
                            item.type === 'study' ? 'bg-blue-100 text-blue-800' :
                            'bg-orange-100 text-orange-800'
                          }`}>
                            {item.type}
                          </span>
                          <span className="ml-2 font-medium text-gray-900">{getActivityLabel(item)}</span>
                        </div>
                        <span className="text-sm text-gray-500">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Workflow Links */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">Workflow Links</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Link
                to="/studies"
                className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                <div className="font-medium text-gray-900">Study Management</div>
                <div className="text-sm text-gray-500 mt-1">View and manage studies</div>
              </Link>
              <Link
                to="/statistics"
                className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                <div className="font-medium text-gray-900">Statistics & Analytics</div>
                <div className="text-sm text-gray-500 mt-1">View statistics and analytics</div>
              </Link>
              <Link
                to="/locations"
                className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                <div className="font-medium text-gray-900">Location Browser</div>
                <div className="text-sm text-gray-500 mt-1">Browse storage locations</div>
              </Link>
              <Link
                to="/import"
                className="p-4 border border-gray-100 rounded-lg hover:bg-gray-50 transition-colors text-center"
              >
                <div className="font-medium text-gray-900">Bulk Import</div>
                <div className="text-sm text-gray-500 mt-1">Import data from CSV</div>
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
