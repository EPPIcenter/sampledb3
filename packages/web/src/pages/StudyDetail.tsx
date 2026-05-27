import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useHotkey } from '../hooks/useHotkey'
import { useClickOutside } from '../hooks/useClickOutside'
import { studiesApi } from '../lib/api/studies'
import type { StudySubject } from '../lib/api/types'
import StudyDetailHeader from '../components/StudyDetailHeader'
import DataTable, { Column } from '../components/DataTable'
import ExportModal from '../components/ExportModal'
import StudyStats from '../components/StudyStats'
import StudyTimeline from '../components/StudyTimeline'
import DateFilterControls from '../components/DateFilterControls'
import SubjectForm from '../components/forms/SubjectForm'
import StudyForm from '../components/forms/StudyForm'
import SubjectMergeModal from '../components/SubjectMergeModal'
import { useUser } from '../contexts/UserContext'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import {
  studyKeys,
  useStudy,
  useStudySubjects,
  useStudySummary,
  useStudyTimeline,
} from '../hooks/useStudies'
import {
  Button,
  DetailPageSkeleton,
  Modal,
  PageError,
  SectionMessage,
  fromQuery,
  getQueryErrorMessage,
} from '../ui'
import { TUTORIAL_SHORT_CODE_PREFIX } from '../lib/constants'
import '../styles/studies.css'

