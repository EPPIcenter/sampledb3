import { useState, useEffect, useRef } from 'react'
import { studiesApi, subjectsApi, type StudySubject } from '../../lib/api'
import { useNavigate } from 'react-router-dom'
import { useModifierHotkey } from '../../hooks/useHotkey'

interface SubjectFormProps {
  studyId?: number
  studyShortCode?: string
  subject?: StudySubject
  onSuccess?: (subjectId: number) => void
  onCancel: () => void
}

export default function SubjectForm({ studyId, studyShortCode, subject, onSuccess, onCancel }: SubjectFormProps) {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nameValidationError, setNameValidationError] = useState<string | null>(null)
  const [studyName, setStudyName] = useState<string | null>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const [formData, setFormData] = useState({
    name: subject?.name || '',
  })

  const effectiveStudyId = subject?.studyId || studyId

  useEffect(() => {
    // Load study details to display
    if (effectiveStudyId) {
      loadStudyById(effectiveStudyId)
    }
  }, [effectiveStudyId])

  const loadStudyById = async (id: number) => {
    try {
      const response = await studiesApi.list()
      const study = response.studies.find((s) => s.id === id)
      if (study) {
        setStudyName(study?.title || null)
      }
    } catch (error) {
      console.error('Failed to load study:', error)
    }
  }

  const handleNameChange = (name: string) => {
    setFormData({ name })
    setNameValidationError(null)

    // Basic validation
    const trimmed = name.trim()
    if (trimmed.length === 0) {
      setNameValidationError('Subject name cannot be empty')
    } else if (trimmed.length > 255) {
      setNameValidationError('Subject name cannot exceed 255 characters')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNameValidationError(null)

    const trimmedName = formData.name.trim()
    if (trimmedName.length === 0) {
      setNameValidationError('Subject name cannot be empty')
      setLoading(false)
      return
    }

    if (!effectiveStudyId) {
      setError('Study ID is required')
      setLoading(false)
      return
    }

    try {
      if (subject) {
        // Update existing subject
        const response = await subjectsApi.update(subject.id, { name: trimmedName })
        if (onSuccess) {
          onSuccess(response.subject.id)
        } else {
          navigate(`/subjects/${response.subject.id}`)
        }
      } else {
        // Create new subject
        const response = await subjectsApi.create({
          studyId: effectiveStudyId,
          name: trimmedName,
        })

        if (onSuccess) {
          onSuccess(response.subject.id)
        } else {
          // Navigate to the newly created subject's detail page
          if (response.subject?.id) {
            navigate(`/subjects/${response.subject.id}`)
          } else {
            navigate(-1)
          }
        }
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.error || (subject ? 'Failed to update subject' : 'Failed to create subject')
      setError(errorMessage)

      // Check if it's a validation error about duplicate name
      if (errorMessage.includes('already exists')) {
        setNameValidationError(errorMessage)
      }
    } finally {
      setLoading(false)
    }
  }

  // Cmd/Ctrl+Enter to submit
  useModifierHotkey('enter', (e) => {
    if (!loading && !nameValidationError && formRef.current) {
      e.preventDefault()
      formRef.current.requestSubmit()
    }
  }, { preventDefault: true, enableOnFormTags: true })

  return (
    <form ref={formRef} onSubmit={handleSubmit} className="space-y-6">
      {error && !nameValidationError && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="subject-study" className="block text-sm font-medium text-gray-700 mb-2">
          Study
        </label>
        <div className="form-input bg-gray-50 text-gray-700">
          {studyName || studyShortCode || (effectiveStudyId ? `Study #${effectiveStudyId}` : 'N/A')}
        </div>
        <p className="mt-1 text-xs text-gray-500">
          {subject ? 'Subject belongs to this study' : 'Subject will be created for this study'}
        </p>
      </div>

      <div>
        <label htmlFor="subject-name" className="block text-sm font-medium text-gray-700 mb-2">
          Subject Name *
        </label>
        <input
          id="subject-name"
          type="text"
          value={formData.name}
          onChange={(e) => handleNameChange(e.target.value)}
          required
          className={`form-input ${nameValidationError ? 'border-red-300' : ''}`}
          placeholder="Enter subject name (e.g., SUBJ-001)"
        />
        {nameValidationError && (
          <p className="mt-1 text-sm text-red-600">{nameValidationError}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          Subject names must be unique within each study
        </p>
      </div>

      <div className="flex justify-end space-x-4">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !!nameValidationError}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          {loading ? (subject ? 'Updating...' : 'Creating...') : (subject ? 'Update Subject' : 'Create Subject')}
        </button>
      </div>
    </form>
  )
}

