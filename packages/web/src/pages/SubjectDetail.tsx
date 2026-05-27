import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import SimpleTimeline from '../components/SimpleTimeline'
import { getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'
import SpecimenForm from '../components/forms/SpecimenForm'
import SubjectForm from '../components/forms/SubjectForm'
import { useUser } from '../contexts/UserContext'
import { invalidateSubjectDetail, useSubjectSummary } from '../hooks/useSubjects'
import {
  Button,
  DetailPageSkeleton,
  Modal,
  PageError,
  fromQuery,
  getQueryErrorMessage,
} from '../ui'
import '../styles/subject-specimen.css'

export default function SubjectDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const { canWrite } = useUser()
  const subjectId = id != null ? parseInt(id, 10) : NaN
  const summaryQuery = useSubjectSummary(subjectId)
  const [createSpecimenModalOpen, setCreateSpecimenModalOpen] = useState(false)
  const [editSubjectModalOpen, setEditSubjectModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const hasProcessedCreateSpecimen = useRef(false)
  const hasProcessedEditSubject = useRef(false)
  const prevIdRef = useRef(id)

  const summaryStatus = fromQuery(summaryQuery)
  const summaryData = summaryQuery.data ?? null

  if (id !== prevIdRef.current) {
    prevIdRef.current = id
    hasProcessedCreateSpecimen.current = false
    hasProcessedEditSubject.current = false
  }

  useEffect(() => {
    const createSpecimen = searchParams.get('createSpecimen')
    if (createSpecimen === 'true' && !hasProcessedCreateSpecimen.current) {
      hasProcessedCreateSpecimen.current = true
      setCreateSpecimenModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('createSpecimen')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  useEffect(() => {
    const editSubject = searchParams.get('editSubject')
    if (editSubject === 'true' && !hasProcessedEditSubject.current) {
      hasProcessedEditSubject.current = true
      setEditSubjectModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('editSubject')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  const refreshSubject = () => {
    const studyId = summaryData?.subject.study?.id ?? summaryData?.subject.studyId
    invalidateSubjectDetail(queryClient, subjectId, studyId)
  }

  if (summaryStatus === 'loading') {
    return <DetailPageSkeleton sections={1} />
  }

  if (summaryStatus === 'error') {
    return (
      <div className="subject-specimen-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <PageError
            title="Could not load subject"
            message={getQueryErrorMessage(summaryQuery.error, 'Failed to load subject summary')}
            onRetry={() => void summaryQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!summaryData) {
    return (
      <div className="subject-specimen-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center py-8 text-app-trend-down">Subject not found</div>
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
    const entries = Object.entries(summary.containerTypes ?? {})
    if (entries.length === 0) return 'No containers'

    return entries
      .map(([type, count]) => {
        const name = getContainerTypeName(type)
        return `${count} ${name}${count > 1 ? 's' : ''}`
      })
      .join(', ')
  }

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 subject-specimen-reveal subject-specimen-reveal-1">
          <EntityBreadcrumbs
            items={[
              { label: 'Studies', to: '/studies' },
              ...(study ? [{ label: study.title, to: `/studies/${study.id}` }] : []),
              { label: subject.name },
            ]}
          />
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold">{subject.name}</h1>
              {study && (
                <p className="mt-1 text-[rgb(var(--app-text-muted))]">
                  Study:{' '}
                  <Link to={`/studies/${study.id}`} className="dashboard-link hover:underline">
                    {study.title}
                  </Link>
                </p>
              )}
            </div>
            {canWrite && (
              <div className="flex gap-3">
                <Button variant="secondary" onClick={() => setEditSubjectModalOpen(true)}>
                  Edit Subject
                </Button>
                <Button onClick={() => setCreateSpecimenModalOpen(true)}>Add Specimen</Button>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card p-6 mb-8 subject-specimen-reveal subject-specimen-reveal-2">
          <h2 className="dashboard-section-title mb-4">Summary</h2>
          <div className="space-y-3">
            <div>
              <p className="text-sm text-[rgb(var(--app-text-muted))] mb-2">Specimen Types</p>
              {summary.specimenTypes.length === 0 ? (
                <p className="font-medium text-[rgb(var(--app-text))]">No specimens</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {summary.specimenTypes.map(({ name, count }) => (
                    <div
                      key={name}
                      className="flex items-center gap-1.5 bg-[rgb(var(--app-accent-muted))] rounded-md px-2 py-1"
                    >
                      <div className="text-[rgb(var(--app-accent))]">{getSpecimenTypeIcon(name)}</div>
                      <span className="text-sm font-medium text-[rgb(var(--app-text))]">{name}</span>
                      <span className="text-xs text-[rgb(var(--app-text-muted))]">({count})</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex items-start space-x-3">
              <div className="text-[rgb(var(--app-accent))] mt-0.5">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 01-8 0V7a4 4 0 118 0v3zm-4 1a2 2 0 100-4 2 2 0 000 4z" />
                </svg>
              </div>
              <div>
                <p className="text-sm text-[rgb(var(--app-text-muted))]">Total Containers</p>
                <p className="font-medium text-[rgb(var(--app-text))]">
                  {summary.totalContainers.toLocaleString()}
                </p>
              </div>
            </div>

            {summary.collectionDateRange && (
              <div className="flex items-start space-x-3">
                <div className="text-[rgb(var(--app-accent))] mt-0.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fillRule="evenodd"
                      d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z"
                      clipRule="evenodd"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">Collection Date Range</p>
                  <p className="font-medium text-[rgb(var(--app-text))]">{formatDateRange()}</p>
                </div>
              </div>
            )}

            {Object.keys(summary.containerTypes ?? {}).length > 0 && (
              <div className="flex items-start space-x-3">
                <div className="text-[rgb(var(--app-accent))] mt-0.5">
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm text-[rgb(var(--app-text-muted))]">Container Types</p>
                  <p className="font-medium text-[rgb(var(--app-text))]">{formatContainerTypesSummary()}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="dashboard-card p-6 mb-8 subject-specimen-reveal subject-specimen-reveal-3">
          <h2 className="dashboard-section-title mb-4">Specimens</h2>
          {specimens.length > 0 ? (
            <SimpleTimeline specimens={specimens} />
          ) : (
            <div className="text-center py-6">
              <p className="text-sm text-[rgb(var(--app-text-muted))] mb-4">No specimens</p>
              {canWrite && (
                <Button onClick={() => setCreateSpecimenModalOpen(true)}>Add Specimen</Button>
              )}
            </div>
          )}
        </div>

        <Modal
          isOpen={createSpecimenModalOpen}
          onClose={() => setCreateSpecimenModalOpen(false)}
          title="Add Specimen"
          size="xl"
          panelClassName="max-h-[90vh] overflow-y-auto"
        >
          <SpecimenForm
            subjectId={subject.id}
            studyId={study?.id}
            studyShortCode={study?.shortCode}
            subjectName={subject.name}
            onSuccess={() => {
              setCreateSpecimenModalOpen(false)
              refreshSubject()
            }}
            onCancel={() => setCreateSpecimenModalOpen(false)}
          />
        </Modal>

        <Modal
          isOpen={editSubjectModalOpen}
          onClose={() => setEditSubjectModalOpen(false)}
          title="Edit Subject"
        >
          <SubjectForm
            subject={subject}
            studyShortCode={study?.shortCode}
            onSuccess={() => {
              setEditSubjectModalOpen(false)
              refreshSubject()
            }}
            onCancel={() => setEditSubjectModalOpen(false)}
          />
        </Modal>
      </div>
    </div>
  )
}
