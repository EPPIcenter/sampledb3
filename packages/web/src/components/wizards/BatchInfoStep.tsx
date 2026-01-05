import { useState, useEffect } from 'react'
import { controlsApi } from '../../lib/api'
import type { ControlDefinition } from '../../lib/api'
import type { BatchInfo } from '../../pages/ControlBatchWizard'

interface BatchInfoStepProps {
  batchInfo: BatchInfo
  onChange: (info: BatchInfo) => void
  onNext: () => void
  onCancel: () => void
  isAddMode: boolean
}

export default function BatchInfoStep({
  batchInfo,
  onChange,
  onNext,
  onCancel,
  isAddMode,
}: BatchInfoStepProps) {
  const [definitions, setDefinitions] = useState<ControlDefinition[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    loadDefinitions()
  }, [])

  useEffect(() => {
    if (batchInfo.controlDefinitionId && !batchInfo.controlDefinition) {
      loadDefinition(batchInfo.controlDefinitionId)
    }
  }, [batchInfo.controlDefinitionId])

  const loadDefinitions = async () => {
    try {
      setLoading(true)
      const response = await controlsApi.list()
      setDefinitions(response.data.controls || [])
    } catch (err) {
      console.error('Failed to load control definitions:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadDefinition = async (id: number) => {
    try {
      const response = await controlsApi.get(id)
      onChange({
        ...batchInfo,
        controlDefinition: response.data.control,
      })
    } catch (err) {
      console.error('Failed to load control definition:', err)
    }
  }

  const handleDefinitionChange = async (definitionId: number | null) => {
    const definition = definitionId
      ? definitions.find(d => d.id === definitionId) || null
      : null

    // Auto-suggest batch name
    let suggestedName = ''
    if (definition) {
      const date = new Date().toISOString().split('T')[0]
      suggestedName = `${definition.name}-${date}`
    }

    onChange({
      ...batchInfo,
      controlDefinitionId: definitionId,
      controlDefinition: definition,
      name: batchInfo.name || suggestedName,
    })
  }

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {}

    if (!batchInfo.controlDefinitionId) {
      newErrors.controlDefinitionId = 'Control definition is required'
    }

    if (!batchInfo.name.trim()) {
      newErrors.name = 'Batch name is required'
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = () => {
    if (validate()) {
      onNext()
    }
  }

  const definition = batchInfo.controlDefinition

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-gray-900 mb-4">Batch Information</h2>
        <p className="text-sm text-gray-600 mb-6">
          {isAddMode
            ? 'Select the control definition for the batch you want to add specimens to.'
            : 'Select a control definition and provide batch details.'}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label htmlFor="control-definition" className="block text-sm font-medium text-gray-700 mb-2">
            Control Definition *
          </label>
          <select
            id="control-definition"
            value={batchInfo.controlDefinitionId || ''}
            onChange={(e) => handleDefinitionChange(e.target.value ? parseInt(e.target.value) : null)}
            disabled={isAddMode}
            className={`block w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.controlDefinitionId ? 'border-red-300' : 'border-gray-300'
            }`}
          >
            <option value="">Select a control definition...</option>
            {definitions.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name} ({def.controlType})
              </option>
            ))}
          </select>
          {errors.controlDefinitionId && (
            <p className="mt-1 text-sm text-red-600">{errors.controlDefinitionId}</p>
          )}
        </div>

        {definition && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">Definition Details</h3>
            <div className="space-y-1 text-sm text-blue-800">
              <div>
                <span className="font-medium">Type:</span> {definition.controlType.replace('_', ' ')}
              </div>
              {definition.targetDensity !== undefined && (
                <div>
                  <span className="font-medium">Target Density:</span>{' '}
                  {definition.targetDensity.toLocaleString()} {definition.unitSymbol || ''}
                </div>
              )}
              {definition.strains && definition.strains.length > 0 && (
                <div>
                  <span className="font-medium">Strains:</span>{' '}
                  {definition.strains.map(s => s.name).join(', ')}
                </div>
              )}
            </div>
          </div>
        )}

        <div>
          <label htmlFor="batch-name" className="block text-sm font-medium text-gray-700 mb-2">
            Batch Name {!isAddMode && '*'}
          </label>
          <input
            id="batch-name"
            type="text"
            value={batchInfo.name}
            onChange={(e) => onChange({ ...batchInfo, name: e.target.value })}
            disabled={isAddMode}
            className={`block w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              errors.name ? 'border-red-300' : 'border-gray-300'
            } ${isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
            placeholder="e.g., Batch-2024-01-15"
          />
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
        </div>

        <div>
          <label htmlFor="production-date" className="block text-sm font-medium text-gray-700 mb-2">
            Production Date
          </label>
          <input
            id="production-date"
            type="date"
            value={batchInfo.productionDate}
            onChange={(e) => onChange({ ...batchInfo, productionDate: e.target.value })}
            disabled={isAddMode}
            className={`block w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''
            }`}
          />
        </div>
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleNext}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Next: Add Specimen Types
        </button>
      </div>
    </div>
  )
}

