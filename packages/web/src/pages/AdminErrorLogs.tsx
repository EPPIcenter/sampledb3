import { useState, useEffect, useCallback } from 'react'
import { errorLogsApi, type ErrorLog, type ErrorLogsQueryParams } from '../lib/api'
import Pagination from '../components/Pagination'

export default function AdminErrorLogs() {
  const [logs, setLogs] = useState<ErrorLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCleanupModal, setShowCleanupModal] = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  
  // Filter states
  const [filters, setFilters] = useState<Omit<ErrorLogsQueryParams, 'page' | 'limit'>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  
  // Client-side pagination
  const [page, setPage] = useState(1)
  const pageSize = 50

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // Load logs when filters change
  useEffect(() => {
    loadLogs()
  }, [filters, searchDebounced])

  const loadLogs = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      // Load all logs (no pagination params = return all)
      const params: Omit<ErrorLogsQueryParams, 'page' | 'limit'> = {
        ...filters,
        search: searchDebounced || undefined,
      }
      const response = await errorLogsApi.list(params as any)
      setLogs(response.data.logs)
      setPage(1) // Reset to first page when data changes
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load error logs')
      console.error('Error loading error logs:', err)
    } finally {
      setLoading(false)
    }
  }, [filters, searchDebounced])

  const handleFilterChange = (key: keyof Omit<ErrorLogsQueryParams, 'page' | 'limit'>, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
    setPage(1) // Reset to first page when filters change
  }

  const handleResolve = async (id: number) => {
    try {
      await errorLogsApi.resolve(id)
      await loadLogs()
      if (selectedLog?.id === id) {
        setSelectedLog(null)
        setShowDetailModal(false)
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to resolve error log')
    }
  }

  const handleCleanup = async (retentionDays?: number) => {
    try {
      setCleanupLoading(true)
      await errorLogsApi.cleanup(retentionDays)
      setShowCleanupModal(false)
      await loadLogs()
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to cleanup error logs')
    } finally {
      setCleanupLoading(false)
    }
  }

  const handleViewDetail = async (id: number) => {
    try {
      const response = await errorLogsApi.get(id)
      setSelectedLog(response.data)
      setShowDetailModal(true)
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load error log details')
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800 border-red-300'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'info':
        return 'bg-blue-100 text-blue-800 border-blue-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'frontend':
        return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'backend':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Error Logs</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCleanupModal(true)}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Cleanup Old Logs
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 border border-red-200 p-3">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 mb-6">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search message or error code..."
              className="w-full form-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Source
            </label>
            <select
              value={filters.source || ''}
              onChange={(e) => handleFilterChange('source', e.target.value || undefined)}
              className="w-full form-select"
            >
              <option value="">All</option>
              <option value="frontend">Frontend</option>
              <option value="backend">Backend</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Level
            </label>
            <select
              value={filters.level || ''}
              onChange={(e) => handleFilterChange('level', e.target.value || undefined)}
              className="w-full form-select"
            >
              <option value="">All</option>
              <option value="error">Error</option>
              <option value="warning">Warning</option>
              <option value="info">Info</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.resolved === undefined ? '' : filters.resolved ? 'resolved' : 'unresolved'}
              onChange={(e) => {
                if (e.target.value === '') {
                  handleFilterChange('resolved', undefined)
                } else {
                  handleFilterChange('resolved', e.target.value === 'resolved')
                }
              }}
              className="w-full form-select"
            >
              <option value="">All</option>
              <option value="unresolved">Unresolved</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Loading error logs...</div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No error logs found</div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {logs.slice((page - 1) * pageSize, page * pageSize).map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatDate(log.timestamp)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSourceColor(log.source)}`}>
                          {log.source}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(log.level)}`}>
                          {log.level}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900 max-w-md truncate" title={log.message}>
                        {log.message}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.resolved ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                            Unresolved
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(log.id)}
                            className="text-blue-600 hover:text-blue-900"
                          >
                            View
                          </button>
                          {!log.resolved && (
                            <button
                              onClick={() => handleResolve(log.id)}
                              className="text-green-600 hover:text-green-900"
                            >
                              Resolve
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {Math.ceil(logs.length / pageSize) > 1 && (
              <div className="px-4 py-3 border-t border-gray-200">
                <Pagination
                  currentPage={page}
                  totalPages={Math.ceil(logs.length / pageSize)}
                  totalItems={logs.length}
                  itemsPerPage={pageSize}
                  onPageChange={setPage}
                />
              </div>
            )}
          </>
        )}
      </div>

      {/* Detail Modal */}
      {showDetailModal && selectedLog && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Error Log Details</h2>
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedLog(null)
                }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-6 py-4 overflow-y-auto flex-1">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">ID</label>
                    <p className="mt-1 text-sm text-gray-900">{selectedLog.id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Timestamp</label>
                    <p className="mt-1 text-sm text-gray-900">{formatDate(selectedLog.timestamp)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Source</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSourceColor(selectedLog.source)}`}>
                        {selectedLog.source}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Level</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(selectedLog.level)}`}>
                        {selectedLog.level}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <p className="mt-1">
                      {selectedLog.resolved ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 border border-green-300">
                          Resolved
                          {selectedLog.resolvedAt && ` on ${formatDate(selectedLog.resolvedAt)}`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                          Unresolved
                        </span>
                      )}
                    </p>
                  </div>
                  {selectedLog.errorCode && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Error Code</label>
                      <p className="mt-1 text-sm text-gray-900 font-mono">{selectedLog.errorCode}</p>
                    </div>
                  )}
                  {selectedLog.userId && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">User ID</label>
                      <p className="mt-1 text-sm text-gray-900">{selectedLog.userId}</p>
                    </div>
                  )}
                  {selectedLog.url && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700">URL</label>
                      <p className="mt-1 text-sm text-gray-900 break-all">{selectedLog.url}</p>
                    </div>
                  )}
                  {selectedLog.userAgent && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700">User Agent</label>
                      <p className="mt-1 text-sm text-gray-900 break-all">{selectedLog.userAgent}</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Message</label>
                  <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap break-words">{selectedLog.message}</p>
                </div>
                {selectedLog.stack && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Stack Trace</label>
                    <pre className="mt-1 text-xs text-gray-900 bg-gray-50 p-3 rounded border overflow-x-auto">
                      {selectedLog.stack}
                    </pre>
                  </div>
                )}
                {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Context</label>
                    <pre className="mt-1 text-xs text-gray-900 bg-gray-50 p-3 rounded border overflow-x-auto">
                      {JSON.stringify(selectedLog.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              {!selectedLog.resolved && (
                <button
                  onClick={() => {
                    handleResolve(selectedLog.id)
                  }}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                >
                  Mark as Resolved
                </button>
              )}
              <button
                onClick={() => {
                  setShowDetailModal(false)
                  setSelectedLog(null)
                }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cleanup Modal */}
      {showCleanupModal && (
        <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-xl font-semibold text-gray-900">Cleanup Old Error Logs</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-gray-600 mb-4">
                This will delete error logs older than the retention period (default: 90 days).
                You can optionally specify a custom retention period.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Retention Days (optional)
                </label>
                <input
                  type="number"
                  min="1"
                  placeholder="Leave empty for default (90 days)"
                  className="w-full form-input"
                  id="retention-days"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCleanupModal(false)}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('retention-days') as HTMLInputElement
                  const days = input.value ? parseInt(input.value, 10) : undefined
                  if (days && (isNaN(days) || days < 1)) {
                    setError('Retention days must be a positive number')
                    return
                  }
                  handleCleanup(days)
                }}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {cleanupLoading ? 'Cleaning up...' : 'Cleanup'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
