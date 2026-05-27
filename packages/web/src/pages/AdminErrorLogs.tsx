import { useState, useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { errorLogsApi } from '../lib/api/error-logs'
import type { ErrorLog, ErrorLogsQueryParams } from '../lib/api/error-logs'
import { formatErrorLogForLLM } from '../lib/error-log-prompt'
import { adminKeys, useAdminErrorLogs } from '../hooks/useAdmin'
import Pagination from '../components/Pagination'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { Modal, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/admin.css'

export default function AdminErrorLogs() {
  const queryClient = useQueryClient()
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [selectedLog, setSelectedLog] = useState<ErrorLog | null>(null)
  const [showDetailModal, setShowDetailModal] = useState(false)
  const [showCleanupModal, setShowCleanupModal] = useState(false)
  const [cleanupLoading, setCleanupLoading] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null)
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  
  // Filter states - default to unresolved
  const [filters, setFilters] = useState<Omit<ErrorLogsQueryParams, 'page' | 'limit'>>({
    resolved: false,
  })
  const [searchQuery, setSearchQuery] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  
  // Client-side pagination
  const [page, setPage] = useState(1)
  const pageSize = 50
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  const listParams: Omit<ErrorLogsQueryParams, 'page' | 'limit'> = {
    ...filters,
    search: searchDebounced || undefined,
  }
  const logsQuery = useAdminErrorLogs(listParams)
  const logs = logsQuery.data ?? []
  const listStatus = fromQuery(logsQuery)

  const refreshLogs = () => {
    void queryClient.invalidateQueries({ queryKey: adminKeys.errorLogs(listParams) })
    setPage(1)
  }

  useEffect(() => {
    if (logsQuery.isSuccess) {
      setPage(1)
    }
  }, [filters, searchDebounced, logsQuery.isSuccess])

  const handleFilterChange = (key: keyof Omit<ErrorLogsQueryParams, 'page' | 'limit'>, value: string | boolean | undefined) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }))
    setPage(1) // Reset to first page when filters change
  }

  const handleResolve = async (id: number) => {
    try {
      await errorLogsApi.resolve(id)
      refreshLogs()
      if (selectedLog?.id === id) {
        setSelectedLog(null)
        setShowDetailModal(false)
      }
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setMutationError(message || 'Failed to resolve error log')
    }
  }

  const handleCleanup = async (retentionDays?: number) => {
    try {
      setCleanupLoading(true)
      await errorLogsApi.cleanup(retentionDays)
      setShowCleanupModal(false)
      refreshLogs()
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setMutationError(message || 'Failed to cleanup error logs')
    } finally {
      setCleanupLoading(false)
    }
  }

  const handleViewDetail = async (id: number) => {
    try {
      const response = await errorLogsApi.get(id)
      setSelectedLog(response)
      setShowDetailModal(true)
      setCopyFeedback(null)
    } catch (err: unknown) {
      const message = err && typeof err === 'object' && 'response' in err
        ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
        : null
      setMutationError(message || 'Failed to load error log details')
    }
  }

  const handleCopyForLLM = async () => {
    if (!selectedLog) return
    if (copyFeedbackTimeoutRef.current) {
      clearTimeout(copyFeedbackTimeoutRef.current)
      copyFeedbackTimeoutRef.current = null
    }
    try {
      const prompt = formatErrorLogForLLM(selectedLog)
      await navigator.clipboard.writeText(prompt)
      setCopyFeedback('Copied!')
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyFeedback(null)
        copyFeedbackTimeoutRef.current = null
      }, 2000)
    } catch {
      setCopyFeedback('Copy failed')
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyFeedback(null)
        copyFeedbackTimeoutRef.current = null
      }, 2000)
    }
  }

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'bg-app-trend-down/10 text-app-trend-down border-app-trend-down'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300'
      case 'info':
        return 'bg-app-accent-muted text-app-accent-hover border-app-accent/50'
      default:
        return 'bg-app-surface text-app-text border-app-border'
    }
  }

  const getSourceColor = (source: string) => {
    switch (source) {
      case 'frontend':
        return 'bg-purple-100 text-purple-800 border-purple-300'
      case 'backend':
        return 'bg-indigo-100 text-indigo-800 border-indigo-300'
      default:
        return 'bg-app-surface text-app-text border-app-border'
    }
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString()
  }

  if (listStatus === 'error') {
    return (
      <div className="admin-page">
        <div className="relative z-10 container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">Error Logs</h1>
          <PageError
            title="Could not load error logs"
            message={getQueryErrorMessage(logsQuery.error, 'Failed to load error logs')}
            onRetry={() => void logsQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="admin-page">
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Error Logs</h1>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCleanupModal(true)}
              className="admin-btn-secondary px-4 py-2"
            >
              Cleanup Old Logs
            </button>
          </div>
        </div>

        {mutationError && (
          <div className="mb-4 rounded-lg bg-app-trend-down/10 border border-app-trend-down p-3">
            <p className="text-sm text-app-trend-down">{mutationError}</p>
          </div>
        )}

        {/* Filters */}
        <div className="admin-card p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
                Search
              </label>
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search message or error code..."
              className="w-full form-input"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
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
            <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
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
            <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
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
        <div className="admin-card overflow-hidden">
          {logsQuery.isPending ? (
            <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">Loading error logs...</div>
          ) : logs.length === 0 ? (
            <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">No error logs found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="admin-table min-w-full">
                  <thead>
                    <tr>
                      <th className="px-4 py-3 text-left">
                      Timestamp
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                      Source
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                      Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                      Message
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-app-text-muted uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-app-card divide-y divide-app-border">
                  {logs.slice((page - 1) * pageSize, page * pageSize).map((log) => (
                    <tr key={log.id} className="hover:bg-app-surface">
                      <td className="px-4 py-3 whitespace-nowrap text-sm dashboard-stat-value">
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
                      <td className="px-4 py-3 text-sm dashboard-stat-value max-w-md truncate" title={log.message}>
                        {log.message}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {log.resolved ? (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-trend-up/10 text-app-trend-up border border-green-300">
                            Resolved
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-trend-down/10 text-app-trend-down border border-app-trend-down">
                            Unresolved
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleViewDetail(log.id)}
                            className="text-app-accent hover:text-app-accent-hover"
                          >
                            View
                          </button>
                          {!log.resolved && (
                            <button
                              onClick={() => handleResolve(log.id)}
                              className="text-app-trend-up hover:text-app-text"
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
              <div className="px-4 py-3 border-t border-[rgb(var(--app-border))]">
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
      {selectedLog && (
        <Modal
          isOpen={showDetailModal}
          onClose={() => {
            if (copyFeedbackTimeoutRef.current) {
              clearTimeout(copyFeedbackTimeoutRef.current)
              copyFeedbackTimeoutRef.current = null
            }
            setCopyFeedback(null)
            setShowDetailModal(false)
            setSelectedLog(null)
          }}
          layout="centered"
          showCloseButton={false}
          backdropClassName="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay"
          panelClassName="admin-card max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col border border-[rgb(var(--app-border))]"
          contentClassName="p-0 flex flex-col flex-1 min-h-0 overflow-hidden"
        >
            <div className="px-6 py-4 border-b border-[rgb(var(--app-border))] flex items-center justify-between">
              <h2 className="text-xl font-semibold">Error Log Details</h2>
              <button
                onClick={() => {
                  if (copyFeedbackTimeoutRef.current) {
                    clearTimeout(copyFeedbackTimeoutRef.current)
                    copyFeedbackTimeoutRef.current = null
                  }
                  setCopyFeedback(null)
                  setShowDetailModal(false)
                  setSelectedLog(null)
                }}
                className="text-app-text-muted hover:text-app-text-muted"
                aria-label="Close"
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
                    <label className="block text-sm font-medium text-app-text">ID</label>
                    <p className="mt-1 text-sm dashboard-stat-value">{selectedLog.id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text">Timestamp</label>
                    <p className="mt-1 text-sm dashboard-stat-value">{formatDate(selectedLog.timestamp)}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text">Source</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getSourceColor(selectedLog.source)}`}>
                        {selectedLog.source}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text">Level</label>
                    <p className="mt-1">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getLevelColor(selectedLog.level)}`}>
                        {selectedLog.level}
                      </span>
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-app-text">Status</label>
                    <p className="mt-1">
                      {selectedLog.resolved ? (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-trend-up/10 text-app-trend-up border border-green-300">
                          Resolved
                          {selectedLog.resolvedAt && ` on ${formatDate(selectedLog.resolvedAt)}`}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-app-trend-down/10 text-app-trend-down border border-app-trend-down">
                          Unresolved
                        </span>
                      )}
                    </p>
                  </div>
                  {selectedLog.errorCode && (
                    <div>
                      <label className="block text-sm font-medium text-app-text">Error Code</label>
                      <p className="mt-1 text-sm dashboard-stat-value font-mono">{selectedLog.errorCode}</p>
                    </div>
                  )}
                  {selectedLog.userId && (
                    <div>
                      <label className="block text-sm font-medium text-app-text">User ID</label>
                      <p className="mt-1 text-sm dashboard-stat-value">{selectedLog.userId}</p>
                    </div>
                  )}
                  {selectedLog.url && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-app-text">URL</label>
                      <p className="mt-1 text-sm dashboard-stat-value break-all">{selectedLog.url}</p>
                    </div>
                  )}
                  {selectedLog.userAgent && (
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-app-text">User Agent</label>
                      <p className="mt-1 text-sm dashboard-stat-value break-all">{selectedLog.userAgent}</p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-app-text">Message</label>
                  <p className="mt-1 text-sm dashboard-stat-value whitespace-pre-wrap break-words">{selectedLog.message}</p>
                </div>
                {selectedLog.stack && (
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--app-text))]">Stack Trace</label>
                    <pre className="mt-1 text-xs text-[rgb(var(--app-text))] bg-[rgb(var(--app-surface))] p-3 rounded border border-[rgb(var(--app-border))] overflow-x-auto">
                      {selectedLog.stack}
                    </pre>
                  </div>
                )}
                {selectedLog.context && Object.keys(selectedLog.context).length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-[rgb(var(--app-text))]">Context</label>
                    <pre className="mt-1 text-xs text-[rgb(var(--app-text))] bg-[rgb(var(--app-surface))] p-3 rounded border border-[rgb(var(--app-border))] overflow-x-auto">
                      {JSON.stringify(selectedLog.context, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[rgb(var(--app-border))] flex items-center justify-end gap-2 flex-wrap">
              {copyFeedback && (
                <span className="text-sm text-[rgb(var(--app-text-muted))] self-center mr-2" aria-live="polite">
                  {copyFeedback}
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyForLLM}
                className="admin-btn-secondary px-4 py-2"
              >
                Copy for LLM
              </button>
              {!selectedLog.resolved && (
                <button
                  onClick={() => handleResolve(selectedLog.id)}
                  className="admin-btn-primary px-4 py-2"
                >
                  Mark as Resolved
                </button>
              )}
              <button
                onClick={() => {
                  if (copyFeedbackTimeoutRef.current) {
                    clearTimeout(copyFeedbackTimeoutRef.current)
                    copyFeedbackTimeoutRef.current = null
                  }
                  setCopyFeedback(null)
                  setShowDetailModal(false)
                  setSelectedLog(null)
                }}
                className="admin-btn-secondary px-4 py-2"
              >
                Close
              </button>
            </div>
        </Modal>
      )}

      {/* Cleanup Modal */}
      <Modal
        isOpen={showCleanupModal}
        onClose={() => setShowCleanupModal(false)}
        layout="centered"
        showCloseButton={false}
        backdropClassName="fixed inset-0 bg-black/50 backdrop-blur-sm admin-modal-overlay"
        panelClassName="admin-card max-w-md w-full border border-[rgb(var(--app-border))]"
        contentClassName="p-0"
      >
            <div className="px-6 py-4 border-b border-[rgb(var(--app-border))]">
              <h2 className="text-xl font-semibold">Cleanup Old Error Logs</h2>
            </div>
            <div className="px-6 py-4">
              <p className="text-sm text-[rgb(var(--app-text-muted))] mb-4">
                This will delete error logs older than the retention period (default: 90 days).
                You can optionally specify a custom retention period.
              </p>
              <div className="mb-4">
                <label className="block text-sm font-medium text-[rgb(var(--app-text))] mb-1">
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
            <div className="px-6 py-4 border-t border-[rgb(var(--app-border))] flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCleanupModal(false)}
                disabled={cleanupLoading}
                className="admin-btn-secondary px-4 py-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.getElementById('retention-days') as HTMLInputElement
                  const days = input.value ? parseInt(input.value, 10) : undefined
                  if (days && (isNaN(days) || days < 1)) {
                    setMutationError('Retention days must be a positive number')
                    return
                  }
                  handleCleanup(days)
                }}
                disabled={cleanupLoading}
                className="px-4 py-2 bg-app-trend-down text-white rounded-lg hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {cleanupLoading ? 'Cleaning up...' : 'Cleanup'}
              </button>
            </div>
      </Modal>
      </div>
    </div>
  )
}
