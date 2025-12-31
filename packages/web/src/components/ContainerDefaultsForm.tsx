import { useState, useEffect } from 'react'
import { settingsApi, type ContainerDefaults, type Unit } from '../lib/api'
import InfoTooltip from './InfoTooltip'

interface ContainerDefaultsFormProps {
  data: ContainerDefaults | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function ContainerDefaultsForm({
  data,
  onSave,
  onError,
  onSuccess,
}: ContainerDefaultsFormProps) {
  const [formData, setFormData] = useState<ContainerDefaults | null>(null)
  const [savedFormData, setSavedFormData] = useState<ContainerDefaults | null>(null)
  const [saving, setSaving] = useState(false)
  const [units, setUnits] = useState<Unit[]>([])
  const [loadingUnits, setLoadingUnits] = useState(true)

  // Helper to get safe defaults when no data exists
  const getDefaultFormData = (availableUnits: Unit[]): ContainerDefaults => {
    const unitSymbols = new Set(availableUnits.map(u => u.symbol))
    const getSafeUnitSymbol = (preferred: string, fallback: string) => {
      if (unitSymbols.has(preferred)) return preferred
      if (unitSymbols.has(fallback)) return fallback
      return availableUnits[0]?.symbol || fallback
    }

    return {
      micronix_tube: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafeUnitSymbol('items', 'items'),
      },
      cryovial_tube: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafeUnitSymbol('items', 'items'),
      },
      tube: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafeUnitSymbol('items', 'items'),
      },
      paper: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafeUnitSymbol('spots', 'spots'),
      },
      static_well: {
        totalQuantity: 1.0,
        remainingQuantity: 1.0,
        defaultUnitSymbol: getSafeUnitSymbol('spots', 'spots'),
      },
    }
  }

  useEffect(() => {
    loadUnits()
  }, [])

  useEffect(() => {
    // Only initialize form data once units are loaded
    // data can be null (meaning no settings exist yet) or an object
    if (!loadingUnits && units.length > 0) {
      if (data) {
        // Data exists - use it with validation
        const unitSymbols = new Set(units.map(u => u.symbol))
        
        const safeData: ContainerDefaults = {
          micronix_tube: {
            totalQuantity: data.micronix_tube?.totalQuantity ?? 1.0,
            remainingQuantity: data.micronix_tube?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: (data.micronix_tube?.defaultUnitSymbol && unitSymbols.has(data.micronix_tube.defaultUnitSymbol)) 
              ? data.micronix_tube.defaultUnitSymbol 
              : (unitSymbols.has('items') ? 'items' : units[0]?.symbol || 'items'),
          },
          cryovial_tube: {
            totalQuantity: data.cryovial_tube?.totalQuantity ?? 1.0,
            remainingQuantity: data.cryovial_tube?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: (data.cryovial_tube?.defaultUnitSymbol && unitSymbols.has(data.cryovial_tube.defaultUnitSymbol)) 
              ? data.cryovial_tube.defaultUnitSymbol 
              : (unitSymbols.has('items') ? 'items' : units[0]?.symbol || 'items'),
          },
          tube: {
            totalQuantity: data.tube?.totalQuantity ?? 1.0,
            remainingQuantity: data.tube?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: (data.tube?.defaultUnitSymbol && unitSymbols.has(data.tube.defaultUnitSymbol)) 
              ? data.tube.defaultUnitSymbol 
              : (unitSymbols.has('items') ? 'items' : units[0]?.symbol || 'items'),
          },
          paper: {
            totalQuantity: data.paper?.totalQuantity ?? 1.0,
            remainingQuantity: data.paper?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: (data.paper?.defaultUnitSymbol && unitSymbols.has(data.paper.defaultUnitSymbol)) 
              ? data.paper.defaultUnitSymbol 
              : (unitSymbols.has('spots') ? 'spots' : units[0]?.symbol || 'spots'),
          },
          static_well: {
            totalQuantity: data.static_well?.totalQuantity ?? 1.0,
            remainingQuantity: data.static_well?.remainingQuantity ?? 1.0,
            defaultUnitSymbol: (data.static_well?.defaultUnitSymbol && unitSymbols.has(data.static_well.defaultUnitSymbol)) 
              ? data.static_well.defaultUnitSymbol 
              : (unitSymbols.has('spots') ? 'spots' : units[0]?.symbol || 'spots'),
          },
        }
        setFormData(safeData)
        setSavedFormData(safeData)
      } else {
        // No data - use safe defaults with validated unit symbols
        const defaultData = getDefaultFormData(units)
        setFormData(defaultData)
        setSavedFormData(defaultData)
      }
    }
  }, [data, units, loadingUnits])

  const loadUnits = async () => {
    try {
      const res = await settingsApi.getUnits()
      setUnits(res.data)
    } catch (err) {
      console.error('Failed to load units:', err)
    } finally {
      setLoadingUnits(false)
    }
  }

  const handleChange = (
    containerType: keyof ContainerDefaults,
    field: 'totalQuantity' | 'remainingQuantity' | 'defaultUnitSymbol',
    value: string
  ) => {
    if (!formData) return
    
    if (field === 'defaultUnitSymbol') {
      setFormData({
        ...formData,
        [containerType]: {
          ...formData[containerType],
          [field]: value,
        },
      })
    } else {
      const numValue = parseFloat(value)
      if (!isNaN(numValue) && numValue > 0) {
        setFormData({
          ...formData,
          [containerType]: {
            ...formData[containerType],
            [field]: numValue,
          },
        })
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!formData) return
    
    // Validate that all defaultUnitSymbol fields are set
    const hasAllUnitSymbols = containerTypes.every(
      (container) => formData[container.key].defaultUnitSymbol && formData[container.key].defaultUnitSymbol.trim() !== ''
    )
    
    if (!hasAllUnitSymbols) {
      onError?.('Please select a default unit for all container types')
      return
    }
    
    setSaving(true)
    try {
      await settingsApi.update('container_defaults', formData)
      setSavedFormData(formData) // Update saved state
      onSuccess?.()
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || 'Failed to save container defaults'
      const errorDetails = err.response?.data?.details
      const fullMessage = errorDetails 
        ? `${errorMessage}: ${Array.isArray(errorDetails) ? errorDetails.map((d: any) => d.message || d).join(', ') : errorDetails}`
        : errorMessage
      onError?.(fullMessage)
    } finally {
      setSaving(false)
    }
  }

  const containerTypes: Array<{ key: keyof ContainerDefaults; label: string }> = [
    { key: 'micronix_tube', label: 'Micronix Tube' },
    { key: 'cryovial_tube', label: 'Cryovial Tube' },
    { key: 'tube', label: 'Generic Tube' },
    { key: 'paper', label: 'Paper' },
    { key: 'static_well', label: 'Static Well' },
  ]

  // Check if there are unsaved changes
  const hasUnsavedChanges = formData !== null && savedFormData !== null && 
    JSON.stringify(formData) !== JSON.stringify(savedFormData)

  // Show loading state until both data (or null) and units are ready
  const isLoading = loadingUnits || formData === null

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="mb-2">
          <p className="text-xs text-gray-600">
            Default quantity values and unit symbols pre-filled when creating new containers. <InfoTooltip text="These values are pre-filled but can be changed during container creation." />
          </p>
        </div>
        <div className="text-center py-8 text-sm text-gray-500">
          Loading settings...
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="mb-2">
        <p className="text-xs text-gray-600">
          Default quantity values and unit symbols pre-filled when creating new containers. <InfoTooltip text="These values are pre-filled but can be changed during container creation." />
        </p>
      </div>

      {hasUnsavedChanges && (
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

      <div className="border border-gray-200 rounded-md overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Container Type</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Total Quantity</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Remaining Quantity</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Default Unit</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {containerTypes.map((container) => (
              <tr key={container.key} className="hover:bg-gray-50">
                <td className="px-3 py-2 text-xs text-gray-900 align-middle">{container.label}</td>
                <td className="px-3 py-2 text-right align-middle">
                  <div className="flex justify-end">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={formData[container.key].totalQuantity}
                      onChange={(e) =>
                        handleChange(container.key, 'totalQuantity', e.target.value)
                      }
                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-right"
                      required
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-right align-middle">
                  <div className="flex justify-end">
                    <input
                      type="number"
                      step="0.1"
                      min="0.1"
                      value={formData[container.key].remainingQuantity}
                      onChange={(e) =>
                        handleChange(container.key, 'remainingQuantity', e.target.value)
                      }
                      className="w-20 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500 text-right"
                      required
                    />
                  </div>
                </td>
                <td className="px-3 py-2 text-left align-middle">
                  <select
                    value={formData[container.key].defaultUnitSymbol || ''}
                    onChange={(e) =>
                      handleChange(container.key, 'defaultUnitSymbol', e.target.value)
                    }
                    className="w-32 px-2 py-1 text-xs border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    {!formData[container.key].defaultUnitSymbol && (
                      <option value="">Select unit...</option>
                    )}
                    {units.map((unit) => (
                      <option key={unit.id} value={unit.symbol}>
                        {unit.symbol} ({unit.name})
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !hasUnsavedChanges}
          className={`px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges
              ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-md'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {saving ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Saving...
            </span>
          ) : hasUnsavedChanges ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Changes
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </span>
          )}
        </button>
      </div>
    </form>
  )
}

