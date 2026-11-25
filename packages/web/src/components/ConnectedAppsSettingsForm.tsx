import { useState, useRef } from 'react'
import { settingsApi } from '../lib/api/settings'
import type { ConnectedAppsSettings } from '../lib/api/settings'

interface ConnectedAppsSettingsFormProps {
  data: ConnectedAppsSettings | null
  onSave?: () => void
  onError?: (error: string) => void
  onSuccess?: () => void
}

export default function ConnectedAppsSettingsForm({
  data,
  onError,
  onSuccess,
}: ConnectedAppsSettingsFormProps) {
  const initialEnabled = data?.enabled === true
  const [formData, setFormData] = useState<ConnectedAppsSettings>({
    enabled: initialEnabled,
  })
  const [savedFormData, setSavedFormData] = useState<ConnectedAppsSettings>({
    enabled: initialEnabled,
  })
  const [saving, setSaving] = useState(false)
  const prevDataRef = useRef<ConnectedAppsSettings | null>(data)

  if (data !== prevDataRef.current) {
    prevDataRef.current = data
    const next = { enabled: data?.enabled === true }
    setFormData(next)
    setSavedFormData(next)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await settingsApi.update('connected_apps', formData)
      setSavedFormData(formData)
      onSuccess?.()
    } catch (err: unknown) {
      const apiError = (
        err as { response?: { data?: { error?: string } } } | null | undefined
      )?.response?.data?.error
      onError?.(apiError || 'Failed to save Connected apps setting')
    } finally {
      setSaving(false)
    }
  }

  const hasUnsavedChanges = formData.enabled !== savedFormData.enabled

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {hasUnsavedChanges && (
        <div className="rounded-md bg-yellow-50 border border-yellow-200 p-3">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <p className="text-sm font-medium text-yellow-800">
              You have unsaved changes. Don&apos;t forget to click &quot;Save Changes&quot; to apply your configuration.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-start justify-between gap-4 rounded-md border border-app-border p-3">
        <div className="space-y-1">
          <label
            htmlFor="connected-apps-enabled"
            className="block text-sm font-medium text-app-text cursor-pointer"
          >
            Enable Connected Apps
          </label>
          <p className="text-xs text-app-text-muted">
            Turning this on enables the MCP endpoint so lab staff can connect external apps such as Claude Code to query inventory data and run imports using their own role (capped at member). Turning it off disables the endpoint immediately without deleting existing connections.
          </p>
        </div>
        <input
          id="connected-apps-enabled"
          type="checkbox"
          role="switch"
          aria-checked={formData.enabled}
          checked={formData.enabled}
          onChange={(e) => setFormData({ enabled: e.target.checked })}
          className="mt-1 h-4 w-4 accent-app-accent cursor-pointer flex-shrink-0"
        />
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
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden>
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </span>
          ) : hasUnsavedChanges ? (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Save Changes
            </span>
          ) : (
            <span className="flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
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
