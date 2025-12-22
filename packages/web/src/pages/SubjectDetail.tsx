import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { subjectsApi, type SubjectSummaryResponse } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SimpleTimeline from '../components/SimpleTimeline'
import { getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'
import SpecimenForm from '../components/forms/SpecimenForm'
import SubjectForm from '../components/forms/SubjectForm'

export default function SubjectDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [summaryData, setSummaryData] = useState<SubjectSummaryResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [createSpecimenModalOpen, setCreateSpecimenModalOpen] = useState(false)
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false)

  useEffect(() => {
    if (id) {
      loadSummary()
    }
  }, [id])

  const loadSummary = async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await subjectsApi.getSummary(parseInt(id!))
      setSummaryData(response.data)
    } catch (err: any) {
      console.error('Failed to load subject summary:', err)
      setError(err.response?.data?.error || 'Failed to load subject summary')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
  }

  if (error || !summaryData) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">
          {error || 'Subject not found'}
        </div>
      </div>
    )
  }

  const { subject, specimens, summary } = summaryData
  const study = subject.study

  const formatDateRange = () => {
    if (!summary.collectionDateRange) return 'No collection dates'
    const { earliest, latest } = summary.collectionDateRange
    const earliestDate = new Date(earliest).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    const latestDate = new Date(latest).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })
    if (earliest === latest) {
      return earliestDate
    }
    return `${earliestDate} - ${latestDate}`
  }

  const formatContainerTypesSummary = () => {
    const entries = Object.entries(summary.containerTypes)
    if (entries.length === 0) return 'No containers'
    
    return entries
      .map(([type, count]) => {
        const name = getContainerTypeName(type)
        return `${count} ${name}${count > 1 ? 's' : ''}`
      })
      .join(', ')
  }


  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Studies', to: '/studies' },
            ...(study ? [{ label: study.title, to: `/studies/${study.id}` }] : []),
            { label: subject.name },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{subject.name}</h1>
            {study && (
              <p className="text-gray-500 mt-1">
                Study: <Link to={`/studies/${study.id}`} className="text-blue-600 hover:underline">{study.title}</Link>
              </p>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setEditSubjectModalOpen(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              Edit Subject
            </button>
            <button
              onClick={() => setCreateSpecimenModalOpen(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              Add Specimen
            </button>
          </div>
        </div>
      </div>

      {/* Textual Summary Section */}
      <div className="bg-white rounded-lg shadow p-6 mb-8">
        <h2 className="text-xl font-semibold mb-4 text-gray-900">Summary</h2>
        <div className="space-y-3">
          <div>
            <p className="text-sm text-gray-500 mb-2">Specimen Types</p>
            {summary.specimenTypes.length === 0 ? (
              <p className="text-gray-900 font-medium">No specimens</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {summary.specimenTypes.map(({ name, count }) => (
                  <div key={name} className="flex items-center gap-1.5 bg-gray-50 rounded-md px-2 py-1">
                    <div className="text-blue-600">
                      {getSpecimenTypeIcon(name)}
                    </div>
                    <span className="text-sm text-gray-900 font-medium">{name}</span>
                    <span className="text-xs text-gray-500">({count})</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-start space-x-3">
            <div className="text-green-600 mt-0.5">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 01-8 0V7a4 4 0 118 0v3zm-4 1a2 2 0 100-4 2 2 0 000 4z" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Aliquots</p>
              <p className="text-gray-900 font-medium">{summary.totalAliquots.toLocaleString()}</p>
            </div>
          </div>

          {summary.collectionDateRange && (
            <div className="flex items-start space-x-3">
              <div className="text-purple-600 mt-0.5">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Collection Date Range</p>
                <p className="text-gray-900 font-medium">{formatDateRange()}</p>
              </div>
            </div>
          )}

          {Object.keys(summary.containerTypes).length > 0 && (
            <div className="flex items-start space-x-3">
              <div className="text-orange-600 mt-0.5">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-gray-500">Container Types</p>
                <p className="text-gray-900 font-medium">{formatContainerTypesSummary()}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Enriched Timeline View */}
      {specimens.length > 0 && (
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-lg font-semibold mb-3 text-gray-900">Specimens</h2>
          <SimpleTimeline specimens={specimens} />
        </div>
      )}

      {createSpecimenModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-30"
            onClick={() => setCreateSpecimenModalOpen(false)}
          />
          <div className="relative z-50 w-full max-w-3xl mx-auto bg-white rounded-lg shadow-lg p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Add Specimen</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setCreateSpecimenModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <SpecimenForm
              subjectId={subject.id}
              studyId={study?.id}
              studyShortCode={study?.shortCode}
              subjectName={subject.name}
              onSuccess={() => {
                setCreateSpecimenModalOpen(false)
                loadSummary()
              }}
            />
          </div>
        </div>
      )}

      {editSubjectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black bg-opacity-30"
            onClick={() => setEditSubjectModalOpen(false)}
          />
          <div className="relative z-50 w-full max-w-2xl mx-auto bg-white rounded-lg shadow-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Edit Subject</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setEditSubjectModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <SubjectForm
              subject={subject}
              studyShortCode={study?.shortCode}
              onSuccess={() => {
                setEditSubjectModalOpen(false)
                loadSummary()
              }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
