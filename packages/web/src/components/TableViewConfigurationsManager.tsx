import { useState, useEffect, useRef } from 'react'
import {
  tableViewConfigurationsApi,
  type TableViewConfigurations,
  type TableViewConfiguration,
} from '../lib/api'
import {
  EXPORT_ENTRY_COLUMNS,
  DEFAULT_TABLE_VIEW_COLUMN_KEYS,
  getExportColumnLabel,
} from '../lib/export-columns'
import InfoTooltip from './InfoTooltip'

interface TableViewConfigurationsManagerProps {
  data: TableViewConfigurations | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function TableViewConfigurationsManager({
  data,
  onSave,
  onError,
  onSuccess,
}: TableViewConfigurationsManagerProps) {
  const [configurations, setConfigurations] = useState<TableViewConfiguration[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigColumns, setNewConfigColumns] = useState<string[]>(DEFAULT_TABLE_VIEW_COLUMN_KEYS)
  const [showNewForm, setShowNewForm] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollIntervalRef = useRef<number | null>(null)
  const mouseYRef = useRef<number>(0)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      try {
        const res = await tableViewConfigurationsApi.get()
        const configs = res.data.value.configurations ?? [] // eslint-disable-line @typescript-eslint/no-unnecessary-condition
        setConfigurations(configs)
      } catch (err: unknown) {
        const msg =
          err && typeof err === 'object' && 'response' in err
            ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
            : null
        setError(msg ?? 'Failed to load table view configurations')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const handleAdd = async () => {
    if (!newConfigName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (configurations.some((c) => c.name === newConfigName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (newConfigColumns.length === 0) {
      setError('At least one column must be selected')
      return
    }
    const newConfig: TableViewConfiguration = {
      name: newConfigName.trim(),
      columns: [...newConfigColumns],
      isDefault: configurations.length === 0,
    }
    const updated = newConfig.isDefault
      ? [...configurations.map((c) => ({ ...c, isDefault: false })), newConfig]
      : [...configurations, newConfig]
    try {
      await tableViewConfigurationsApi.update({ configurations: updated })
      setConfigurations(updated)
      onSuccess?.()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg ?? 'Failed to create configuration')
      return
    }
    setNewConfigName('')
    setNewConfigColumns(DEFAULT_TABLE_VIEW_COLUMN_KEYS)
    setShowNewForm(false)
    setError(null)
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    const config = configurations[index]
    setNewConfigName(config.name)
    setNewConfigColumns([...config.columns])
    setShowNewForm(true)
  }

  const handleUpdate = async () => {
    if (!newConfigName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (editingIndex === null) return
    const existing = configurations[editingIndex]
    const nameChanged = newConfigName.trim() !== existing.name
    if (nameChanged && configurations.some((c, i) => i !== editingIndex && c.name === newConfigName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (newConfigColumns.length === 0) {
      setError('At least one column must be selected')
      return
    }
    const updated = [...configurations]
    updated[editingIndex] = {
      name: newConfigName.trim(),
      columns: [...newConfigColumns],
      isDefault: existing.isDefault,
    }
    try {
      await tableViewConfigurationsApi.update({ configurations: updated })
      setConfigurations(updated)
      onSuccess?.()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg ?? 'Failed to update configuration')
      return
    }
    setEditingIndex(null)
    setNewConfigName('')
    setNewConfigColumns(DEFAULT_TABLE_VIEW_COLUMN_KEYS)
    setShowNewForm(false)
    setError(null)
  }

  const handleDelete = async (index: number) => {
    const configName = configurations[index].name
    if (!window.confirm(`Are you sure you want to delete "${configName}"?`)) return
    const updated = configurations.filter((_, i) => i !== index)
    if (configurations[index].isDefault && updated.length > 0) {
      updated[0].isDefault = true
    }
    try {
      await tableViewConfigurationsApi.update({ configurations: updated })
      setConfigurations(updated)
      onSuccess?.()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg ?? 'Failed to delete configuration')
    }
  }

  const handleSetDefault = async (index: number) => {
    const updated = configurations.map((c, i) => ({ ...c, isDefault: i === index }))
    try {
      await tableViewConfigurationsApi.update({ configurations: updated })
      setConfigurations(updated)
      onSuccess?.()
    } catch (err: unknown) {
      const msg =
        err && typeof err === 'object' && 'response' in err
          ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
          : null
      setError(msg ?? 'Failed to set default configuration')
    }
  }

  const handleToggleColumn = (columnKey: string) => {
    if (newConfigColumns.includes(columnKey)) {
      if (newConfigColumns.length > 1) {
        setNewConfigColumns(newConfigColumns.filter((col) => col !== columnKey))
      } else {
        setError('At least one column must be selected')
        setTimeout(() => setError(null), 3000)
      }
    } else {
      setNewConfigColumns([...newConfigColumns, columnKey])
    }
  }

  const handleMoveColumn = (fromIndex: number, toIndex: number) => {
    const updated = [...newConfigColumns]
    const [removed] = updated.splice(fromIndex, 1)
    updated.splice(toIndex, 0, removed)
    setNewConfigColumns(updated)
  }

  const startAutoScroll = () => {
    if (!scrollContainerRef.current || autoScrollIntervalRef.current !== null) return
    const container = scrollContainerRef.current
    const scrollThreshold = 50
    const scrollSpeed = 10
    const checkAndScroll = () => {
      if (!scrollContainerRef.current || draggedIndex === null) {
        stopAutoScroll()
        return
      }
      const rect = scrollContainerRef.current.getBoundingClientRect()
      const mouseY = mouseYRef.current
      if (mouseY - rect.top < scrollThreshold && container.scrollTop > 0) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed)
      } else if (
        rect.bottom - mouseY < scrollThreshold &&
        container.scrollTop < container.scrollHeight - container.clientHeight
      ) {
        container.scrollTop = Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + scrollSpeed
        )
      }
    }
    autoScrollIntervalRef.current = window.setInterval(checkAndScroll, 16)
  }

  const stopAutoScroll = () => {
    if (autoScrollIntervalRef.current !== null) {
      clearInterval(autoScrollIntervalRef.current)
      autoScrollIntervalRef.current = null
    }
  }

  const handleDragStart = (index: number) => setDraggedIndex(index)
  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    mouseYRef.current = e.clientY
    startAutoScroll()
    if (draggedIndex !== null && draggedIndex !== index) setDragOverIndex(index)
  }
  const handleDragLeave = () => {
    setDragOverIndex(null)
    stopAutoScroll()
  }
  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault()
    e.stopPropagation()
    if (draggedIndex !== null && draggedIndex !== dropIndex) {
      const updated = [...newConfigColumns]
      const [removed] = updated.splice(draggedIndex, 1)
      const adjustedDropIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex
      updated.splice(adjustedDropIndex, 0, removed)
      setNewConfigColumns(updated)
    }
    setDraggedIndex(null)
    setDragOverIndex(null)
  }
  const handleDragEnd = () => {
    stopAutoScroll()
    setDraggedIndex(null)
    setDragOverIndex(null)
  }

  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current !== null) {
        clearInterval(autoScrollIntervalRef.current)
        autoScrollIntervalRef.current = null
      }
    }
  }, [])

  const getColumnLabel = (key: string) => getExportColumnLabel(key)

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-700">Table view configurations</label>
          <InfoTooltip text="Presets for which columns appear in collection table views (plates, boxes, bags, sheets). The default preset is used when no selection has been made. Table CSV download exports the current view columns." />
        </div>
        <button
          type="button"
          onClick={() => {
            setShowNewForm(true)
            setEditingIndex(null)
            setNewConfigName('')
            setNewConfigColumns(DEFAULT_TABLE_VIEW_COLUMN_KEYS)
            setError(null)
          }}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add configuration
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading configurations...</div>
      ) : (
        <>
          <div className="space-y-2">
            {configurations.map((config, index) => (
              <div key={config.name} className="border border-gray-200 rounded-lg p-3 bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {config.isDefault && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">Default</span>
                    )}
                    <span className="text-sm font-medium text-gray-900">{config.name}</span>
                    <span className="text-xs text-gray-500">
                      ({config.columns.length} column{config.columns.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!config.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(index)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Set as default
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleEdit(index)}
                      className="text-xs text-gray-600 hover:text-gray-800"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(index)}
                      className="text-xs text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {configurations.length === 0 && !showNewForm && (
              <div className="text-sm text-gray-500 italic text-center py-4">
                No table view configurations. Add one to control which columns appear in collection table views.
              </div>
            )}
          </div>
        </>
      )}

      {showNewForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Configuration name</label>
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Default, Browse"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selected columns (in order) – drag to reorder
            </label>
            <div
              ref={scrollContainerRef}
              className="border border-gray-200 rounded-lg p-2 bg-white max-h-96 overflow-y-auto"
            >
              {newConfigColumns.map((columnKey, idx) => (
                <div
                  key={columnKey}
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={handleDragLeave}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={handleDragEnd}
                  className={`flex items-center justify-between p-2 rounded cursor-move transition-colors ${
                    draggedIndex === idx
                      ? 'opacity-50 bg-gray-100'
                      : dragOverIndex === idx
                        ? 'bg-blue-50 border-2 border-blue-300 border-dashed'
                        : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <svg className="w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                    </svg>
                    <span className="text-xs text-gray-500 w-6">{idx + 1}.</span>
                    <span className="text-sm text-gray-700">{getColumnLabel(columnKey)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveColumn(idx, idx - 1)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Move up"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </button>
                    )}
                    {idx < newConfigColumns.length - 1 && (
                      <button
                        type="button"
                        onClick={() => handleMoveColumn(idx, idx + 1)}
                        className="p-1 text-gray-400 hover:text-gray-600"
                        title="Move down"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleToggleColumn(columnKey)}
                      className="p-1 text-red-400 hover:text-red-600"
                      title="Remove"
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Available columns (not selected)</label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
              {EXPORT_ENTRY_COLUMNS.filter((col) => !newConfigColumns.includes(col.key)).map((column) => (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => handleToggleColumn(column.key)}
                  className="text-left p-2 text-sm border border-gray-200 rounded hover:bg-blue-50 hover:border-blue-300 transition-colors"
                >
                  <div className="font-medium text-gray-700">{column.label}</div>
                  <div className="text-xs text-gray-400">{column.key}</div>
                </button>
              ))}
              {EXPORT_ENTRY_COLUMNS.filter((col) => !newConfigColumns.includes(col.key)).length === 0 && (
                <div className="text-xs text-gray-500 italic">All columns selected</div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowNewForm(false)
                setEditingIndex(null)
                setNewConfigName('')
                setNewConfigColumns(DEFAULT_TABLE_VIEW_COLUMN_KEYS)
                setError(null)
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={editingIndex !== null ? handleUpdate : handleAdd}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              {editingIndex !== null ? 'Save' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
