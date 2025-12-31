import { useState, useEffect } from 'react'
import { settingsApi, type PaginationSettings } from '../lib/api'
import InfoTooltip from './InfoTooltip'

interface PaginationSettingsFormProps {
  data: PaginationSettings | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function PaginationSettingsForm({
  data,
  onSave,
  onError,
  onSuccess,
}: PaginationSettingsFormProps) {
  const [formData, setFormData] = useState<PaginationSettings>({
    defaultPageSize: 50,
    maxPageSize: 1000,
  })
  const [savedFormData, setSavedFormData] = useState<PaginationSettings>({
    defaultPageSize: 50,
    maxPageSize: 1000,
  })
  const [saving, setSaving] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  useEffect(() => {
    if (data) {
      setFormData(data)
      setSavedFormData(data)
    }
  }, [data])

  const handleChange = (field: keyof PaginationSettings, value: string) => {
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue > 0) {
      const newData = { ...formData, [field]: numValue }
      setFormData(newData)

      // Validate
      if (newData.defaultPageSize > newData.maxPageSize) {
        setValidationError('Default page size cannot be greater than max page size')
      } else {
        setValidationError(null)
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (formData.defaultPageSize > formData.maxPageSize) {
      setValidationError('Default page size cannot be greater than max page size')
      return
    }
    setSaving(true)
    setValidationError(null)
    try {
      await settingsApi.update('pagination_settings', formData)
      setSavedFormData(formData) // Update saved state
      onSuccess?.()
    } catch (err: any) {
      onError?.(err.response?.data?.error || 'Failed to save pagination settings')
    } finally {
      setSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData)

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {validationError && (
        <div className="rounded-md bg-red-50 p-2">
          <p className="text-xs font-medium text-red-800">{validationError}</p>
        </div>
      )}

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

      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-xs font-medium text-gray-700">
              Default Page Size
            </label>
            <InfoTooltip text="Number of items shown per page by default in list views (studies, specimens, etc.)" />
          </div>
          <input
            type="number"
            min="1"
            value={formData.defaultPageSize}
            onChange={(e) => handleChange('defaultPageSize', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-xs font-medium text-gray-700">
              Maximum Page Size
            </label>
            <InfoTooltip text="Maximum number of items that can be requested per page. Prevents performance issues with very large page sizes." />
          </div>
          <input
            type="number"
            min="1"
            value={formData.maxPageSize}
            onChange={(e) => handleChange('maxPageSize', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            required
          />
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !!validationError || !hasUnsavedChanges}
          className={`px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges && !validationError
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

