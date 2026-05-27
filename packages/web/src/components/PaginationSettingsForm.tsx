import { useState, useRef } from 'react'
import { settingsApi } from '../lib/api/settings';
import type { PaginationSettings } from '../lib/api/settings';
import { useUser } from '../contexts/UserContext'
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
  const { user } = useUser()
  const [formData, setFormData] = useState<PaginationSettings>({
    defaultPageSize: 50,
    maxPageSize: 1000,
  })
  const [savedFormData, setSavedFormData] = useState<PaginationSettings>({
    defaultPageSize: 50,
    maxPageSize: 1000,
  })
  const [systemDefault, setSystemDefault] = useState<PaginationSettings | null>(null)
  const [isUserSpecific, setIsUserSpecific] = useState(false)
  const [saving, setSaving] = useState(false)
  const [resetting, setResetting] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const prevDataRef = useRef<PaginationSettings | null>(data)

  // Sync form when data prop changes (during render to avoid extra pass)
  if (data !== prevDataRef.current) {
    prevDataRef.current = data
    if (data) {
      setFormData(data)
      setSavedFormData(data)
      setIsUserSpecific(user?.role !== 'admin')
    }
  }

  // System default fetch removed: was a no-op (did not set state). Use handleResetToDefault or a dedicated endpoint if comparison is needed.

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
      // Save as user-specific (userId will be determined by API based on auth)
      await settingsApi.update('pagination_settings', formData)
      setSavedFormData(formData) // Update saved state
      setIsUserSpecific(true) // After saving, it's now user-specific
      onSuccess?.()
    } catch (err: any) {
      onError?.(err.response?.data?.error || 'Failed to save pagination settings')
    } finally {
      setSaving(false)
    }
  }

  const handleResetToDefault = async () => {
    if (!confirm('Reset to system default? Your custom pagination settings will be removed.')) {
      return
    }
    setResetting(true)
    try {
      await settingsApi.resetUserSetting('pagination_settings')
      // Reload settings to get system default
      const response = await settingsApi.getValue('pagination_settings')
      if (response) {
        setFormData(response)
        setSavedFormData(response)
        setIsUserSpecific(false)
        onSuccess?.()
      }
    } catch (err: any) {
      onError?.(err.response?.data?.error || 'Failed to reset pagination settings')
    } finally {
      setResetting(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData)

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {validationError && (
        <div className="rounded-md bg-app-trend-down/10 p-2">
          <p className="text-xs font-medium text-app-trend-down">{validationError}</p>
        </div>
      )}

      {/* User-specific indicator */}
      {isUserSpecific && (
        <div className="rounded-md bg-app-accent-muted border border-app-accent p-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-app-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <p className="text-xs font-medium text-app-accent-hover">
                Using your personal pagination settings
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetToDefault}
              disabled={resetting}
              className="text-xs text-app-accent hover:text-app-accent-hover underline disabled:opacity-50"
            >
              {resetting ? 'Resetting...' : 'Reset to Default'}
            </button>
          </div>
        </div>
      )}

      {!isUserSpecific && (
        <div className="rounded-md bg-app-surface border border-app-border p-2">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-app-text-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <p className="text-xs font-medium text-app-text">
              Using system default pagination settings
            </p>
          </div>
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
            <label className="block text-xs font-medium text-app-text">
              Default Page Size
            </label>
            <InfoTooltip text="Number of items shown per page by default in list views (studies, specimens, etc.)" />
          </div>
          <input
            type="number"
            min="1"
            value={formData.defaultPageSize}
            onChange={(e) => handleChange('defaultPageSize', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-app-border rounded-md focus:ring-app-accent focus:border-app-accent"
            required
          />
        </div>

        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <label className="block text-xs font-medium text-app-text">
              Maximum Page Size
            </label>
            <InfoTooltip text="Maximum number of items that can be requested per page. Prevents performance issues with very large page sizes." />
          </div>
          <input
            type="number"
            min="1"
            value={formData.maxPageSize}
            onChange={(e) => handleChange('maxPageSize', e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-app-border rounded-md focus:ring-app-accent focus:border-app-accent"
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
              ? 'bg-app-accent text-white hover:bg-app-accent-hover shadow-md'
              : 'bg-app-surface text-app-text-muted cursor-not-allowed'
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

