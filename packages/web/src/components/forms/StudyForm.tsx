import { useState, useRef } from 'react'
import { studiesApi } from '../../lib/api/studies';
import type { Study } from '../../lib/api/studies';
import { useNavigate } from 'react-router-dom'
import { useModifierHotkey } from '../../hooks/useHotkey'
import { TUTORIAL_SHORT_CODE_PREFIX } from '../../lib/constants'
import UserBadge from '../UserBadge'

interface StudyFormProps {
  study?: Study
  onSuccess?: () => void
  onCancel: () => void
}

function isTutorialNamespace(shortCode: string): boolean {
  return shortCode.trim().toUpperCase().startsWith(TUTORIAL_SHORT_CODE_PREFIX)
}

export default function StudyForm({ study, onSuccess, onCancel }: StudyFormProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [formData, setFormData] = useState({
    title: study?.title || '',
    description: study?.description || '',
    shortCode: study?.shortCode || '',
    isLongitudinal: study?.isLongitudinal || false,
    leadPerson: study?.leadPerson || '',
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      if (study) {
        // Update existing study (exclude isLongitudinal - cannot be changed after creation)
        const { isLongitudinal, ...updateData } = formData
        await studiesApi.update(study.id, updateData)
        if (onSuccess) {
          onSuccess()
        } else {
          navigate('/studies')
        }
      } else {
        // Create new study
        const res = await studiesApi.create(formData)
        if (onSuccess) {
          onSuccess()
        } else {
          navigate(`/studies/${res.study.id}`)
        }
      }
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        err.response &&
        typeof (err.response as { data?: { error?: string } }).data?.error === 'string'
          ? (err.response as { data: { error: string } }).data.error
          : 'Failed to save study'
      setError(message)
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

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded">
          {error}
        </div>
      )}

      {!study && formData.shortCode && isTutorialNamespace(formData.shortCode) && (
        <div className="bg-app-standard-muted border border-app-standard/50 text-app-standard px-4 py-3 rounded" role="alert">
          Studies whose short code starts with &quot;{TUTORIAL_SHORT_CODE_PREFIX}&quot; can be deleted by any user. Consider using a different code for production data.
        </div>
      )}

      <UserBadge action={study ? 'updating' : 'creating'} />

      <div>
        <label htmlFor="study-title" className="block text-sm font-medium text-app-text mb-2">
          Title *
        </label>
        <input
          id="study-title"
          type="text"
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
          className="form-input"
        />
      </div>

      <div>
        <label htmlFor="study-short-code" className="block text-sm font-medium text-app-text mb-2">
          Short Code *
        </label>
        <input
          id="study-short-code"
          type="text"
          value={formData.shortCode}
          onChange={(e) => setFormData({ ...formData, shortCode: e.target.value })}
          required
          className="form-input"
        />
      </div>

      <div>
        <label htmlFor="study-description" className="block text-sm font-medium text-app-text mb-2">
          Description
        </label>
        <textarea
          id="study-description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={4}
          className="form-textarea"
        />
      </div>

      <div>
        <label htmlFor="study-lead-person" className="block text-sm font-medium text-app-text mb-2">
          Lead Person *
        </label>
        <input
          id="study-lead-person"
          type="text"
          value={formData.leadPerson}
          onChange={(e) => setFormData({ ...formData, leadPerson: e.target.value })}
          required
          className="form-input"
        />
      </div>

      <div className="flex items-center">
        <input
          type="checkbox"
          id="isLongitudinal"
          checked={formData.isLongitudinal}
          onChange={(e) => setFormData({ ...formData, isLongitudinal: e.target.checked })}
          disabled={!!study}
          className="h-4 w-4 text-app-accent focus:ring-app-accent border-app-border rounded disabled:opacity-50 disabled:cursor-not-allowed"
        />
        <label htmlFor="isLongitudinal" className={`ml-2 block text-sm ${study ? 'text-app-text-muted' : 'text-app-text'}`}>
          Longitudinal Study
          {study && <span className="ml-2 text-xs text-app-text-muted">(cannot be changed after creation)</span>}
        </label>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50"
        >
          {loading ? 'Saving...' : study ? 'Update' : 'Create'}
        </button>
      </div>
    </form>
  )
}
