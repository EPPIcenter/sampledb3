import { useState, useEffect, useRef } from 'react'
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
  const [validating, setValidating] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [nameSuggestion, setNameSuggestion] = useState<string | null>(null)
  const [localName, setLocalName] = useState(batchInfo.name)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const prevBatchNameRef = useRef(batchInfo.name)

  useEffect(() => {
    loadDefinitions()
  }, [])

  useEffect(() => {
    if (batchInfo.controlDefinitionId && !batchInfo.controlDefinition) {
      loadDefinition(batchInfo.controlDefinitionId)
    }
  }, [batchInfo.controlDefinitionId])

  // Sync local name with batchInfo when it changes externally (during render to avoid extra pass)
  if (batchInfo.name !== prevBatchNameRef.current) {
    prevBatchNameRef.current = batchInfo.name
    setLocalName(batchInfo.name)
  }

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

    // Generate suggested batch name using API
    let suggestedName = ''
    if (definition) {
      try {
        const response = await controlsApi.suggestBatchName(definition.id, batchInfo.productionDate || undefined)
        suggestedName = response.data.name
        setNameSuggestion(suggestedName)
      } catch (err) {
        console.error('Failed to generate suggested batch name:', err)
        // Fallback to simple suggestion
        const date = batchInfo.productionDate || new Date().toISOString().split('T')[0]
        suggestedName = `${definition.name} ${date}`
        setNameSuggestion(null)
      }
    } else {
      setNameSuggestion(null)
    }

    onChange({
      ...batchInfo,
      controlDefinitionId: definitionId,
      controlDefinition: definition,
      name: batchInfo.name || suggestedName,
    })
  }

  // Update suggested name when production date changes
  useEffect(() => {
    if (batchInfo.controlDefinitionId && batchInfo.productionDate && !isAddMode && definitions.length > 0) {
      const definition = definitions.find(d => d.id === batchInfo.controlDefinitionId)
      if (definition) {
        controlsApi.suggestBatchName(definition.id, batchInfo.productionDate)
          .then(response => {
            // Only update name if it's empty or matches the previous suggestion
            if (!batchInfo.name || batchInfo.name === nameSuggestion) {
              onChange({ ...batchInfo, name: response.data.name })
            }
            setNameSuggestion(response.data.name)
          })
          .catch(err => {
            console.error('Failed to generate suggested batch name:', err)
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchInfo.productionDate, batchInfo.controlDefinitionId])

  const handleNameChange = (name: string) => {
    // Update local state immediately (no re-render from parent)
    setLocalName(name)
    // Update parent state (but this won't cause focus loss since we're using local state)
    onChange({ ...batchInfo, name })
    
    // Clear previous errors
    if (errors.name) {
      setErrors({ ...errors, name: '' })
    }
    setNameSuggestion(null)
  }

  // Debounced validation
  useEffect(() => {
    if (!localName.trim() || !batchInfo.controlDefinitionId) {
      setValidating(false)
      return
    }

    const timeoutId = setTimeout(async () => {
      setValidating(true)
      try {
        const response = await controlsApi.validateBatchName(localName.trim())
        if (!response.data.valid) {
          setErrors(prev => ({ ...prev, name: response.data.error || 'Batch name is invalid' }))
          if (response.data.suggestion) {
            setNameSuggestion(response.data.suggestion)
          }
        } else {
          setErrors(prev => ({ ...prev, name: '' }))
          setNameSuggestion(null)
        }
      } catch (err) {
        console.error('Failed to validate batch name:', err)
        // Don't block user input on validation error
      } finally {
        setValidating(false)
      }
    }, 500) // Debounce 500ms

    return () => clearTimeout(timeoutId)
  }, [localName, batchInfo.controlDefinitionId])

  const validate = async (): Promise<boolean> => {
    const newErrors: Record<string, string> = {}

    if (!batchInfo.controlDefinitionId) {
      newErrors.controlDefinitionId = 'Control definition is required'
    }

    if (!batchInfo.name.trim()) {
      newErrors.name = 'Batch name is required'
    } else {
      // Validate batch name with API
      setValidating(true)
      try {
        const response = await controlsApi.validateBatchName(batchInfo.name.trim())
        if (!response.data.valid) {
          newErrors.name = response.data.error || 'Batch name is invalid'
          if (response.data.suggestion) {
            setNameSuggestion(response.data.suggestion)
          }
        }
      } catch (err) {
        console.error('Failed to validate batch name:', err)
        newErrors.name = 'Failed to validate batch name. Please try again.'
      } finally {
        setValidating(false)
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  const handleNext = async () => {
    const isValid = await validate()
    if (isValid) {
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
          <div className="relative">
            <input
              ref={nameInputRef}
              id="batch-name"
              type="text"
              value={localName}
              onChange={(e) => handleNameChange(e.target.value)}
              disabled={isAddMode}
              className={`block w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.name ? 'border-red-300' : 'border-gray-300'
              } ${isAddMode ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              placeholder="e.g., Batch-2024-01-15"
            />
            {validating && (
              <div className="absolute right-3 top-2.5">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
          {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
          {nameSuggestion && !errors.name && (
            <p className="mt-1 text-sm text-blue-600">
              Suggestion: <button
                type="button"
                onClick={() => handleNameChange(nameSuggestion)}
                className="underline hover:text-blue-800"
              >
                {nameSuggestion}
              </button>
            </p>
          )}
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

