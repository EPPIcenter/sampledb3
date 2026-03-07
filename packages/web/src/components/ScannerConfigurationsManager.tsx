import { useState, useEffect } from 'react'
import { scannerConfigurationsApi, type ScannerConfigurations, type ScannerConfiguration } from '../lib/api'
import { useUser } from '../contexts/UserContext'
import InfoTooltip from './InfoTooltip'

interface ScannerConfigurationsManagerProps {
  data: ScannerConfigurations | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function ScannerConfigurationsManager({
  data,
  onSave,
  onError,
  onSuccess,
}: ScannerConfigurationsManagerProps) {
  const { user } = useUser()
  const isAdmin = user?.role === 'admin'
  const [sharedConfigurations, setSharedConfigurations] = useState<ScannerConfiguration[]>([])
  const [personalConfigurations, setPersonalConfigurations] = useState<ScannerConfiguration[]>([])
  const [activeTab, setActiveTab] = useState<'shared' | 'personal'>('shared')
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [editingType, setEditingType] = useState<'shared' | 'personal' | null>(null)
  const [showNewForm, setShowNewForm] = useState(false)
  
  // Form state
  const [formName, setFormName] = useState('')
  const [formBarcodeColumn, setFormBarcodeColumn] = useState('')
  const [formPositionType, setFormPositionType] = useState<'single' | 'combined'>('single')
  const [formPositionColumn, setFormPositionColumn] = useState('')
  const [formRowColumn, setFormRowColumn] = useState('')
  const [formColumnColumn, setFormColumnColumn] = useState('')
  const [formSkipRows, setFormSkipRows] = useState(0)
  const [formIsDefault, setFormIsDefault] = useState(false)

  // Load shared and personal configs separately
  useEffect(() => {
    const loadConfigs = async () => {
      setLoading(true)
      try {
        const [sharedRes, personalRes] = await Promise.all([
          scannerConfigurationsApi.getShared(),
          scannerConfigurationsApi.getPersonal(),
        ])
        setSharedConfigurations(sharedRes.data.configurations)
        setPersonalConfigurations(personalRes.data.configurations)
      } catch (err: any) {
        setError(err.response?.data.error || 'Failed to load configurations')
      } finally {
        setLoading(false)
      }
    }
    loadConfigs()
  }, [])

  const resetForm = () => {
    setFormName('')
    setFormBarcodeColumn('')
    setFormPositionType('single')
    setFormPositionColumn('')
    setFormRowColumn('')
    setFormColumnColumn('')
    setFormSkipRows(0)
    setFormIsDefault(false)
    setEditingIndex(null)
    setShowNewForm(false)
    setError(null)
  }

  const handleAdd = async () => {
    if (!formName.trim()) {
      setError('Configuration name is required')
      return
    }
    
    const currentConfigs = activeTab === 'shared' ? sharedConfigurations : personalConfigurations
    if (currentConfigs.some(c => c.name === formName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (!formBarcodeColumn.trim()) {
      setError('Barcode column is required')
      return
    }
    if (formPositionType === 'single' && !formPositionColumn.trim()) {
      setError('Position column is required for single position type')
      return
    }
    if (formPositionType === 'combined' && (!formRowColumn.trim() || !formColumnColumn.trim())) {
      setError('Row and column columns are required for combined position type')
      return
    }

    const newConfig: ScannerConfiguration = {
      id: `config-${Date.now()}`,
      name: formName.trim(),
      barcodeColumn: formBarcodeColumn.trim(),
      positionType: formPositionType,
      positionColumn: formPositionType === 'single' ? formPositionColumn.trim() : undefined,
      rowColumn: formPositionType === 'combined' ? formRowColumn.trim() : undefined,
      columnColumn: formPositionType === 'combined' ? formColumnColumn.trim() : undefined,
      skipRows: formSkipRows,
      isDefault: formIsDefault || currentConfigs.length === 0,
    }

    if (activeTab === 'personal') {
      // Save personal config immediately
      setSaving(true)
      setError(null)
      try {
        let updated = [...currentConfigs]
        if (newConfig.isDefault) {
          updated = updated.map(c => ({ ...c, isDefault: false }))
        }
        updated.push(newConfig)
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: unknown) {
        setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create configuration')
        onError?.((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create configuration')
        return
      } finally {
        setSaving(false)
      }
    } else {
      // For shared, persist immediately
      let updated = [...currentConfigs]
      if (newConfig.isDefault) {
        updated = updated.map(c => ({ ...c, isDefault: false }))
      }
      updated.push(newConfig)
      setSaving(true)
      setError(null)
      try {
        await scannerConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
        resetForm()
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to create configuration'
        setError(errorMsg)
        onError?.(errorMsg)
      } finally {
        setSaving(false)
      }
      return
    }

    resetForm()
  }

  const handleEdit = (index: number, type: 'shared' | 'personal') => {
    setEditingIndex(index)
    setEditingType(type)
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const config = configs[index]
    setFormName(config.name)
    setFormBarcodeColumn(config.barcodeColumn)
    setFormPositionType(config.positionType)
    setFormPositionColumn(config.positionColumn || '')
    setFormRowColumn(config.rowColumn || '')
    setFormColumnColumn(config.columnColumn || '')
    setFormSkipRows(config.skipRows)
    setFormIsDefault(config.isDefault || false)
    setShowNewForm(true)
  }

  const handleUpdate = async () => {
    if (!formName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (editingIndex === null || editingType === null) return

    const currentConfigs = editingType === 'shared' ? sharedConfigurations : personalConfigurations
    const existingConfig = currentConfigs[editingIndex]
    const nameChanged = formName.trim() !== existingConfig.name
    if (nameChanged && currentConfigs.some((c, i) => i !== editingIndex && c.name === formName.trim())) {
      setError('A configuration with this name already exists')
      return
    }
    if (!formBarcodeColumn.trim()) {
      setError('Barcode column is required')
      return
    }
    if (formPositionType === 'single' && !formPositionColumn.trim()) {
      setError('Position column is required for single position type')
      return
    }
    if (formPositionType === 'combined' && (!formRowColumn.trim() || !formColumnColumn.trim())) {
      setError('Row and column columns are required for combined position type')
      return
    }

    const updated = [...currentConfigs]
    const wasDefault = existingConfig.isDefault
    
    if (formIsDefault && !wasDefault) {
      updated.forEach((c, i) => {
        if (i !== editingIndex) {
          c.isDefault = false
        }
      })
    }

    updated[editingIndex] = {
      ...existingConfig,
      name: formName.trim(),
      barcodeColumn: formBarcodeColumn.trim(),
      positionType: formPositionType,
      positionColumn: formPositionType === 'single' ? formPositionColumn.trim() : undefined,
      rowColumn: formPositionType === 'combined' ? formRowColumn.trim() : undefined,
      columnColumn: formPositionType === 'combined' ? formColumnColumn.trim() : undefined,
      skipRows: formSkipRows,
      isDefault: formIsDefault,
    }

    if (editingType === 'personal') {
      // Save personal config immediately
      setSaving(true)
      setError(null)
      try {
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: unknown) {
        setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to update configuration')
        onError?.((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to update configuration')
        return
      } finally {
        setSaving(false)
      }
    } else {
      setSaving(true)
      setError(null)
      try {
        await scannerConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
        resetForm()
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to update configuration'
        setError(errorMsg)
        onError?.(errorMsg)
        return
      } finally {
        setSaving(false)
      }
      return
    }

    resetForm()
  }

  const handleDelete = async (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const configName = configs[index].name
    
    if (!window.confirm(`Are you sure you want to delete "${configName}"?`)) {
      return
    }

    if (type === 'personal') {
      setSaving(true)
      setError(null)
      try {
        const updated = configs.filter((_, i) => i !== index)
        if (configs[index].isDefault && updated.length > 0) {
          updated[0].isDefault = true
        }
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: unknown) {
        setError((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to delete configuration')
        onError?.((err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to delete configuration')
      } finally {
        setSaving(false)
      }
    } else {
      const updated = configs.filter((_, i) => i !== index)
      if (configs[index].isDefault && updated.length > 0) {
        updated[0].isDefault = true
      }
      setSaving(true)
      setError(null)
      try {
        await scannerConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
        onSuccess?.()
      } catch (err: unknown) {
        const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to delete configuration'
        setError(errorMsg)
        onError?.(errorMsg)
      } finally {
        setSaving(false)
      }
    }
  }

  const handleSetDefault = async (index: number, type: 'shared' | 'personal') => {
    const configs = type === 'shared' ? sharedConfigurations : personalConfigurations
    const updated = configs.map((c, i) => ({
      ...c,
      isDefault: i === index,
    }))

    setSaving(true)
    setError(null)
    try {
      if (type === 'shared') {
        await scannerConfigurationsApi.update({ configurations: updated }, null)
        setSharedConfigurations(updated)
      } else {
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
      }
      onSuccess?.()
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'Failed to set default'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setSaving(false)
    }
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
            Scanner Configurations
          </label>
          <InfoTooltip text="Create and manage scanner configurations for different CSV formats. Shared configurations are available to all users. Personal configurations are only visible to you. Each configuration defines how to parse barcode and position columns from scanner output files." />
        </div>
        {activeTab === 'personal' && (
          <button
            type="button"
            onClick={() => {
              resetForm()
              setShowNewForm(true)
            }}
            disabled={saving}
            className="text-sm text-app-accent hover:text-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
          >
            + Add Personal Configuration
          </button>
        )}
        {activeTab === 'shared' && isAdmin && (
          <button
            type="button"
            onClick={() => {
              resetForm()
              setShowNewForm(true)
            }}
            disabled={saving}
            className="text-sm text-app-accent hover:text-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
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
            <span className="ml-2 text-xs bg-app-accent-muted text-app-accent px-2 py-0.5 rounded-full">
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
                key={config.id}
                className={`border rounded-lg p-3 ${
                  activeTab === 'shared' 
                    ? 'border-app-border bg-app-surface' 
                    : 'border-app-accent/50 bg-app-accent-muted'
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
                      <span className="text-xs font-medium text-app-accent bg-app-accent-muted px-2 py-1 rounded">
                        Personal
                      </span>
                    )}
                    {config.isDefault && (
                      <span className="text-xs font-medium text-app-accent bg-app-accent-muted px-2 py-1 rounded">
                        Default
                      </span>
                    )}
                    <span className="text-sm font-medium text-app-text">{config.name}</span>
                    <span className="text-xs text-app-text-muted">
                      Barcode: {config.barcodeColumn}
                      {config.positionType === 'single' && `, Position: ${config.positionColumn}`}
                      {config.positionType === 'combined' && `, Row: ${config.rowColumn}, Column: ${config.columnColumn}`}
                      {config.skipRows > 0 && `, Skip: ${config.skipRows} rows`}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {!config.isDefault && (
                      <button
                        type="button"
                        onClick={() => handleSetDefault(index, activeTab)}
                        disabled={saving}
                        className="text-xs text-app-accent hover:text-app-accent-hover disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Set as Default
                      </button>
                    )}
                    {activeTab === 'shared' && isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleEdit(index, 'shared')}
                          disabled={saving}
                          className="text-xs text-app-text-muted hover:text-app-text disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'shared')}
                          disabled={saving}
                          className="text-xs text-app-trend-down hover:text-app-trend-down disabled:opacity-50 disabled:cursor-not-allowed"
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
                          disabled={saving}
                          className="text-xs text-app-text-muted hover:text-app-text disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(index, 'personal')}
                          disabled={saving}
                          className="text-xs text-app-trend-down hover:text-app-trend-down disabled:opacity-50 disabled:cursor-not-allowed"
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
              Configuration Name *
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
              placeholder="e.g., Traxcer, VisionMate, General"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">
              Barcode Column Name *
            </label>
            <input
              type="text"
              value={formBarcodeColumn}
              onChange={(e) => setFormBarcodeColumn(e.target.value)}
              className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
              placeholder="e.g., Tube ID, TubeCode, Barcode"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">
              Position Type *
            </label>
            <div className="flex gap-4">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="single"
                  checked={formPositionType === 'single'}
                  onChange={(e) => {
                    setFormPositionType('single')
                    setFormRowColumn('')
                    setFormColumnColumn('')
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-app-text">Single Column</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="combined"
                  checked={formPositionType === 'combined'}
                  onChange={(e) => {
                    setFormPositionType('combined')
                    setFormPositionColumn('')
                  }}
                  className="mr-2"
                />
                <span className="text-sm text-app-text">Combined (Row + Column)</span>
              </label>
            </div>
          </div>

          {formPositionType === 'single' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-app-text mb-2">
                Position Column Name *
              </label>
              <input
                type="text"
                value={formPositionColumn}
                onChange={(e) => setFormPositionColumn(e.target.value)}
                className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                placeholder="e.g., Position"
              />
            </div>
          )}

          {formPositionType === 'combined' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-app-text mb-2">
                  Row Column Name *
                </label>
                <input
                  type="text"
                  value={formRowColumn}
                  onChange={(e) => setFormRowColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                  placeholder="e.g., LocationRow, Row"
                />
                <p className="text-xs text-app-text-muted mt-1">Column will be automatically zero-padded to 2 digits (01-12)</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-app-text mb-2">
                  Column Column Name *
                </label>
                <input
                  type="text"
                  value={formColumnColumn}
                  onChange={(e) => setFormColumnColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
                  placeholder="e.g., LocationColumn, Column"
                />
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-app-text mb-2">
              Skip Rows
            </label>
            <input
              type="number"
              value={formSkipRows}
              onChange={(e) => setFormSkipRows(parseInt(e.target.value) || 0)}
              min="0"
              className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-accent focus:border-app-accent"
            />
            <p className="text-xs text-app-text-muted mt-1">Number of header/metadata rows to skip at the start of the file</p>
          </div>

          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-app-text">Set as default configuration</span>
            </label>
            <p className="text-xs text-app-text-muted mt-1">Default configuration will be automatically selected when uploading files</p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-app-text bg-app-card border border-app-border rounded-lg hover:bg-app-surface disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={editingIndex !== null ? handleUpdate : handleAdd}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-app-accent rounded-lg hover:bg-app-accent-hover disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : editingIndex !== null ? 'Update' : activeTab === 'personal' ? 'Create' : 'Add'}
            </button>
          </div>
        </div>
      )}

    </div>
  )
}

