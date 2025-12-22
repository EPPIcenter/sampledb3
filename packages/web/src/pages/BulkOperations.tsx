import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { locationsApi, statesApi, type State } from '../lib/api'

export default function BulkOperations() {
  const navigate = useNavigate()
  const [containerIds, setContainerIds] = useState<string>('')
  const [locationId, setLocationId] = useState<string>('')
  const [stateId, setStateId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [states, setStates] = useState<State[]>([])

  useEffect(() => {
    loadLocations()
    loadStates()
  }, [])

  const loadLocations = async () => {
    try {
      const response = await locationsApi.list()
      setLocations(response.data.locations || [])
    } catch (error) {
      console.error('Failed to load locations:', error)
    }
  }

  const loadStates = async () => {
    try {
      const response = await statesApi.list()
      setStates(response.data.states || [])
    } catch (error) {
      console.error('Failed to load states:', error)
    }
  }

  const handleBulkMove = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const ids = containerIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      
      if (ids.length === 0) {
        setError('Please enter at least one container ID')
        return
      }

      if (!locationId) {
        setError('Please select a location')
        return
      }

      await api.post('/bulk/containers/move', {
        containerIds: ids,
        locationId: parseInt(locationId),
      })

      setSuccess(`Successfully moved ${ids.length} container(s)`)
      setContainerIds('')
      setLocationId('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to move containers')
    } finally {
      setLoading(false)
    }
  }

  const handleBulkUpdate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      const ids = containerIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id))
      
      if (ids.length === 0) {
        setError('Please enter at least one container ID')
        return
      }

      const updateData: any = {}
      if (stateId) updateData.stateId = parseInt(stateId)

      if (Object.keys(updateData).length === 0) {
        setError('Please select at least one field to update')
        return
      }

      await api.patch('/bulk/containers/state', {
        containerIds: ids,
        ...updateData,
      })

      setSuccess(`Successfully updated ${ids.length} container(s)`)
      setContainerIds('')
      setStateId('')
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update containers')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Bulk Operations</h1>
        <p className="text-gray-500 mt-2">Perform bulk operations on multiple containers</p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded mb-4">
          {success}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Bulk Move Containers</h2>
          <form onSubmit={handleBulkMove} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Container IDs (comma-separated) *
              </label>
              <textarea
                value={containerIds}
                onChange={(e) => setContainerIds(e.target.value)}
                placeholder="1, 2, 3, 4, 5"
                required
                rows={4}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Location *
              </label>
              <select
                value={locationId}
                onChange={(e) => setLocationId(e.target.value)}
                required
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.levelI} → {location.levelII}
                    {location.levelIII && ` → ${location.levelIII}`}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Moving...' : 'Move Containers'}
            </button>
          </form>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4 text-gray-900">Bulk Update States</h2>
          <form onSubmit={handleBulkUpdate} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Container IDs (comma-separated) *
              </label>
              <textarea
                value={containerIds}
                onChange={(e) => setContainerIds(e.target.value)}
                placeholder="1, 2, 3, 4, 5"
                required
                rows={4}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                State (optional)
              </label>
              <select
                value={stateId}
                onChange={(e) => setStateId(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select a state (or leave empty)</option>
                {states.map((state) => (
                  <option key={state.id} value={state.id}>
                    {state.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Updating...' : 'Update Containers'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
