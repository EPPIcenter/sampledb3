import { useState, useRef, useEffect } from 'react'
import { controlsApi, settingsApi, strainsApi, type ControlDefinition, type Strain, type Unit } from '../../lib/api'
import { useNavigate, useParams } from 'react-router-dom'
import { useModifierHotkey } from '../../hooks/useHotkey'

interface ControlDefinitionFormProps {
  controlDefinition?: ControlDefinition
  onSuccess?: () => void
  onCancel?: () => void
}

interface StrainInput {
  strainId: number
  percentage: number
  strainName?: string
}

export default function ControlDefinitionForm({ controlDefinition: propControlDefinition, onSuccess, onCancel }: ControlDefinitionFormProps) {
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [strains, setStrains] = useState<Strain[]>([])
  const [units, setUnits] = useState<Unit[]>([])
  const [controlDefinition, setControlDefinition] = useState<ControlDefinition | undefined>(propControlDefinition)
  const [formData, setFormData] = useState({
    name: propControlDefinition?.name || '',
    controlType: 'blood' as ControlDefinition['controlType'],
    targetDensity: propControlDefinition?.targetDensity?.toString() || '',
    targetDensityUnitId: propControlDefinition?.targetDensityUnitId?.toString() || '',
  })
  const [strainInputs, setStrainInputs] = useState<StrainInput[]>([])
  const [showStrains, setShowStrains] = useState(false)
  const [autoGenerateName, setAutoGenerateName] = useState(!propControlDefinition) // Auto-generate for new definitions
  const [suggestedName, setSuggestedName] = useState<string>('')
  const [isGeneratingName, setIsGeneratingName] = useState(false)

  useEffect(() => {
    loadStrains()
    loadUnits()
    if (id && !propControlDefinition) {
      loadControlDefinition()
    } else if (!id && !propControlDefinition) {
      // For new definitions, ensure strains section is shown
      setShowStrains(true)
      // Add one empty strain input to start
      if (strains.length > 0) {
        setStrainInputs([{
          strainId: strains[0].id,
          percentage: 100,
          strainName: strains[0].name,
        }])
      }
    }
  }, [id, propControlDefinition])
  
  // Load strains first, then set initial strain input
  useEffect(() => {
    if (!id && !propControlDefinition && strains.length > 0 && strainInputs.length === 0) {
      setStrainInputs([{
        strainId: strains[0].id,
        percentage: 100,
        strainName: strains[0].name,
      }])
      setShowStrains(true)
    }
  }, [strains, id, propControlDefinition])

  useEffect(() => {
    if (controlDefinition) {
      // Parse strains and density from properties or from parsed fields
      const props = controlDefinition.properties || {}
      const strains = controlDefinition.strains || props.strains || []
      const targetDensity = controlDefinition.targetDensity ?? props.targetDensity
      const targetDensityUnitId = controlDefinition.targetDensityUnitId ?? props.targetDensityUnitId
      
      if (strains.length > 0) {
        setStrainInputs(
          strains.map((s: any) => ({
            strainId: typeof s === 'number' ? s : s.id,
            percentage: typeof s === 'number' ? 0 : (s.percentage || 0),
            strainName: typeof s === 'number' ? undefined : s.name,
          }))
        )
        setShowStrains(true)
      }
      
      setFormData({
        name: controlDefinition.name || '',
        controlType: 'blood',
        targetDensity: targetDensity?.toString() || '',
        targetDensityUnitId: targetDensityUnitId?.toString() || '',
      })
    }
  }, [controlDefinition])

  const loadControlDefinition = async () => {
    if (!id) return
    try {
      const res = await controlsApi.getDefinitionSummary(parseInt(id))
      setControlDefinition(res.data.control)
      // Strains are now in composition or parsed from properties
      const strains = res.data.composition?.strains || res.data.control.strains || []
      if (strains.length > 0) {
        setStrainInputs(
          strains.map((s: any) => ({
            strainId: s.id,
            percentage: s.percentage || 0,
            strainName: s.name,
          }))
        )
        setShowStrains(true)
      }
    } catch (err) {
      console.error('Failed to load control definition:', err)
      setError('Failed to load control definition')
    }
  }

  const loadStrains = async () => {
    try {
      const res = await strainsApi.list()
      setStrains(res.data)
    } catch (err) {
      console.error('Failed to load strains:', err)
      setStrains([]) // Clear on error
    }
  }

  const loadUnits = async () => {
    try {
      const res = await settingsApi.getUnits()
      setUnits(res.data || [])
    } catch (err) {
      console.error('Failed to load units:', err)
    }
  }

  const handleAddStrain = () => {
    const availableStrains = strains.filter(s => 
      !strainInputs.some(si => si.strainId === s.id)
    )
    if (availableStrains.length > 0) {
      setStrainInputs([...strainInputs, {
        strainId: availableStrains[0].id,
        percentage: 0,
        strainName: availableStrains[0].name,
      }])
    }
  }

  const handleRemoveStrain = (index: number) => {
    setStrainInputs(strainInputs.filter((_, i) => i !== index))
  }

  const handleStrainChange = (index: number, field: 'strainId' | 'percentage', value: string | number) => {
    const newInputs = [...strainInputs]
    if (field === 'strainId') {
      const strain = strains.find(s => s.id === Number(value))
      newInputs[index] = {
        ...newInputs[index],
        strainId: Number(value),
        strainName: strain?.name,
      }
    } else {
      newInputs[index] = {
        ...newInputs[index],
        percentage: Number(value),
      }
    }
    setStrainInputs(newInputs)
    // Trigger name generation if auto-generate is enabled
    if (autoGenerateName) {
      generateName(newInputs)
    }
  }
  
  const generateName = async (currentStrainInputs: StrainInput[] = strainInputs) => {
    // Only generate if we have density and strains
    if (!formData.targetDensity || currentStrainInputs.length === 0) {
      return
    }
    
    // Validate percentages total 100%
    const total = currentStrainInputs.reduce((sum, s) => sum + s.percentage, 0)
    if (Math.abs(total - 100) >= 0.01) {
      return
    }
    
    setIsGeneratingName(true)
    try {
      const response = await controlsApi.suggestName({
        controlType: 'blood',
        targetDensity: parseFloat(formData.targetDensity),
        targetDensityUnitId: formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined,
        strains: currentStrainInputs.map(s => ({
          strainId: s.strainId,
          percentage: s.percentage,
        })),
      })
      
      setSuggestedName(response.data.suggestedName)
      if (autoGenerateName) {
        setFormData({ ...formData, name: response.data.suggestedName })
      }
      
      // Show warning if definition already exists
      if (response.data.exists && response.data.existingDefinition) {
        setError(`A control definition with this combination already exists: "${response.data.existingDefinition.name}"`)
      }
    } catch (err) {
      console.error('Failed to generate name:', err)
      // Don't show error to user, just silently fail
    } finally {
      setIsGeneratingName(false)
    }
  }
  
  // Generate name when density, unit, or strain percentages change
  useEffect(() => {
    if (autoGenerateName && formData.targetDensity && strainInputs.length > 0) {
      const total = strainInputs.reduce((sum, s) => sum + s.percentage, 0)
      if (Math.abs(total - 100) < 0.01) {
        // Use a timeout to debounce rapid changes
        const timeoutId = setTimeout(() => {
          generateName()
        }, 300)
        return () => clearTimeout(timeoutId)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.targetDensity, formData.targetDensityUnitId, autoGenerateName, JSON.stringify(strainInputs.map(s => ({ id: s.strainId, pct: s.percentage })))])

  const totalPercentage = strainInputs.reduce((sum, s) => sum + s.percentage, 0)
  const isTotalValid = strainInputs.length === 0 || Math.abs(totalPercentage - 100) < 0.01

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    // Validate strains if shown
    if (showStrains && strainInputs.length > 0) {
      if (!isTotalValid) {
        setError(`Strain percentages must total exactly 100% (currently ${totalPercentage.toFixed(2)}%)`)
        setLoading(false)
        return
      }
      if (strainInputs.some(s => s.percentage <= 0 || s.percentage > 100)) {
        setError('Each strain percentage must be between 0 and 100')
        setLoading(false)
        return
      }
    }

    try {
      // Validate required fields for blood controls
      if (formData.controlType === 'blood') {
        if (!formData.targetDensity) {
          setError('Target density is required')
          setLoading(false)
          return
        }
        if (strainInputs.length === 0) {
          setError('At least one strain is required')
          setLoading(false)
          return
        }
      }
      
      const submitData: any = {
        controlType: formData.controlType,
      }
      
      // Include name only if provided (will be auto-generated if not)
      if (formData.name && formData.name.trim()) {
        submitData.name = formData.name.trim()
      }

      // Only include density and strains for blood controls
      if (formData.controlType === 'blood') {
        submitData.targetDensity = parseFloat(formData.targetDensity)
        submitData.targetDensityUnitId = formData.targetDensityUnitId ? parseInt(formData.targetDensityUnitId) : undefined
        
        submitData.strains = strainInputs.map(s => ({
          strainId: s.strainId,
          percentage: s.percentage,
        }))
      }

      if (controlDefinition) {
        // For updates, include strains in the update payload (only for blood controls)
        const updateData: any = { ...submitData }
        if (formData.controlType === 'blood') {
          if (showStrains && strainInputs.length > 0) {
            updateData.strains = strainInputs.map(s => ({
              strainId: s.strainId,
              percentage: s.percentage,
            }))
          } else if (showStrains && strainInputs.length === 0) {
            // Explicitly set empty array to remove all strains
            updateData.strains = []
          }
        }
        await controlsApi.update(controlDefinition.id, updateData)
      } else {
        await controlsApi.create(submitData)
      }

      if (onSuccess) {
        onSuccess()
      } else {
        navigate('/blood-controls')
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save control definition')
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl+Enter to submit
  useModifierHotkey('enter', (e) => {
    if (!loading && formRef.current) {
      e.preventDefault()
      formRef.current.requestSubmit()
    }
  }, { preventDefault: true, enableOnFormTags: true })

  const availableStrainsForIndex = (index: number) => {
    return strains.filter(s => 
      !strainInputs.some((si, i) => i !== index && si.strainId === s.id)
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          {controlDefinition ? 'Edit Blood Control Definition' : 'New Blood Control Definition'}
        </h1>
        <p className="text-gray-500 mt-1">
          {controlDefinition ? 'Update blood control definition details and strain composition' : 'Create a new blood control definition with density and strain composition'}
        </p>
      </div>
      <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <div className="flex items-center justify-between mb-2">
          <label htmlFor="control-name" className="block text-sm font-medium text-gray-700">
            Name {!autoGenerateName && '*'}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="auto-generate-name"
              checked={autoGenerateName}
              onChange={(e) => {
                setAutoGenerateName(e.target.checked)
                if (e.target.checked && formData.targetDensity && strainInputs.length > 0) {
                  generateName()
                } else if (!e.target.checked) {
                  setFormData({ ...formData, name: '' })
                }
              }}
              className="rounded"
            />
            <label htmlFor="auto-generate-name" className="text-sm text-gray-600 cursor-pointer">
              Auto-generate name
            </label>
          </div>
        </div>
        <div className="relative">
          <input
            id="control-name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            required={!autoGenerateName}
            disabled={autoGenerateName && isGeneratingName}
            className="form-input"
            placeholder={autoGenerateName ? (isGeneratingName ? 'Generating...' : 'Name will be auto-generated') : 'Enter name'}
          />
          {autoGenerateName && suggestedName && !isGeneratingName && (
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500">
              Suggested: {suggestedName}
            </div>
          )}
        </div>
        {autoGenerateName && formData.targetDensity && strainInputs.length > 0 && (
          <p className="mt-1 text-xs text-gray-500">
            Name will be automatically generated from density and strain composition
          </p>
        )}
      </div>

      {/* Blood Control Fields */}
      <>
          <div>
            <label htmlFor="target-density" className="block text-sm font-medium text-gray-700 mb-2">
              Target Density
            </label>
            <div className="flex gap-2">
              <input
                id="target-density"
                type="number"
                step="any"
                value={formData.targetDensity}
                onChange={(e) => {
                  setFormData({ ...formData, targetDensity: e.target.value })
                  if (autoGenerateName && e.target.value && strainInputs.length > 0) {
                    // Trigger name generation after a short delay
                    setTimeout(() => {
                      if (formData.targetDensity !== e.target.value) return // Value changed again
                      generateName()
                    }, 300)
                  }
                }}
                className="form-input flex-1"
                placeholder="e.g. 10000"
                required
              />
              <select
                value={formData.targetDensityUnitId}
                onChange={(e) => setFormData({ ...formData, targetDensityUnitId: e.target.value })}
                className="form-input w-48"
              >
                <option value="">Select unit</option>
                {units
                  .filter(u => u.category === 'concentration')
                  .map(u => (
                    <option key={u.id} value={u.id.toString()}>
                      {u.symbol} ({u.name})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Strain Composition Section - Only for Blood Controls */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-gray-700">
                Strain Composition (Parasite Strains) *
              </label>
            </div>

            {(
          <div className="border border-gray-300 rounded-lg p-4 bg-gray-50 space-y-4">
            {strainInputs.length === 0 && (
              <p className="text-sm text-gray-500 italic">No strains added yet. Click "Add Strain" to begin.</p>
            )}

            {strainInputs.map((strainInput, index) => {
              const availableStrains = availableStrainsForIndex(index)
              return (
                <div key={index} className="flex gap-2 items-center bg-white p-3 rounded border border-gray-200">
                  <select
                    value={strainInput.strainId}
                    onChange={(e) => handleStrainChange(index, 'strainId', e.target.value)}
                    className="form-input flex-1"
                    required
                  >
                    <option value="">Select strain</option>
                    {availableStrains.map(s => (
                      <option key={s.id} value={s.id.toString()}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={strainInput.percentage}
                    onChange={(e) => handleStrainChange(index, 'percentage', e.target.value)}
                    className="form-input w-24"
                    placeholder="%"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => handleRemoveStrain(index)}
                    className="text-red-600 hover:text-red-800 font-bold px-3 py-2"
                    title="Remove strain"
                  >
                    ×
                  </button>
                </div>
              )
            })}

            {strainInputs.length > 0 && (
              <div className={`text-sm font-medium ${isTotalValid ? 'text-green-600' : 'text-red-600'} bg-white p-2 rounded border`}>
                Total: {totalPercentage.toFixed(2)}% {isTotalValid ? '✓' : `(need ${(100 - totalPercentage).toFixed(2)}% more)`}
              </div>
            )}

            <button
              type="button"
              onClick={handleAddStrain}
              className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              disabled={strains.filter(s => !strainInputs.some(si => si.strainId === s.id)).length === 0}
            >
              + Add Strain
            </button>
          </div>
          )}
          </div>
      </>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={() => {
            if (onCancel) {
              onCancel()
            } else {
              navigate(-1)
            }
          }}
          className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || (formData.controlType === 'blood' && showStrains && strainInputs.length > 0 && !isTotalValid)}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? 'Saving...' : controlDefinition ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
    </div>
  )
}

