import { useState, useRef } from 'react'
import { settingsApi } from '../lib/api/settings';
import type { SessionSettings } from '../lib/api/settings';
import InfoTooltip from './InfoTooltip'

interface SessionSettingsFormProps {
  data: SessionSettings | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function SessionSettingsForm({
  data,
  onSave,
  onError,
  onSuccess,
}: SessionSettingsFormProps) {
  const [formData, setFormData] = useState<SessionSettings>({
    maxAgeSeconds: 604800, // 7 days
  })
  const [savedFormData, setSavedFormData] = useState<SessionSettings>({
    maxAgeSeconds: 604800, // 7 days
  })
  const [saving, setSaving] = useState(false)
  const prevDataRef = useRef<SessionSettings | null>(data)

  // Sync form when data prop changes (during render to avoid extra pass)
  if (data !== prevDataRef.current) {
    prevDataRef.current = data
    if (data) {
      setFormData(data)
      setSavedFormData(data)
    }
  }

  const handleChange = (value: string) => {
    const numValue = parseInt(value, 10)
    if (!isNaN(numValue) && numValue > 0) {
      setFormData({ maxAgeSeconds: numValue })
    }
  }

  const formatDuration = (seconds: number): string => {
    const days = Math.floor(seconds / 86400)
    const hours = Math.floor((seconds % 86400) / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)

    const parts: string[] = []
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`)
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
    if (minutes > 0 && days === 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)

    return parts.length > 0 ? parts.join(', ') : `${seconds} second${seconds !== 1 ? 's' : ''}`
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsApi.update('session_settings', formData)
      setSavedFormData(formData) // Update saved state
      onSuccess?.()
    } catch (err: any) {
      onError?.(err.response?.data?.error || 'Failed to save session settings')
    } finally {
      setSaving(false)
    }
  }

  // Check if there are unsaved changes
  const hasUnsavedChanges = JSON.stringify(formData) !== JSON.stringify(savedFormData)

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
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
              Session Timeout (seconds)
            </label>
            <InfoTooltip text="Duration in seconds before user sessions expire and require re-authentication. Affects all logged-in users." />
          </div>
          <input
            type="number"
            min="1"
            value={formData.maxAgeSeconds}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full px-2 py-1.5 text-sm border border-app-border rounded-md focus:ring-app-accent focus:border-app-accent"
            required
          />
        </div>
        <div className="text-xs text-app-text-muted">
          <div className="font-medium mb-0.5">Current: {formatDuration(formData.maxAgeSeconds)}</div>
          <div className="text-app-text-muted text-[10px]">
            Quick: 3600 (1h) • 86400 (1d) • 604800 (7d) • 2592000 (30d)
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-2">
        <button
          type="submit"
          disabled={saving || !hasUnsavedChanges}
          className={`px-3 py-1.5 text-xs rounded transition-all ${
            hasUnsavedChanges
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

