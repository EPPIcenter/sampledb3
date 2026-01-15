import { useState, useEffect, useRef } from 'react'
import { exportConfigurationsApi, type ExportConfigurations, type ExportConfiguration } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import InfoTooltip from './InfoTooltip'

interface ExportConfigurationsManagerProps {
  data: ExportConfigurations | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

// All available export columns with their display names
const AVAILABLE_COLUMNS = [
  { key: 'container_id', label: 'Container ID' },
  { key: 'container_type', label: 'Container Type' },
  { key: 'barcode', label: 'Barcode' },
  { key: 'position', label: 'Position' },
  { key: 'label', label: 'Container Name' },
  { key: 'collection_name', label: 'Collection Name' },
  { key: 'status', label: 'Status' },
  { key: 'comment', label: 'Comment' },
  { key: 'specimen_id', label: 'Specimen ID' },
  { key: 'specimen_type', label: 'Specimen Type' },
  { key: 'collection_date', label: 'Collection Date' },
  { key: 'subject_id', label: 'Subject ID' },
  { key: 'subject_name', label: 'Subject Name' },
  { key: 'control_batch_id', label: 'Control Batch ID' },
  { key: 'control_batch_name', label: 'Control Batch Name' },
  { key: 'control_definition_name', label: 'Control Definition Name' },
  { key: 'control_type', label: 'Control Type' },
  { key: 'target_density', label: 'Target Density' },
  { key: 'target_density_unit', label: 'Target Density Unit' },
  { key: 'strain_composition', label: 'Strain Composition' },
  { key: 'study_id', label: 'Study ID' },
  { key: 'study_code', label: 'Study Code' },
  { key: 'study_title', label: 'Study Title' },
  { key: 'study_lead_person', label: 'Study Lead Person' },
  { key: 'location_path', label: 'Location Path' },
  { key: 'created', label: 'Created' },
  { key: 'last_updated', label: 'Last Updated' },
]

// Default column order (all columns)
const DEFAULT_COLUMNS = AVAILABLE_COLUMNS.map(col => col.key)

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
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingType, setEditingType] = useState<'shared' | 'personal' | null>(null)
  const [newConfigName, setNewConfigName] = useState('')
  const [newConfigColumns, setNewConfigColumns] = useState<string[]>(DEFAULT_COLUMNS)
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
          exportConfigurationsApi.getShared(),
          exportConfigurationsApi.getPersonal().catch(() => ({ data: { configurations: [] } })),
        ])
        setSharedConfigurations(sharedRes.data?.configurations || [])
        setPersonalConfigurations(personalRes.data?.configurations || [])
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to load configurations')
      } finally {
        setLoading(false)
      }
    }
    loadConfigs()
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (activeTab === 'shared' && isAdmin) {
        // Save shared configs (system-wide)
        await exportConfigurationsApi.update({ configurations: sharedConfigurations }, null)
      } else {
        // Save personal configs
        await exportConfigurationsApi.updatePersonal({ configurations: personalConfigurations })
      }
      onSuccess?.()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to save export configurations'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setSaving(false)
    }
  }

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
      // For shared, just update local state (admin will save)
      if (newConfig.isDefault) {
        const updated = currentConfigs.map(c => ({ ...c, isDefault: false }))
        setSharedConfigurations([...updated, newConfig])
      } else {
        setSharedConfigurations([...currentConfigs, newConfig])
      }
    }

    setNewConfigName('')
    setNewConfigColumns(DEFAULT_COLUMNS)
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
      // Save personal config immediately
      try {
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to update configuration')
        return
      }
    } else {
      // For shared, just update local state (admin will save)
      setSharedConfigurations(updated)
    }

    setEditingIndex(null)
    setEditingType(null)
    setNewConfigName('')
    setNewConfigColumns(DEFAULT_COLUMNS)
    setShowNewForm(false)
    setError(null)
  }

  const handleDelete = async (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const configName = configs[index].name
    
    if (!window.confirm(`Are you sure you want to delete "${configName}"?`)) {
      return
    }

    if (type === 'personal') {
      // Delete personal config immediately
      try {
        const updated = configs.filter((_, i) => i !== index)
        // If we deleted the default, make the first one default
        if (configs[index].isDefault && updated.length > 0) {
          updated[0].isDefault = true
        }
        await exportConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete configuration')
      }
    } else {
      // For shared, just update local state (admin will save)
      const updated = configs.filter((_, i) => i !== index)
      if (configs[index].isDefault && updated.length > 0) {
        updated[0].isDefault = true
      }
      setSharedConfigurations(updated)
    }
  }

  const handleSetDefault = (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const updated = configs.map((c, i) => ({
      ...c,
      isDefault: i === index,
    }))
    
    if (type === 'shared') {
      setSharedConfigurations(updated)
    } else {
      setPersonalConfigurations(updated)
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
    return AVAILABLE_COLUMNS.find(col => col.key === key)?.label || key
  }

  const hasUnsavedChanges = () => {
    if (activeTab === 'shared' && isAdmin) {
      // For shared configs, check if there are unsaved changes
      // This is a simplified check - in production you'd want to compare with original loaded state
      return false // Will be handled by save button visibility
    }
    return false // Personal configs are saved immediately
  }

  const currentConfigurations = activeTab === 'shared' ? sharedConfigurations : personalConfigurations

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">{error}</p>
        </div>
      )}

      {hasUnsavedChanges() && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium text-yellow-800">
              You have unsaved changes. Don't forget to click "Save Changes" to apply your configuration.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-700">
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
              setNewConfigColumns(DEFAULT_COLUMNS)
              setError(null)
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
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
              setNewConfigColumns(DEFAULT_COLUMNS)
              setError(null)
            }}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            + Add Shared Configuration
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200 mb-4">
        <button
          type="button"
          onClick={() => setActiveTab('shared')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'shared'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Shared Configurations
          {sharedConfigurations.length > 0 && (
            <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
              {sharedConfigurations.length}
            </span>
          )}
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('personal')}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'personal'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          My Configurations
          {personalConfigurations.length > 0 && (
            <span className="ml-2 text-xs bg-blue-100 text-blue-600 px-2 py-0.5 rounded-full">
              {personalConfigurations.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Loading configurations...</div>
      ) : (
        <>
          {/* Existing Configurations */}
          <div className="space-y-2">
            {currentConfigurations.map((config, index) => (
              <div
                key={index}
                className={`border rounded-lg p-3 ${
                  activeTab === 'shared' 
                    ? 'border-gray-200 bg-gray-50' 
                    : 'border-blue-200 bg-blue-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {activeTab === 'shared' && (
                      <span className="text-xs font-medium text-gray-600 bg-gray-200 px-2 py-1 rounded">
                        Shared
                      </span>
                    )}
                    {activeTab === 'personal' && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-100 px-2 py-1 rounded">
                        Personal
                      </span>
                    )}
                    {config.isDefault && (
                      <span className="text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded">
                        Default
                      </span>
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
                        onClick={() => handleSetDefault(index, activeTab)}
                        className="text-xs text-blue-600 hover:text-blue-800"
                      >
                        Set as Default
                      </button>
                    )}
                    {activeTab === 'shared' && isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(index, 'shared')}
                          className="text-xs text-gray-600 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'shared')}
                          className="text-xs text-red-600 hover:text-red-800"
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
                          className="text-xs text-gray-600 hover:text-gray-800"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'personal')}
                          className="text-xs text-red-600 hover:text-red-800"
                        >
                          Delete
                        </button>
                      </>
                    )}
                    {activeTab === 'shared' && !isAdmin && (
                      <span className="text-xs text-gray-400 italic">Read-only</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
            {currentConfigurations.length === 0 && !showNewForm && (
              <div className="text-sm text-gray-500 italic text-center py-4">
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
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Configuration Name
            </label>
            <input
              type="text"
              value={newConfigName}
              onChange={(e) => setNewConfigName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Basic Export, Detailed Export"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Selected Columns (in order) - Drag to reorder
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
                    <svg
                      className="w-4 h-4 text-gray-400"
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
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Available Columns (not selected)
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded p-2 bg-white">
              {AVAILABLE_COLUMNS.filter(col => !newConfigColumns.includes(col.key)).map(column => (
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
              {AVAILABLE_COLUMNS.filter(col => !newConfigColumns.includes(col.key)).length === 0 && (
                <div className="text-xs text-gray-500 italic">All columns are selected</div>
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
                setNewConfigColumns(DEFAULT_COLUMNS)
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
              {editingIndex !== null ? 'Update' : activeTab === 'personal' ? 'Create' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Save Button - Only for shared configs (admin) */}
      {activeTab === 'shared' && isAdmin && sharedConfigurations.length > 0 && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Shared Configurations'}
          </button>
        </div>
      )}
    </div>
  )
}

