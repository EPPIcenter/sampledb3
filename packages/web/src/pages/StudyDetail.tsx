import { useEffect, useState, useRef } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useHotkey } from '../hooks/useHotkey'
import { useClickOutside } from '../hooks/useClickOutside'
import { studiesApi, subjectsApi, type Study, type StudySubject, type StudySummary, type StudyTimelineData } from '../lib/api'
import api from '../lib/api'
import StudyDetailHeader from '../components/StudyDetailHeader'
import DataTable, { Column } from '../components/DataTable'
import ExportModal from '../components/ExportModal'
import StudyStats from '../components/StudyStats'
import StudyTimeline from '../components/StudyTimeline'
import DateFilterControls from '../components/DateFilterControls'
import SubjectForm from '../components/forms/SubjectForm'
import StudyForm from '../components/forms/StudyForm'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import SubjectMergeModal from '../components/SubjectMergeModal'
import ModalPortal from '../components/ModalPortal'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import { TUTORIAL_SHORT_CODE_PREFIX } from '../lib/constants'
import '../styles/studies.css'

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
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- URL param may be missing
  const activeTab = (searchParams.get('tab') as 'overview' | 'timeline' | 'subjects') || 'overview'
  const hasProcessedCreateSubject = useRef(false)
  const hasProcessedEditStudy = useRef(false)
  const hasProcessedDeleteStudy = useRef(false)
  const prevIdRef = useRef(id)
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false)
  const actionsMenuRef = useRef<HTMLDivElement>(null)

  const setActiveTab = (tab: 'overview' | 'timeline' | 'subjects') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  // Reset the ref when the study ID changes (during render so ref is correct before any effect)
  if (id !== prevIdRef.current) {
    prevIdRef.current = id
    hasProcessedCreateSubject.current = false
    hasProcessedEditStudy.current = false
    hasProcessedDeleteStudy.current = false
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

  // Open edit / delete modals from command palette query params (once per navigation)
  useEffect(() => {
    const editStudy = searchParams.get('editStudy')
    if (editStudy === 'true' && !hasProcessedEditStudy.current) {
      hasProcessedEditStudy.current = true
      setEditStudyModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('editStudy')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const deleteStudy = searchParams.get('deleteStudy')
    if (deleteStudy === 'true' && !hasProcessedDeleteStudy.current) {
      hasProcessedDeleteStudy.current = true
      setDeleteModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('deleteStudy')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  // Close modals and actions menu on Escape
  useHotkey('escape', () => {
    if (actionsMenuOpen) {
      setActionsMenuOpen(false)
    }
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
  }, { enabled: actionsMenuOpen || createSubjectModalOpen || editStudyModalOpen || mergeModalOpen || deleteModalOpen, enableOnFormTags: true })

  // Close actions dropdown on click outside
  useClickOutside(actionsMenuRef, () => setActionsMenuOpen(false), actionsMenuOpen)

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
      if (response.study.shortCode) {
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
      if (!checkIgnore()) setSubjects(response.subjects)
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
      <div className="studies-page min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Study not found</div>
        </div>
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
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for load race
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

  const canDelete = isAdmin || study.shortCode.toUpperCase().startsWith(TUTORIAL_SHORT_CODE_PREFIX)

  return (
    <div className="studies-page min-h-screen">
      <div className="max-w-screen-2xl mx-auto px-4 py-8 relative z-10">
        <StudyDetailHeader
          study={study}
          summaryLoading={summaryLoading}
          summaryData={summary?.summary}
          canWrite={canWrite}
          canDelete={canDelete}
          actionsMenuOpen={actionsMenuOpen}
          setActionsMenuOpen={setActionsMenuOpen}
          actionsMenuRef={actionsMenuRef}
          onEditStudy={() => setEditStudyModalOpen(true)}
          onMergeSubjects={() => {
            setMergeModalKey((k) => k + 1)
            setMergeModalOpen(true)
          }}
          onCreateSubject={() => setCreateSubjectModalOpen(true)}
          onExport={() => setExportModalOpen(true)}
          onBulkImport={() => navigate(`/studies/${study.id}/import`)}
          onDelete={openDeleteModal}
        />

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b" style={{ borderColor: 'rgb(var(--app-border))' }}>
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? ''
                  : 'border-transparent hover:border-[rgb(var(--app-border))]'
              }`}
              style={activeTab === 'overview' ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' } : { color: 'rgb(var(--app-text-muted))' }}
            >
              Overview
            </button>
            {(study.isLongitudinal || (!timelineLoading && timeline?.dateRange != null)) && (
              <button
                onClick={() => setActiveTab('timeline')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'timeline'
                    ? ''
                    : 'border-transparent hover:border-[rgb(var(--app-border))]'
                }`}
                style={activeTab === 'timeline' ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' } : { color: 'rgb(var(--app-text-muted))' }}
              >
                Timeline
              </button>
            )}
            <button
              onClick={() => setActiveTab('subjects')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'subjects'
                  ? ''
                  : 'border-transparent hover:border-[rgb(var(--app-border))]'
              }`}
              style={activeTab === 'subjects' ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' } : { color: 'rgb(var(--app-text-muted))' }}
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
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>Loading summary...</div>
          ) : summary ? (
            <>
              <div className="dashboard-card rounded-xl p-4 mb-6">
                <h3 className="text-sm font-medium mb-3" style={{ color: 'rgb(var(--app-text))' }}>Date Filter</h3>
                <p className="text-xs mb-3" style={{ color: 'rgb(var(--app-text-muted))' }}>
                  Filter statistics and charts by collection date. Default minimum is year 2000 to exclude invalid dates.
                </p>
                <DateFilterControls
                  maxAvailableDate={summary.summary.collectionDateRange?.latest.split('T')[0]}
                />
              </div>
              <StudyStats
                summary={summary.summary}
                timelineData={timeline || undefined}
                statCardClassName="dashboard-card p-6 rounded-xl"
                cardClassName="dashboard-card p-6 rounded-xl"
              />
            </>
          ) : (
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>Failed to load summary</div>
          )}
        </div>
      )}

      {activeTab === 'timeline' && (study.isLongitudinal || timeline?.dateRange != null) && (
        <div>
          {timelineLoading ? (
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>Loading timeline...</div>
          ) : timeline ? (
            <StudyTimeline data={timeline} />
          ) : (
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>Failed to load timeline</div>
          )}
        </div>
      )}

      {activeTab === 'subjects' && (
        <div className="dashboard-card rounded-xl overflow-hidden">
          <div className="p-6 border-b" style={{ borderColor: 'rgb(var(--app-border))' }}>
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <h2 className="dashboard-section-title text-xl font-semibold">Subjects</h2>
                <span className="text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
                  {filteredSubjects.length} subject{filteredSubjects.length !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder="Search subjects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 px-4 py-2 border rounded-lg form-input"
                  style={{ borderColor: 'rgb(var(--app-border))' }}
                />
                {canWrite && (
                  <button
                    type="button"
                    onClick={() => setCreateSubjectModalOpen(true)}
                    className="px-3 py-2 text-white rounded-lg font-medium text-sm transition-colors"
                    style={{ backgroundColor: 'rgb(var(--app-accent))' }}
                  >
                    Add subject
                  </button>
                )}
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
        <ModalPortal>
          <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-md"
                onClick={() => setCreateSubjectModalOpen(false)}
              />
            <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-text">Create Subject</h2>
              <button
                type="button"
                className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
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
        </ModalPortal>
      )}

      {editStudyModalOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-md"
                onClick={() => setEditStudyModalOpen(false)}
              />
            <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
              <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-text">Edit Study</h2>
              <button
                type="button"
                className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded"
                onClick={() => setEditStudyModalOpen(false)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <StudyForm
              study={study}
              onCancel={() => setEditStudyModalOpen(false)}
              onSuccess={() => {
                setEditStudyModalOpen(false)
                loadStudy()
              }}
            />
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      { }
      {/* eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- guard for modal open with study */}
      {deleteModalOpen && study && (
        <ModalPortal>
          <div className="fixed inset-0 z-[100] overflow-y-auto">
            <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
              <div
                className="fixed inset-0 bg-black/40 backdrop-blur-md"
                onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
              />
            <div className="relative z-10 inline-block align-bottom bg-app-card rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full">
              <div className="bg-app-card px-4 pt-5 pb-4 sm:p-6 sm:pb-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold text-app-text">Delete study</h2>
                  <button
                    type="button"
                    className="text-app-text-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-app-accent rounded disabled:opacity-50"
                    onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
                    aria-label="Close"
                    disabled={deleteInProgress}
                  >
                    ✕
                  </button>
                </div>
                <p className="text-sm font-medium text-app-text mb-2">
                  You are about to permanently delete the following. This cannot be undone.
                </p>
                <ul className="list-disc list-inside text-sm text-app-text-muted mb-4 space-y-1">
                  <li>The study &quot;{study.title}&quot; (short code: {study.shortCode})</li>
                  <li>{(summary?.summary.totalSubjects ?? 0).toLocaleString()} subject(s)</li>
                  <li>{(summary?.summary.totalSpecimens ?? 0).toLocaleString()} specimen(s)</li>
                  <li>{(summary?.summary.totalContainers ?? 0).toLocaleString()} storage container(s) (and any tags, derivations, and container-type records)</li>
                </ul>
                <div className="mb-4">
                  <label htmlFor="delete-confirm" className="block text-sm font-medium text-app-text mb-1">
                    Type the study short code <strong>{study.shortCode}</strong> below to confirm
                  </label>
                  <input
                    id="delete-confirm"
                    type="text"
                    value={deleteConfirmInput}
                    onChange={(e) => setDeleteConfirmInput(e.target.value)}
                    placeholder={study.shortCode}
                    className="w-full px-3 py-2 border border-app-border rounded-lg focus:ring-2 focus:ring-app-trend-down focus:border-app-trend-down"
                    disabled={deleteInProgress}
                    autoComplete="off"
                  />
                </div>
                {deleteError && (
                  <div className="mb-4 p-3 bg-app-trend-down/10 border border-app-trend-down text-app-trend-down text-sm rounded-lg">
                    {deleteError}
                  </div>
                )}
                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => !deleteInProgress && (setDeleteModalOpen(false), setDeleteConfirmInput(''), setDeleteError(null))}
                    disabled={deleteInProgress}
                    className="px-4 py-2 border border-app-border text-app-text rounded-lg hover:bg-app-surface font-medium disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteStudy}
                    disabled={deleteInProgress || deleteConfirmInput.trim() !== study.shortCode}
                    className="px-4 py-2 bg-app-trend-down text-white rounded-lg hover:opacity-90 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {deleteInProgress ? 'Deleting...' : 'Delete study'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
      </div>
    </div>
  )
}
