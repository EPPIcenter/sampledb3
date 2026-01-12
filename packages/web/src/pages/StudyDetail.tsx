import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { studiesApi, subjectsApi, type Study, type StudySubject, type StudySummary, type StudyTimelineData } from '../lib/api'
import api from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import DataTable, { Column } from '../components/DataTable'
import Pagination from '../components/Pagination'
import ExportModal from '../components/ExportModal'
import StudyStats from '../components/StudyStats'
import StudyTimeline from '../components/StudyTimeline'
import DateFilterControls from '../components/DateFilterControls'
import SubjectForm from '../components/forms/SubjectForm'
import StudyForm from '../components/forms/StudyForm'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import SubjectMergeModal from '../components/SubjectMergeModal'

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [study, setStudy] = useState<Study | null>(null)
  const [subjects, setSubjects] = useState<StudySubject[]>([])
  const [summary, setSummary] = useState<StudySummary | null>(null)
  const [timeline, setTimeline] = useState<StudyTimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [studyLoading, setStudyLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [subjectsPage, setSubjectsPage] = useState(1)
  const [subjectsTotal, setSubjectsTotal] = useState(0)
  const [subjectsTotalPages, setSubjectsTotalPages] = useState(1)
  const [specimenCount, setSpecimenCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [createSubjectModalOpen, setCreateSubjectModalOpen] = useState(false)
  const [editStudyModalOpen, setEditStudyModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = (searchParams.get('tab') as 'overview' | 'timeline' | 'subjects') || 'overview'
  const hasProcessedCreateSubject = useRef(false)

  const setActiveTab = (tab: 'overview' | 'timeline' | 'subjects') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  // Check for createSubject query param and open modal (only once per mount)
  useEffect(() => {
    const createSubject = searchParams.get('createSubject')
    if (createSubject === 'true' && !hasProcessedCreateSubject.current) {
      hasProcessedCreateSubject.current = true
      setCreateSubjectModalOpen(true)
      // Remove the query param after opening modal
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('createSubject')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  // Reset the ref when the study ID changes
  useEffect(() => {
    hasProcessedCreateSubject.current = false
  }, [id])

  // Close modals on Escape
  useHotkey('escape', () => {
    if (createSubjectModalOpen) {
      setCreateSubjectModalOpen(false)
    }
    if (editStudyModalOpen) {
      setEditStudyModalOpen(false)
    }
    if (mergeModalOpen) {
      setMergeModalOpen(false)
    }
  }, { enabled: createSubjectModalOpen || editStudyModalOpen || mergeModalOpen, enableOnFormTags: true })

  const limit = 50 // Default page size, matches backend DEFAULT_PAGE_SIZE

  useEffect(() => {
    if (id) {
      loadStudy()
      loadSubjects()
      loadSummary()
      loadTimeline()
    }
  }, [id, subjectsPage])

  useEffect(() => {
    if (study?.shortCode) {
      loadSpecimenCount()
    }
  }, [study?.shortCode])

  const loadStudy = async () => {
    try {
      setStudyLoading(true)
      const response = await studiesApi.get(parseInt(id!))
      setStudy(response.study)
    } catch (error) {
      console.error('Failed to load study:', error)
    } finally {
      setStudyLoading(false)
    }
  }

  const loadSubjects = async () => {
    try {
      setLoading(true)
      const response = await studiesApi.getSubjects(parseInt(id!), { page: subjectsPage, limit })
      setSubjects(response.subjects || [])
      if (response.pagination) {
        setSubjectsTotal(response.pagination.total)
        setSubjectsTotalPages(response.pagination.totalPages)
      } else {
        // Pagination should always be present - handle missing pagination as error case
        console.warn('Missing pagination in subjects response')
        setSubjectsTotal(response.subjects?.length || 0)
        setSubjectsTotalPages(1)
      }
    } catch (error) {
      console.error('Failed to load subjects:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadSpecimenCount = async () => {
    try {
      const response = await api.get('/specimens', {
        params: { study: study?.shortCode, limit: 1 },
      })
      // Use pagination total instead of array length
      setSpecimenCount(response.data.pagination?.total || 0)
    } catch (error) {
      console.error('Failed to load specimen count:', error)
    }
  }

  const loadSummary = async () => {
    try {
      setSummaryLoading(true)
      const response = await studiesApi.getSummary(parseInt(id!))
      setSummary(response)
    } catch (error) {
      console.error('Failed to load study summary:', error)
    } finally {
      setSummaryLoading(false)
    }
  }

  const loadTimeline = async () => {
    try {
      setTimelineLoading(true)
      const response = await studiesApi.getTimeline(parseInt(id!))
      setTimeline(response)
    } catch (error) {
      console.error('Failed to load study timeline:', error)
    } finally {
      setTimelineLoading(false)
    }
  }


  if (studyLoading) {
    return <SkeletonDetailPage sections={2} />
  }

  if (!study) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Study not found</div>
      </div>
    )
  }

  const totalPages = subjectsTotalPages

  // Filter subjects by search query (client-side)
  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleMergeSuccess = () => {
    loadSubjects() // Refresh the subjects list
    setMergeModalOpen(false)
  }

  // Define columns for the DataTable
  const subjectColumns: Column<StudySubject>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
    },
    {
      key: 'specimenCount',
      label: 'Specimens',
      sortable: true,
      render: (value) => (value ?? 0).toLocaleString(),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (value) => new Date(value as string).toLocaleDateString(),
    },
    {
      key: 'lastUpdated',
      label: 'Last Updated',
      sortable: true,
      render: (value) => new Date(value as string).toLocaleDateString(),
    },
  ]

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Studies', to: '/studies' },
            { label: study.title },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{study.title}</h1>
            <p className="text-gray-500 mt-1">Code: {study.shortCode}</p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setEditStudyModalOpen(true)}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 font-medium"
            >
              Edit Study
            </button>
            <button
              onClick={() => setCreateSubjectModalOpen(true)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium"
            >
              Create Subject
            </button>
            <button
              onClick={() => setMergeModalOpen(true)}
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
            >
              Merge Subjects
            </button>
            <button
              onClick={() => setExportModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Export Data
            </button>
          </div>
        </div>
      </div>

      {/* Study Info */}
      {study.description && (
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-2 text-gray-900">Description</h2>
          <p className="text-gray-600">{study.description}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b border-gray-100">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              Overview
            </button>
            {study.isLongitudinal && (
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'timeline'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
                }`}
              >
                Timeline
              </button>
            )}
            <button
              onClick={() => setActiveTab('subjects')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'subjects'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-200'
              }`}
            >
              Subjects
            </button>
          </nav>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div>
          {summaryLoading ? (
            <div className="text-center py-8">Loading summary...</div>
          ) : summary ? (
            <>
              <div className="bg-white rounded-lg shadow p-4 mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-3">Date Filter</h3>
                <p className="text-xs text-gray-500 mb-3">
                  Filter statistics and charts by collection date. Default minimum is year 2000 to exclude invalid dates.
                </p>
                <DateFilterControls
                  maxAvailableDate={summary.summary.collectionDateRange?.latest.split('T')[0]}
                />
              </div>
              <StudyStats summary={summary.summary} timelineData={timeline || undefined} />
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">Failed to load summary</div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && study.isLongitudinal && (
        <div>
          {timelineLoading ? (
            <div className="text-center py-8">Loading timeline...</div>
          ) : timeline ? (
            <StudyTimeline data={timeline} />
          ) : (
            <div className="text-center py-8 text-gray-500">Failed to load timeline</div>
          )}
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">Subjects</h2>
              <div className="w-64">
                <input
                  type="text"
                  placeholder="Search subjects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          </div>
          <div className="p-6">
            <DataTable
              data={filteredSubjects}
              columns={subjectColumns}
              onRowClick={(subject) => navigate(`/subjects/${subject.id}`)}
              loading={loading}
              emptyMessage="No subjects found"
            />
            {!loading && totalPages > 1 && (
              <Pagination
                currentPage={subjectsPage}
                totalPages={totalPages}
                onPageChange={setSubjectsPage}
                totalItems={subjectsTotal}
                itemsPerPage={limit}
              />
            )}
          </div>
        </div>
      )}

      <ExportModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        studyCode={study.shortCode}
        studyId={study.id}
        subjects={subjects}
      />

      <SubjectMergeModal
        isOpen={mergeModalOpen}
        onClose={() => setMergeModalOpen(false)}
        studyId={study.id}
        onSuccess={handleMergeSuccess}
      />

      {createSubjectModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
              onClick={() => setCreateSubjectModalOpen(false)}
            />
            <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Create Subject</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setCreateSubjectModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <SubjectForm
              studyId={study.id}
              studyShortCode={study.shortCode}
              onSuccess={(subjectId) => {
                setCreateSubjectModalOpen(false)
                loadSubjects()
                navigate(`/subjects/${subjectId}`)
              }}
              onCancel={() => setCreateSubjectModalOpen(false)}
            />
              </div>
            </div>
          </div>
        </div>
      )}

      {editStudyModalOpen && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
              onClick={() => setEditStudyModalOpen(false)}
            />
            <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Edit Study</h2>
              <button
                type="button"
                className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                onClick={() => setEditStudyModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <StudyForm
              study={study}
              onSuccess={() => {
                setEditStudyModalOpen(false)
                loadStudy()
              }}
            />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
