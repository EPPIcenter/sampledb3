import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { studiesApi, subjectsApi, type Study, type StudySubject, type StudySummary, type StudyTimelineData } from '../lib/api'
import api from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import DataTable, { Column } from '../components/DataTable'
import ExportModal from '../components/ExportModal'
import StudyStats from '../components/StudyStats'
import StudyTimeline from '../components/StudyTimeline'
import DateFilterControls from '../components/DateFilterControls'
import SubjectForm from '../components/forms/SubjectForm'
import StudyForm from '../components/forms/StudyForm'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import SubjectMergeModal from '../components/SubjectMergeModal'
import { useUser } from '../contexts/UserContext'
import { TUTORIAL_SHORT_CODE_PREFIX } from '../contexts/TutorialContext'

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite, isAdmin } = useUser()
  const [study, setStudy] = useState<Study | null>(null)
  const [subjects, setSubjects] = useState<StudySubject[]>([])
  const [summary, setSummary] = useState<StudySummary | null>(null)
  const [timeline, setTimeline] = useState<StudyTimelineData | null>(null)
  const [loading, setLoading] = useState(true)
  const [studyLoading, setStudyLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(true)
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [subjectsPage, setSubjectsPage] = useState(1)
  const [specimenCount, setSpecimenCount] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const pageSize = 50
  const [exportModalOpen, setExportModalOpen] = useState(false)
  const [createSubjectModalOpen, setCreateSubjectModalOpen] = useState(false)
  const [editStudyModalOpen, setEditStudyModalOpen] = useState(false)
  const [mergeModalOpen, setMergeModalOpen] = useState(false)
  const [mergeModalKey, setMergeModalKey] = useState(0)
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('')
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState(false)
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
    if (deleteModalOpen) {
      setDeleteModalOpen(false)
      setDeleteConfirmInput('')
      setDeleteError(null)
    }
  }, { enabled: createSubjectModalOpen || editStudyModalOpen || mergeModalOpen || deleteModalOpen, enableOnFormTags: true })

  useEffect(() => {
    if (!id) return
    let ignore = false
    const getIgnore = () => ignore
    void loadStudy(getIgnore)
    void loadSubjects(getIgnore)
    void loadSummary(getIgnore)
    void loadTimeline(getIgnore)
    return () => {
      ignore = true
    }
  }, [id])

  const loadStudy = async (getIgnore?: () => boolean) => {
    const checkIgnore = getIgnore ?? (() => false)
    try {
      setStudyLoading(true)
      const response = await studiesApi.get(parseInt(id!))
      if (checkIgnore()) return
      setStudy(response.study)
      if (response.study?.shortCode) {
        void loadSpecimenCount(response.study.shortCode, checkIgnore)
      }
    } catch (error) {
      if (!checkIgnore()) console.error('Failed to load study:', error)
    } finally {
      if (!checkIgnore()) setStudyLoading(false)
    }
  }

  const loadSubjects = async (getIgnore?: () => boolean) => {
    const checkIgnore = getIgnore ?? (() => false)
    try {
      setLoading(true)
      const response = await studiesApi.getSubjects(parseInt(id!))
      if (!checkIgnore()) setSubjects(response.subjects || [])
    } catch (error) {
      if (!checkIgnore()) console.error('Failed to load subjects:', error)
    } finally {
      if (!checkIgnore()) setLoading(false)
    }
  }

  const loadSpecimenCount = async (shortCode: string, getIgnore?: () => boolean) => {
    const checkIgnore = getIgnore ?? (() => false)
    try {
      const response = await api.get('/specimens', {
        params: { study: shortCode, limit: 1 },
      })
      if (!checkIgnore()) setSpecimenCount(response.data.pagination?.total || 0)
    } catch (error) {
      if (!checkIgnore()) console.error('Failed to load specimen count:', error)
    }
  }

  const loadSummary = async (getIgnore?: () => boolean) => {
    const checkIgnore = getIgnore ?? (() => false)
    try {
      setSummaryLoading(true)
      const response = await studiesApi.getSummary(parseInt(id!))
      if (!checkIgnore()) setSummary(response)
    } catch (error) {
      if (!checkIgnore()) console.error('Failed to load study summary:', error)
    } finally {
      if (!checkIgnore()) setSummaryLoading(false)
    }
  }

  const loadTimeline = async (getIgnore?: () => boolean) => {
    const checkIgnore = getIgnore ?? (() => false)
    try {
      setTimelineLoading(true)
      const response = await studiesApi.getTimeline(parseInt(id!))
      if (!checkIgnore()) setTimeline(response)
    } catch (error) {
      if (!checkIgnore()) console.error('Failed to load study timeline:', error)
    } finally {
      if (!checkIgnore()) setTimelineLoading(false)
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

  // Filter subjects by search query (client-side)
  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleMergeSuccess = () => {
    loadSubjects() // Refresh the subjects list
    setMergeModalOpen(false)
  }

  const handleDeleteStudy = async () => {
    if (!study || deleteConfirmInput.trim() !== study.shortCode) return
    setDeleteError(null)
    setDeleteInProgress(true)
    try {
      await studiesApi.delete(study.id)
      setDeleteModalOpen(false)
      setDeleteConfirmInput('')
      navigate('/studies?deleted=1')
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number; data?: { error?: string } } }
      const status = axiosErr.response?.status
      const message = axiosErr.response?.data?.error ?? 'Failed to delete study.'
      if (status === 403) {
        setDeleteError('You do not have permission to delete studies. Only administrators can delete a study.')
      } else if (status === 404) {
        setDeleteError('Study not found. It may have already been deleted.')
      } else {
        setDeleteError(message)
      }
    } finally {
      setDeleteInProgress(false)
    }
  }

  const openDeleteModal = () => {
    setDeleteConfirmInput('')
    setDeleteError(null)
    setDeleteModalOpen(true)
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
            {canWrite && (
              <>
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
                  onClick={() => {
                    setMergeModalKey((k) => k + 1)
                    setMergeModalOpen(true)
                  }}
                  className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 font-medium"
                >
                  Merge Subjects
                </button>
              </>
            )}
            <button
              onClick={() => setExportModalOpen(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Export Data
            </button>
            {(isAdmin || study.shortCode.toUpperCase().startsWith(TUTORIAL_SHORT_CODE_PREFIX)) && (
              <button
                onClick={openDeleteModal}
                className="px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 font-medium"
                data-tutorial="delete-study"
              >
                Delete study
              </button>
            )}
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
              pagination={{
                page: subjectsPage,
                pageSize,
                onPageChange: setSubjectsPage,
                showPagination: true,
              }}
            />
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
        openKey={mergeModalKey}
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

      {deleteModalOpen && study && (
        <div className="fixed inset-0 z-[100] overflow-y-auto">
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div
              className="fixed inset-0 transition-opacity bg-gray-900/40 backdrop-blur-md"
              onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
            />
            <div className="relative z-10 inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-white px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-gray-900">Delete study</h2>
                  <button
                    type="button"
                    className="text-gray-500 hover:text-gray-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded disabled:opacity-50"
                    onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
                    aria-label="Close"
                    disabled={deleteInProgress}
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  You are about to permanently delete the following. This cannot be undone.
                </p>
                <ul className="list-disc list-inside text-sm text-gray-600 mb-4 space-y-1">
                  <li>The study &quot;{study.title}&quot; (short code: {study.shortCode})</li>
                  <li>{(summary?.summary?.totalSubjects ?? 0).toLocaleString()} subject(s)</li>
                  <li>{(summary?.summary?.totalSpecimens ?? 0).toLocaleString()} specimen(s)</li>
                  <li>{(summary?.summary?.totalContainers ?? 0).toLocaleString()} storage container(s) (and any tags, derivations, and container-type records)</li>
                </ul>
                <div className="mb-4">
                  <label htmlFor="delete-confirm" className="block text-sm font-medium text-gray-700 mb-1">
                    Type the study short code <strong>{study.shortCode}</strong> below to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={study.shortCode}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-red-500"
                    disabled={deleteInProgress}
                    autoComplete="off"
                  />
                </div>
                {deleteError && (
                  <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
                    disabled={deleteInProgress}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteStudy}
                    disabled={deleteInProgress || deleteConfirmInput.trim() !== study.shortCode}
                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteInProgress ? 'Deleting...' : 'Delete study'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
