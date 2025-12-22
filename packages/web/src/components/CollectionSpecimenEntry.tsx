import { useState, useEffect } from 'react'
import { studiesApi, specimenTypesApi, specimensApi, type Study, type SpecimenType } from '../lib/api'
import StudyPicker from './StudyPicker'

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
  collectionId,
  positions,
  onSuccess,
  onCancel,
}: CollectionSpecimenEntryProps) {
  const [studies, setStudies] = useState<Study[]>([])
  const [specimenTypes, setSpecimenTypes] = useState<SpecimenType[]>([])
  const [entries, setEntries] = useState<Map<string, SpecimenEntry>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStudies()
    loadSpecimenTypes()
  }, [])

  const loadStudies = async () => {
    try {
      const response = await studiesApi.list()
      setStudies(response.data.studies)
    } catch (error) {
      console.error('Failed to load studies:', error)
    }
  }

  const loadSpecimenTypes = async () => {
    try {
      const response = await specimenTypesApi.list()
      setSpecimenTypes(response.data.specimenTypes || [])
    } catch (error) {
      console.error('Failed to load specimen types:', error)
    }
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
      // When study changes, update studyId
      ...(field === 'studyShortCode' && {
        studyId: studies.find(s => s.shortCode === value)?.id,
      }),
    })
    
    setEntries(newEntries)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Collect all valid entries
      const validEntries: Array<SpecimenEntry & { position: string }> = []
      
      for (const [position, entry] of entries.entries()) {
        if (entry.studyShortCode && entry.subjectName && entry.specimenTypeName) {
          validEntries.push({ ...entry, position })
        }
      }

      if (validEntries.length === 0) {
        setError('Please fill in at least one specimen entry')
        setLoading(false)
        return
      }

      // Convert to bulk specimen format
      const specimens = validEntries.map(entry => ({
        sourceType: 'subject' as const,
        studyShortCode: entry.studyShortCode,
        subjectName: entry.subjectName,
        specimenTypeName: entry.specimenTypeName,
        collectionDate: entry.collectionDate || undefined,
        containerBarcode: entry.containerBarcode || undefined,
      }))

      const response = await specimensApi.createBulk({ specimens })
      
      if (response.data.errors && response.data.errors.length > 0) {
        setError(`Some specimens failed to create: ${response.data.errors.map(e => e.error).join(', ')}`)
      } else {
        if (onSuccess) {
          onSuccess()
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create specimens')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-xl font-semibold mb-4 text-gray-900">Add Specimens to Collection</h2>
      
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Position</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Study</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Subject Name</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Specimen Type</th>
                <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Collection Date</th>
                {collectionType === 'micronix_plate' && (
                  <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">Barcode</th>
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
                  <tr key={position} className="hover:bg-gray-50">
                    <td className="px-3 py-2 border-b font-mono text-gray-900">{position}</td>
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
                        className="w-full px-2 py-1 border border-gray-100 rounded text-sm"
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
                        className="w-full px-2 py-1 border border-gray-100 rounded text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 border-b">
                      <select
                        value={entry.specimenTypeName}
                        onChange={(e) => updateEntry(position, 'specimenTypeName', e.target.value)}
                        className="w-full px-2 py-1 border border-gray-100 rounded text-sm"
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
                        className="w-full px-2 py-1 border border-gray-100 rounded text-sm"
                      />
                    </td>
                    {collectionType === 'micronix_plate' && (
                      <td className="px-3 py-2 border-b">
                        <input
                          type="text"
                          value={entry.containerBarcode || ''}
                          onChange={(e) => updateEntry(position, 'containerBarcode', e.target.value)}
                          placeholder="Barcode"
                          className="w-full px-2 py-1 border border-gray-100 rounded text-sm"
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
              className="px-4 py-2 border border-gray-100 rounded-lg text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
          >
            {loading ? 'Creating...' : 'Create Specimens'}
          </button>
        </div>
      </form>
    </div>
  )
}