export default function StudyDetail() {
  const { id } = useParams<{ id: string }>()
  const studyId = parseInt(id ?? '0', 10)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite, isAdmin } = useUser()
  const [subjectsPage, setSubjectsPage] = useState(1)
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

  const studyQuery = useStudy(studyId)
  const subjectsQuery = useStudySubjects(studyId)
  const summaryQuery = useStudySummary(studyId)
  const timelineQuery = useStudyTimeline(studyId)

  const studyStatus = fromQuery(studyQuery)
  const summaryStatus = fromQuery(summaryQuery)
  const timelineStatus = fromQuery(timelineQuery)

  const study = studyQuery.data
  const subjects = subjectsQuery.data?.subjects ?? []
  const summary = summaryQuery.data
  const timeline = timelineQuery.data

  const setActiveTab = (tab: 'overview' | 'timeline' | 'subjects') => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('tab', tab)
      return next
    })
  }

  const invalidateSubjects = () => {
    void queryClient.invalidateQueries({
      queryKey: [...studyKeys.detail(studyId), 'subjects'],
    })
  }

  if (id !== prevIdRef.current) {
    prevIdRef.current = id
    hasProcessedCreateSubject.current = false
    hasProcessedEditStudy.current = false
    hasProcessedDeleteStudy.current = false
  }

  useEffect(() => {
    const createSubject = searchParams.get('createSubject')
    if (createSubject === 'true' && !hasProcessedCreateSubject.current) {
      hasProcessedCreateSubject.current = true
      setCreateSubjectModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('createSubject')
        return next
      })
    }
  }, [searchParams, setSearchParams])

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

  useHotkey(
    'escape',
    () => {
      if (actionsMenuOpen) setActionsMenuOpen(false)
      if (createSubjectModalOpen) setCreateSubjectModalOpen(false)
      if (editStudyModalOpen) setEditStudyModalOpen(false)
      if (mergeModalOpen) setMergeModalOpen(false)
      if (deleteModalOpen) {
        setDeleteModalOpen(false)
        setDeleteConfirmInput('')
        setDeleteError(null)
      }
    },
    {
      enabled:
        actionsMenuOpen ||
        createSubjectModalOpen ||
        editStudyModalOpen ||
        mergeModalOpen ||
        deleteModalOpen,
      enableOnFormTags: true,
    }
  )

  useClickOutside(actionsMenuRef, () => setActionsMenuOpen(false), actionsMenuOpen)

  if (studyStatus === 'loading') {
    return <DetailPageSkeleton sections={2} />
  }

  if (studyStatus === 'error') {
    return (
      <div className="studies-page min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-8 relative z-10">
          <PageError
            title="Could not load study"
            message={getQueryErrorMessage(studyQuery.error, 'Failed to load study')}
            onRetry={() => void studyQuery.refetch()}
          />
        </div>
      </div>
    )
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

  const filteredSubjects = subjects.filter((subject) =>
    subject.name.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleMergeSuccess = () => {
    invalidateSubjects()
    setMergeModalOpen(false)
  }

  const handleDeleteStudy = async () => {
    if (deleteConfirmInput.trim() !== study.shortCode) return
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
        setDeleteError(
          'You do not have permission to delete studies. Only administrators can delete a study.'
        )
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

  const subjectColumns: Column<StudySubject>[] = [
    { key: 'name', label: 'Name', sortable: true },
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

  const canDelete =
    isAdmin || study.shortCode.toUpperCase().startsWith(TUTORIAL_SHORT_CODE_PREFIX)

  const showTimelineTab =
    study.isLongitudinal || (timelineStatus === 'ready' && timeline?.dateRange != null)

  return (
    <div className="studies-page min-h-screen">
      <div className="max-w-screen-2xl mx-auto px-4 py-8 relative z-10">
        <StudyDetailHeader
          study={study}
          summaryLoading={summaryStatus === 'loading'}
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

        <div className="mb-6">
          <div className="border-b" style={{ borderColor: 'rgb(var(--app-border))' }}>
            <nav className="-mb-px flex space-x-8">
              <button
                type="button"
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'overview' ? '' : 'border-transparent hover:border-[rgb(var(--app-border))]'
                }`}
                style={
                  activeTab === 'overview'
                    ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' }
                    : { color: 'rgb(var(--app-text-muted))' }
                }
              >
                Overview
              </button>
              {showTimelineTab && (
                <button
                  type="button"
                  onClick={() => setActiveTab('timeline')}
                  className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                    activeTab === 'timeline' ? '' : 'border-transparent hover:border-[rgb(var(--app-border))]'
                  }`}
                  style={
                    activeTab === 'timeline'
                      ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' }
                      : { color: 'rgb(var(--app-text-muted))' }
                  }
                >
                  Timeline
                </button>
              )}
              <button
                type="button"
                onClick={() => setActiveTab('subjects')}
                className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                  activeTab === 'subjects' ? '' : 'border-transparent hover:border-[rgb(var(--app-border))]'
                }`}
                style={
                  activeTab === 'subjects'
                    ? { borderBottomColor: 'rgb(var(--app-accent))', color: 'rgb(var(--app-accent))' }
                    : { color: 'rgb(var(--app-text-muted))' }
                }
              >
                Subjects
              </button>
            </nav>
          </div>
        </div>

        {activeTab === 'overview' && (
          <div>
            {summaryStatus === 'loading' && (
              <SectionMessage message="Loading summary…" variant="loading" />
            )}
            {summaryStatus === 'error' && (
              <SectionMessage message="Failed to load summary" variant="error" />
            )}
            {summaryStatus === 'ready' && summary && (
              <>
                <div className="dashboard-card rounded-xl p-4 mb-6">
                  <h3 className="text-sm font-medium mb-3 text-app-text">Date Filter</h3>
                  <p className="text-xs mb-3 text-app-text-muted">
                    Filter statistics and charts by collection date. Default minimum is year 2000 to
                    exclude invalid dates.
                  </p>
                  <DateFilterControls
                    maxAvailableDate={summary.summary.collectionDateRange?.latest.split('T')[0]}
                  />
                </div>
                <StudyStats
                  summary={summary.summary}
                  timelineData={timeline}
                  statCardClassName="dashboard-card p-6 rounded-xl"
                  cardClassName="dashboard-card p-6 rounded-xl"
                />
              </>
            )}
          </div>
        )}

        {activeTab === 'timeline' && showTimelineTab && (
          <div>
            {timelineStatus === 'loading' && (
              <SectionMessage message="Loading timeline…" variant="loading" />
            )}
            {timelineStatus === 'error' && (
              <SectionMessage message="Failed to load timeline" variant="error" />
            )}
            {timelineStatus === 'ready' && timeline && <StudyTimeline data={timeline} />}
          </div>
        )}

        {activeTab === 'subjects' && (
          <div className="dashboard-card rounded-xl overflow-hidden">
            <div className="p-6 border-b" style={{ borderColor: 'rgb(var(--app-border))' }}>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-2">
                  <h2 className="dashboard-section-title text-xl font-semibold">Subjects</h2>
                  <span className="text-sm text-app-text-muted">
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
                    className="w-64 px-4 py-2 border rounded-lg form-input border-app-border"
                  />
                  {canWrite && (
                    <Button
                      variant="primary"
                      className="px-3 py-2 text-sm"
                      onClick={() => setCreateSubjectModalOpen(true)}
                    >
                      Add subject
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <div className="p-6">
              <DataTable
                data={filteredSubjects}
                columns={subjectColumns}
                onRowClick={(subject) => navigate(`/subjects/${subject.id}`)}
                loading={subjectsQuery.isPending}
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

        <Modal
          isOpen={createSubjectModalOpen}
          onClose={() => setCreateSubjectModalOpen(false)}
          title="Create Subject"
        >
          <SubjectForm
            studyId={study.id}
            studyShortCode={study.shortCode}
            onSuccess={(subjectId) => {
              setCreateSubjectModalOpen(false)
              invalidateSubjects()
              navigate(`/subjects/${subjectId}`)
            }}
            onCancel={() => setCreateSubjectModalOpen(false)}
          />
        </Modal>

        <Modal
          isOpen={editStudyModalOpen}
          onClose={() => setEditStudyModalOpen(false)}
          title="Edit Study"
        >
          <StudyForm
            study={study}
            onCancel={() => setEditStudyModalOpen(false)}
            onSuccess={() => setEditStudyModalOpen(false)}
          />
        </Modal>

        <Modal
          isOpen={deleteModalOpen}
          onClose={() => {
            setDeleteModalOpen(false)
            setDeleteConfirmInput('')
            setDeleteError(null)
          }}
          title="Delete study"
          titleClassName="text-xl font-semibold text-app-text"
          size="sm"
          closeDisabled={deleteInProgress}
        >
          <p className="text-sm font-medium text-app-text mb-2">
            You are about to permanently delete the following. This cannot be undone.
          </p>
          <ul className="list-disc list-inside text-sm text-app-text-muted mb-4 space-y-1">
            <li>
              The study &quot;{study.title}&quot; (short code: {study.shortCode})
            </li>
            <li>{(summary?.summary.totalSubjects ?? 0).toLocaleString()} subject(s)</li>
            <li>{(summary?.summary.totalSpecimens ?? 0).toLocaleString()} specimen(s)</li>
            <li>
              {(summary?.summary.totalContainers ?? 0).toLocaleString()} storage container(s) (and any
              tags, derivations, and container-type records)
            </li>
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
            <Button
              variant="secondary"
              disabled={deleteInProgress}
              onClick={() => {
                setDeleteModalOpen(false)
                setDeleteConfirmInput('')
                setDeleteError(null)
              }}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={deleteInProgress}
              disabled={deleteConfirmInput.trim() !== study.shortCode}
              onClick={handleDeleteStudy}
            >
              Delete study
            </Button>
          </div>
        </Modal>
      </div>
    </div>
  )
}
