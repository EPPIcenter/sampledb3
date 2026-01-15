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
          scannerConfigurationsApi.getPersonal().catch(() => ({ data: { configurations: [] } })),
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

  const handleSave = async () => {
    setSaving(true)
    setError(null)
    try {
      if (activeTab === 'shared' && isAdmin) {
        await scannerConfigurationsApi.update({ configurations: sharedConfigurations }, null)
      } else {
        await scannerConfigurationsApi.updatePersonal({ configurations: personalConfigurations })
      }
      onSuccess?.()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to save scanner configurations'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setSaving(false)
    }
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
      try {
        let updated = [...currentConfigs]
        if (newConfig.isDefault) {
          updated = updated.map(c => ({ ...c, isDefault: false }))
        }
        updated.push(newConfig)
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to create configuration')
        return
      }
    } else {
      // For shared, just update local state
      let updated = [...currentConfigs]
      if (newConfig.isDefault) {
        updated = updated.map(c => ({ ...c, isDefault: false }))
      }
      updated.push(newConfig)
      setSharedConfigurations(updated)
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
      try {
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to update configuration')
        return
      }
    } else {
      setSharedConfigurations(updated)
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
      try {
        const updated = configs.filter((_, i) => i !== index)
        if (configs[index].isDefault && updated.length > 0) {
          updated[0].isDefault = true
        }
        await scannerConfigurationsApi.updatePersonal({ configurations: updated })
        setPersonalConfigurations(updated)
        onSuccess?.()
      } catch (err: any) {
        setError(err.response?.data?.error || 'Failed to delete configuration')
      }
    } else {
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

  const currentConfigurations = activeTab === 'shared' ? sharedConfigurations : personalConfigurations

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-md bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">{error}</p>
        </div>
      )}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <label className="text-sm font-medium text-gray-700">
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
            className="text-sm text-blue-600 hover:text-blue-800"
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
                key={config.id}
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
              Configuration Name *
            </label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Traxcer, VisionMate, General"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Barcode Column Name *
            </label>
            <input
              type="text"
              value={formBarcodeColumn}
              onChange={(e) => setFormBarcodeColumn(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="e.g., Tube ID, TubeCode, Barcode"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
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
                <span className="text-sm text-gray-700">Single Column</span>
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
                <span className="text-sm text-gray-700">Combined (Row + Column)</span>
              </label>
            </div>
          </div>

          {formPositionType === 'single' && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Position Column Name *
              </label>
              <input
                type="text"
                value={formPositionColumn}
                onChange={(e) => setFormPositionColumn(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Position"
              />
            </div>
          )}

          {formPositionType === 'combined' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Row Column Name *
                </label>
                <input
                  type="text"
                  value={formRowColumn}
                  onChange={(e) => setFormRowColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., LocationRow, Row"
                />
                <p className="text-xs text-gray-500 mt-1">Column will be automatically zero-padded to 2 digits (01-12)</p>
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Column Column Name *
                </label>
                <input
                  type="text"
                  value={formColumnColumn}
                  onChange={(e) => setFormColumnColumn(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., LocationColumn, Column"
                />
              </div>
            </>
          )}

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Skip Rows
            </label>
            <input
              type="number"
              value={formSkipRows}
              onChange={(e) => setFormSkipRows(parseInt(e.target.value) || 0)}
              min="0"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <p className="text-xs text-gray-500 mt-1">Number of header/metadata rows to skip at the start of the file</p>
          </div>

          <div className="mb-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="mr-2"
              />
              <span className="text-sm text-gray-700">Set as default configuration</span>
            </label>
            <p className="text-xs text-gray-500 mt-1">Default configuration will be automatically selected when uploading files</p>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={resetForm}
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

