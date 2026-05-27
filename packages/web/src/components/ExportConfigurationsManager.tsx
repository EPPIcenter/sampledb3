import { useState, useEffect, useRef } from 'react'
import { exportConfigurationsApi, settingsApi } from '../lib/api/settings';
import type { ExportConfigurations, ExportConfiguration } from '../lib/api/settings';
import {
  EXPORT_ENTRY_COLUMNS,
  DEFAULT_EXPORT_COLUMN_KEYS,
  getExportColumnLabel,
} from '../lib/export-columns'
import { useUser } from '../contexts/UserContext'
import InfoTooltip from './InfoTooltip'

interface ExportConfigurationsManagerProps {
  data: ExportConfigurations | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function ExportConfigurationsManager({
  data,
  onSave,
  onError,
  onSuccess,
}: ExportConfigurationsManagerProps) {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const [sharedConfigurations, setSharedConfigurations] = useState<ExportConfiguration[]>([])
  const [personalConfigurations, setPersonalConfigurations] = useState<ExportConfiguration[]>([])
  const [activeTab, setActiveTab] = useState<'shared' | 'personal'>('shared')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingType, setEditingType] = useState<'shared' | 'personal' | null>(null)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigColumns, setNewConfigColumns] = useState<string[]>(DEFAULT_EXPORT_COLUMN_KEYS)
  const [showNewForm, setShowNewForm] = useState(false)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null)
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const autoScrollIntervalRef = useRef<number | null>(null)
  const mouseYRef = useRef<number>(0)

  // Load shared and personal configs separately
  useEffect(() => {
    const loadConfigs = async () => {
      setLoading(true)
      try {
        const [sharedRes, personalRes] = await Promise.all([
          settingsApi.getValue('export_configurations', { scope: 'shared' }),
          settingsApi
            .getValue('export_configurations', { scope: 'personal' })
            .catch(() => ({ configurations: [] })),
        ])
        setSharedConfigurations(sharedRes?.configurations ?? [])
        setPersonalConfigurations(personalRes?.configurations ?? [])
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load configurations')
      } finally {
        setLoading(false)
      }
    }
    loadConfigs()
  }, [])

  const handleAdd = async () => {
    if (!newConfigName.trim()) {
      setError('Configuration name is required')
      return
    }
    
    const currentConfigs = activeTab === 'shared' ? sharedConfigurations : personalConfigurations
    if (currentConfigs.some(c => c.name === newConfigName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (newConfigColumns.length === 0) {
      setError('At least one column must be selected')
      return
    }

    const newConfig: ExportConfiguration = {
      name: newConfigName.trim(),
      columns: [...newConfigColumns],
      isDefault: currentConfigs.length === 0, // First config is default
    }

    if (activeTab === 'personal') {
      // Save personal config immediately
      try {
        const updated = newConfig.isDefault 
          ? [...currentConfigs.map(c => ({ ...c, isDefault: false })), newConfig]
          : [...currentConfigs, newConfig]
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to create configuration')
        return
      }
    } else {
      // For shared, persist immediately (same as personal)
      try {
        const updated = newConfig.isDefault 
          ? [...currentConfigs.map(c => ({ ...c, isDefault: false })), newConfig]
          : [...currentConfigs, newConfig]
        await exportConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to create configuration')
        return
      }
    }

    setNewConfigName('')
    setNewConfigColumns(DEFAULT_EXPORT_COLUMN_KEYS)
    setShowNewForm(false)
    setError(null)
  }

  const handleEdit = (index: number, type: 'shared' | 'personal') => {
    setEditingIndex(index)
    setEditingType(type)
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const config = configs[index]
    setNewConfigName(config.name)
    setNewConfigColumns([...config.columns])
    setShowNewForm(true)
  }

  const handleUpdate = async () => {
    if (!newConfigName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (editingIndex === null || editingType === null) return

    const currentConfigs = editingType === 'shared' ? sharedConfigurations : personalConfigurations
    const existingConfig = currentConfigs[editingIndex]
    const nameChanged = newConfigName.trim() !== existingConfig.name
    if (nameChanged && currentConfigs.some((c, i) => i !== editingIndex && c.name === newConfigName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (newConfigColumns.length === 0) {
      setError('At least one column must be selected')
      return
    }

    const updated = [...currentConfigs]
    updated[editingIndex] = {
      name: newConfigName.trim(),
      columns: [...newConfigColumns],
      isDefault: existingConfig.isDefault,
    }

    if (editingType === 'personal') {
      try {
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to update configuration')
        return
      }
    } else {
      try {
        await exportConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to update configuration')
        return
      }
    }

    setEditingIndex(null)
    setEditingType(null)
    setNewConfigName('')
    setNewConfigColumns(DEFAULT_EXPORT_COLUMN_KEYS)
    setShowNewForm(false)
    setError(null)
  }

  const handleDelete = async (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const configName = configs[index].name
    
    if (!window.confirm(`Are you sure you want to delete "${configName}"?`)) {
      return
    }

    const updated = configs.filter((_, i) => i !== index)
    if (configs[index].isDefault && updated.length > 0) {
      updated[0].isDefault = true
    }

    if (type === 'personal') {
      try {
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete configuration')
      }
    } else {
      try {
        await exportConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete configuration')
      }
    }
  }

  const handleSetDefault = async (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const updated = configs.map((c, i) => ({
      ...c,
      isDefault: i === index,
    }))

    if (type === 'shared') {
      try {
        await exportConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to set default configuration')
      }
    } else {
      try {
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to set default configuration')
      }
    }
  }

  const handleToggleColumn = (columnKey: string) => {
    if (newConfigColumns.includes(columnKey)) {
      if (newConfigColumns.length > 1) {
        setNewConfigColumns(newConfigColumns.filter(col => col !== columnKey))
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
    const scrollThreshold = 50 // pixels from edge to trigger scroll
    const scrollSpeed = 10 // pixels per interval

    const checkAndScroll = () => {
      if (!scrollContainerRef.current || draggedIndex === null) {
        stopAutoScroll()
        return
      }

      const rect = scrollContainerRef.current.getBoundingClientRect()
      const mouseY = mouseYRef.current

      // Check if mouse is near top edge
      if (mouseY - rect.top < scrollThreshold && container.scrollTop > 0) {
        container.scrollTop = Math.max(0, container.scrollTop - scrollSpeed)
      }
      // Check if mouse is near bottom edge
      else if (rect.bottom - mouseY < scrollThreshold && 
               container.scrollTop < container.scrollHeight - container.clientHeight) {
        container.scrollTop = Math.min(
          container.scrollHeight - container.clientHeight,
          container.scrollTop + scrollSpeed
        )
      }
      // If mouse is not near edges, don't scroll but keep checking
    }

    // Start auto-scroll interval
    autoScrollIntervalRef.current = window.setInterval(checkAndScroll, 16) // ~60fps
  }

  const stopAutoScroll = () => {
    if (autoScrollIntervalRef.current !== null) {
      clearInterval(autoScrollIntervalRef.current)
      autoScrollIntervalRef.current = null
    }
  }

  const handleDragStart = (index: number) => {
    setDraggedIndex(index)
  }

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    
    // Update mouse position for auto-scroll
    mouseYRef.current = e.clientY
    
    // Start auto-scroll if near edges
    startAutoScroll()
    
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index)
    }
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
      // Adjust drop index: if dragging down, the target index shifts down by 1 after removal
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoScrollIntervalRef.current !== null) {
        clearInterval(autoScrollIntervalRef.current)
        autoScrollIntervalRef.current = null
      }
    }
  }, [])

  const getColumnLabel = (key: string) => {
    return getExportColumnLabel(key)
  }

  const currentConfigurations = activeTab === 'shared' ? sharedConfigurations : personalConfigurations

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-app-trend-down/10 p-2">
          <p className="text-xs font-medium text-app-trend-down">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-app-text">
            Export Configurations
          </label>
          <InfoTooltip text="Create and manage multiple named export configurations. Shared configurations are available to all users. Personal configurations are only visible to you. Each configuration defines which columns appear in exports and their order." />
        </div>
        {activeTab === 'personal' && (
          <button
            type="button"
            onClick={() => {
              setShowNewForm(true)
              setEditingIndex(null)
              setEditingType(null)
              setNewConfigName('')
              setNewConfigColumns(DEFAULT_EXPORT_COLUMN_KEYS)
              setError(null)
            }}
            className="text-sm text-app-accent hover:text-app-accent-hover"
          >
            + Add Personal Configuration
          </button>
        )}
        {activeTab === 'shared' && isAdmin && (
          <button
            type="button"
            onClick={() => {
              setShowNewForm(true)
              setEditingIndex(null)
              setEditingType(null)
              setNewConfigName('')
              setNewConfigColumns(DEFAULT_EXPORT_COLUMN_KEYS)
              setError(null)
            }}
            className="text-sm text-app-accent hover:text-app-accent-hover"
          >
            + Add Shared Configuration
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-app-border mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('shared')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'shared'
              ? 'border-app-accent text-app-accent'
              : 'border-transparent text-app-text-muted hover:text-app-text'
          }`}
        >
          Shared Configurations
          {sharedConfigurations.length > 0 && (
            <span className="ml-2 text-xs bg-app-surface text-app-text-muted px-2 py-0.5 rounded-full">
              {sharedConfigurations.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'personal'
              ? 'border-app-accent text-app-accent'
              : 'border-transparent text-app-text-muted hover:text-app-text'
          }`}
        >
          My Configurations
          {personalConfigurations.length > 0 && (
            <span className="ml-2 text-xs bg-app-accent-muted text-app-accent-hover px-2 py-0.5 rounded-full">
              {personalConfigurations.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-app-text-muted">Loading configurations...</div>
      ) : (
        <>
          {/* Existing Configurations */}
          <div className="space-y-2">
            {currentConfigurations.map((config, index) => (
              <div
                key={index}
                className={`border rounded-lg p-3 ${
                  activeTab === 'shared' 
                    ? 'border-app-border bg-app-surface' 
                    : 'border-app-accent bg-app-accent-muted'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeTab === 'shared' && (
                      <span className="text-xs font-medium text-app-text-muted bg-app-surface px-2 py-1 rounded">
                        Shared
                      </span>
                    )}
                    {activeTab === 'personal' && (
                      <span className="text-xs font-medium text-app-accent-hover bg-app-accent-muted px-2 py-1 rounded">
                        Personal
                      </span>
                    )}
                    {config.isDefault && (
                      <span className="text-xs font-medium text-app-accent-hover bg-app-accent-muted px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                    <span className="text-sm font-medium text-app-text">{config.name}</span>
                    <span className="text-xs text-app-text-muted">
                      ({config.columns.length} column{config.columns.length !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!config.isDefault && (
                      <button
                        type="button"
                        onClick={async () => {
                          await handleSetDefault(index, activeTab)
                        }}
                        className="text-xs text-app-accent hover:text-app-accent-hover"
                      >
                        Set as Default
                      </button>
                    )}
                    {activeTab === 'shared' && isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(index, 'shared')}
                          className="text-xs text-app-text-muted hover:text-app-text"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'shared')}
                          className="text-xs text-app-trend-down hover:text-app-trend-down/80"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {activeTab === 'personal' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(index, 'personal')}
                          className="text-xs text-app-text-muted hover:text-app-text"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'personal')}
                          className="text-xs text-app-trend-down hover:text-app-trend-down/80"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {activeTab === 'shared' && !isAdmin && (
                      <span className="text-xs text-app-text-muted italic">Read-only</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {currentConfigurations.length === 0 && !showNewForm && (
              <div className="text-sm text-app-text-muted italic text-center py-4">
                {activeTab === 'shared' 
                  ? 'No shared configurations available.'
                  : 'No personal configurations yet. Click "Add Personal Configuration" to create one.'}
              </div>
            )}
          </div>
        </>
      )}

      {/* New/Edit Form */}
      {showNewForm && (
        <div className="border border-app-border rounded-lg p-4 bg-app-surface">
          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">
              Configuration Name
            </label>
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
              placeholder="e.g., Basic Export, Detailed Export"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">
              Selected Columns (in order) - Drag to reorder
            </label>
            <div 
              ref={scrollContainerRef}
              className="border border-app-border rounded-lg p-2 bg-app-card max-h-96 overflow-y-auto"
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
                      ? 'opacity-50 bg-app-surface'
                      : dragOverIndex === idx
                      ? 'bg-app-accent-muted border-2 border-app-accent border-dashed'
                      : 'hover:bg-app-surface'
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <svg
                      className="w-4 h-4 text-app-text-muted"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 8h16M4 16h16"
                      />
                    </svg>
                    <span className="text-xs text-app-text-muted w-6">{idx + 1}.</span>
                    <span className="text-sm text-app-text">{getColumnLabel(columnKey)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    {idx > 0 && (
                      <button
                        type="button"
                        onClick={() => handleMoveColumn(idx, idx - 1)}
                        className="p-1 text-app-text-muted hover:text-app-text"
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
                        className="p-1 text-app-text-muted hover:text-app-text"
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
                      className="p-1 text-app-trend-down hover:text-app-trend-down/80"
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
            <label className="block text-sm font-medium text-app-text mb-2">
              Available Columns (not selected)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-app-border rounded p-2 bg-app-card">
              {EXPORT_ENTRY_COLUMNS.filter(col => !newConfigColumns.includes(col.key)).map(column => (
                <button
                  key={column.key}
                  type="button"
                  onClick={() => handleToggleColumn(column.key)}
                  className="text-left p-2 text-sm border border-app-border rounded hover:bg-app-accent-muted hover:border-app-accent transition-colors"
                >
                  <div className="font-medium text-app-text">{column.label}</div>
                  <div className="text-xs text-app-text-muted">{column.key}</div>
                </button>
              ))}
              {EXPORT_ENTRY_COLUMNS.filter(col => !newConfigColumns.includes(col.key)).length === 0 && (
                <div className="text-xs text-app-text-muted italic">All columns are selected</div>
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
                setNewConfigColumns(DEFAULT_EXPORT_COLUMN_KEYS)
                setError(null)
              }}
              className="px-4 py-2 text-sm font-medium text-app-text bg-app-card border border-app-border rounded-lg hover:bg-app-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={editingIndex !== null ? handleUpdate : handleAdd}
              className="px-4 py-2 text-sm font-medium text-white bg-app-accent rounded-lg hover:bg-app-accent-hover"
            >
              {editingIndex !== null ? 'Save' : activeTab === 'personal' ? 'Create' : 'Add'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

