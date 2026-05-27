import { useState, useMemo } from 'react'
import { specimensApi } from '../lib/api/specimens';
import { useStudies } from '../hooks/useStudies'
import { useSpecimenTypes } from '../hooks/useReferenceData'
import { PageError, getQueryErrorMessage } from '../ui'

interface SpecimenEntry {
  studyId?: number
  studyShortCode: string
  subjectName: string
  specimenTypeName: string
  collectionDate?: string
  containerBarcode?: string
}

interface CollectionSpecimenEntryProps {
  collectionType: 'micronix_plate' | 'cryovial_box'
  collectionId: number
  positions: string[]
  onSuccess?: () => void
  onCancel?: () => void
}

export default function CollectionSpecimenEntry({
  collectionType,
  collectionId: _collectionId,
  positions,
  onSuccess,
  onCancel,
}: CollectionSpecimenEntryProps) {
  const studiesQuery = useStudies(undefined, { page: 1, limit: 10000 })
  const specimenTypesQuery = useSpecimenTypes({ silent: true })
  const studies = studiesQuery.data?.studies ?? []
  const specimenTypes = specimenTypesQuery.data ?? []

  const [entries, setEntries] = useState<Map<string, SpecimenEntry>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [workflowError, setWorkflowError] = useState<string | null>(null)

  const readError = useMemo(() => {
    if (studiesQuery.isError) {
      return getQueryErrorMessage(studiesQuery.error, 'Failed to load studies')
    }
    if (specimenTypesQuery.isError) {
      return getQueryErrorMessage(specimenTypesQuery.error, 'Failed to load specimen types')
    }
    return null
  }, [studiesQuery.isError, studiesQuery.error, specimenTypesQuery.isError, specimenTypesQuery.error])

  const catalogLoading = studiesQuery.isLoading || specimenTypesQuery.isLoading

  const retryCatalogs = () => {
    void studiesQuery.refetch()
    void specimenTypesQuery.refetch()
  }

  const updateEntry = (position: string, field: keyof SpecimenEntry, value: string | number | undefined) => {
    const newEntries = new Map(entries)
    const current = newEntries.get(position) || {
      studyShortCode: '',
      subjectName: '',
      specimenTypeName: '',
    }
    
    newEntries.set(position, {
      ...current,
      [field]: value,
      ...(field === 'studyShortCode' && {
        studyId: studies.find(s => s.shortCode === value)?.id,
      }),
    })
    
    setEntries(newEntries)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setWorkflowError(null)

    try {
      const validEntries: Array<SpecimenEntry & { position: string }> = []
      
      for (const [position, entry] of entries.entries()) {
        if (entry.studyShortCode && entry.subjectName && entry.specimenTypeName) {
          validEntries.push({ ...entry, position })
        }
      }

      if (validEntries.length === 0) {
        setWorkflowError('Please fill in at least one specimen entry')
        setSubmitting(false)
        return
      }

      const specimens = validEntries.map(entry => ({
        sourceType: 'subject' as const,
        studyShortCode: entry.studyShortCode,
        subjectName: entry.subjectName,
        specimenTypeName: entry.specimenTypeName,
        collectionDate: entry.collectionDate || undefined,
        containerBarcode: entry.containerBarcode || undefined,
      }))

      const response = await specimensApi.createBulk({ specimens })
      
      if (response.errors && response.errors.length > 0) {
        setWorkflowError(`Some specimens failed to create: ${response.errors.map((e: { error: string }) => e.error).join(', ')}`)
      } else {
        onSuccess?.()
      }
    } catch (err: unknown) {
      setWorkflowError(getQueryErrorMessage(err, 'Failed to create specimens'))
    } finally {
      setSubmitting(false)
    }
  }

  if (readError) {
    return (
      <div className="bg-app-card rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-app-text">Add Specimens to Collection</h2>
        <PageError title="Could not load form options" message={readError} onRetry={retryCatalogs} />
      </div>
    )
  }

  if (catalogLoading) {
    return (
      <div className="bg-app-card rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4 text-app-text">Add Specimens to Collection</h2>
        <p className="text-sm text-app-text-muted">Loading studies and specimen types…</p>
      </div>
    )
  }

  return (
    <div className="bg-app-card rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-app-text">Add Specimens to Collection</h2>
      
      {workflowError && (
        <div className="bg-app-trend-down/10 border border-app-trend-down text-app-trend-down px-4 py-3 rounded mb-4">
          {workflowError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-app-surface sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-app-text border-b">Position</th>
                <th className="px-3 py-2 text-left font-medium text-app-text border-b">Study</th>
                <th className="px-3 py-2 text-left font-medium text-app-text border-b">Subject Name</th>
                <th className="px-3 py-2 text-left font-medium text-app-text border-b">Specimen Type</th>
                <th className="px-3 py-2 text-left font-medium text-app-text border-b">Collection Date</th>
                {collectionType === 'micronix_plate' && (
                  <th className="px-3 py-2 text-left font-medium text-app-text border-b">Barcode</th>
                )}
              </tr>
            </thead>
            <tbody>
              {positions.map((position) => {
                const entry = entries.get(position) || {
                  studyShortCode: '',
                  subjectName: '',
                  specimenTypeName: '',
                }
                
                return (
                  <tr key={position} className="hover:bg-app-surface">
                    <td className="px-3 py-2 border-b font-mono text-app-text">{position}</td>
                    <td className="px-3 py-2 border-b">
                      <select
                        value={entry.studyShortCode}
                        onChange={(e) => {
                          const study = studies.find(s => s.shortCode === e.target.value)
                          updateEntry(position, 'studyShortCode', e.target.value)
                          if (study) {
                            updateEntry(position, 'studyId', study.id)
                          }
                        }}
                        className="w-full px-2 py-1 border border-app-border rounded text-sm"
                      >
                        <option value="">Select study</option>
                        {studies.map((study) => (
                          <option key={study.id} value={study.shortCode}>
                            {study.shortCode} - {study.title}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border-b">
                      <input
                        type="text"
                        value={entry.subjectName}
                        onChange={(e) => updateEntry(position, 'subjectName', e.target.value)}
                        placeholder="Subject name"
                        className="w-full px-2 py-1 border border-app-border rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 border-b">
                      <select
                        value={entry.specimenTypeName}
                        onChange={(e) => updateEntry(position, 'specimenTypeName', e.target.value)}
                        className="w-full px-2 py-1 border border-app-border rounded text-sm"
                      >
                        <option value="">Select type</option>
                        {specimenTypes.map((type) => (
                          <option key={type.id} value={type.name}>
                            {type.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2 border-b">
                      <input
                        type="date"
                        value={entry.collectionDate || ''}
                        onChange={(e) => updateEntry(position, 'collectionDate', e.target.value)}
                        className="w-full px-2 py-1 border border-app-border rounded text-sm"
                      />
                    </td>
                    {collectionType === 'micronix_plate' && (
                      <td className="px-3 py-2 border-b">
                        <input
                          type="text"
                          value={entry.containerBarcode || ''}
                          onChange={(e) => updateEntry(position, 'containerBarcode', e.target.value)}
                          placeholder="Barcode"
                          className="w-full px-2 py-1 border border-app-border rounded text-sm"
                        />
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="flex justify-end space-x-3 pt-4 border-t">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-app-border rounded-lg text-app-text hover:bg-app-surface"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 bg-app-accent text-white rounded-lg hover:bg-app-accent-hover disabled:opacity-50 font-medium"
          >
            {submitting ? 'Creating...' : 'Create Specimens'}
          </button>
        </div>
      </form>
    </div>
  )
}
