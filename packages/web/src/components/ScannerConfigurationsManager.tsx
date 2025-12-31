import { useState, useEffect } from 'react'
import { scannerConfigurationsApi, type ScannerConfigurations, type ScannerConfiguration } from '../lib/api'
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
  const [configurations, setConfigurations] = useState<ScannerConfiguration[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
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

  useEffect(() => {
    if (data && data.configurations) {
      setConfigurations(data.configurations)
    } else {
      setConfigurations([])
    }
  }, [data])

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
      await scannerConfigurationsApi.update({ configurations })
      onSuccess?.()
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Failed to save scanner configurations'
      setError(errorMsg)
      onError?.(errorMsg)
    } finally {
      setSaving(false)
    }
  }

  const handleAdd = () => {
    if (!formName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (configurations.some(c => c.name === formName.trim())) {
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
      isDefault: formIsDefault || configurations.length === 0, // First config is default if none set
    }

    // If this is set as default, unset others
    let updated = [...configurations]
    if (newConfig.isDefault) {
      updated = updated.map(c => ({ ...c, isDefault: false }))
    }
    updated.push(newConfig)
    setConfigurations(updated)

    resetForm()
  }

  const handleEdit = (index: number) => {
    setEditingIndex(index)
    const config = configurations[index]
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

  const handleUpdate = () => {
    if (!formName.trim()) {
      setError('Configuration name is required')
      return
    }
    if (editingIndex === null) return

    const existingConfig = configurations[editingIndex]
    const nameChanged = formName.trim() !== existingConfig.name
    if (nameChanged && configurations.some((c, i) => i !== editingIndex && c.name === formName.trim())) {
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

    const updated = [...configurations]
    const wasDefault = existingConfig.isDefault
    
    // If setting as default, unset others
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
    setConfigurations(updated)

    resetForm()
  }

  const handleDelete = (index: number) => {
    if (window.confirm(`Are you sure you want to delete "${configurations[index].name}"?`)) {
      const updated = configurations.filter((_, i) => i !== index)
      // If we deleted the default, make the first one default
      if (configurations[index].isDefault && updated.length > 0) {
        updated[0].isDefault = true
      }
      setConfigurations(updated)
    }
  }

  const handleSetDefault = (index: number) => {
    const updated = configurations.map((c, i) => ({
      ...c,
      isDefault: i === index,
    }))
    setConfigurations(updated)
  }

  const hasUnsavedChanges = () => {
    if (!data || !data.configurations) return configurations.length > 0
    return JSON.stringify(configurations) !== JSON.stringify(data.configurations)
  }

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
            Scanner Configurations
          </label>
          <InfoTooltip text="Create and manage scanner configurations for different CSV formats. Each configuration defines how to parse barcode and position columns from scanner output files. Select a default configuration to use automatically when uploading files." />
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm()
            setShowNewForm(true)
          }}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          + Add Configuration
        </button>
      </div>

      {/* Existing Configurations */}
      <div className="space-y-2">
        {configurations.map((config, index) => (
          <div
            key={config.id}
            className="border border-gray-200 rounded-lg p-3 bg-white"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
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
                    onClick={() => handleSetDefault(index)}
                    className="text-xs text-blue-600 hover:text-blue-800"
                  >
                    Set as Default
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
            No configurations yet. Click "Add Configuration" to create one.
          </div>
        )}
      </div>

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
              {editingIndex !== null ? 'Update' : 'Add'}
            </button>
          </div>
        </div>
      )}

      {/* Save Button */}
      {hasUnsavedChanges() && (
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      )}
    </div>
  )
}

