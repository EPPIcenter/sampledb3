import { useEffect, useRef, useState } from 'react'
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import AddContainerForSpecimenModal from '../components/AddContainerForSpecimenModal'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import { useModifierHotkey, useHotkey } from '../hooks/useHotkey'
import { useUser } from '../contexts/UserContext'
import {
  useSpecimen,
  useContainersForSpecimen,
  useSpecimenSourceInfo,
  specimenKeys,
} from '../hooks/useSpecimens'
import {
  Button,
  DetailPageSkeleton,
  PageError,
  SectionMessage,
  fromQuery,
  getQueryErrorMessage,
} from '../ui'
import '../styles/subject-specimen.css'

interface Container {
  id: number
  specimenId: number
  totalQuantity: number
  remainingQuantity: number
  comment?: string
  containerType?: string
  unit?: { id: number; symbol: string; name: string }
  location?: { path?: string; name?: string }
  locationPath?: string
  micronixTube?: { plateName?: string; plateId?: number; position?: string }
  cryovialTube?: { boxName?: string; boxId?: number; position?: string }
}

export default function SpecimenDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useUser()
  const specimenId = id != null ? parseInt(id, 10) : NaN
  const specimenQuery = useSpecimen(specimenId)
  const containersQuery = useContainersForSpecimen(id)
  const [addContainerModalOpen, setAddContainerModalOpen] = useState(false)
  const [searchParams, setSearchParams] = useSearchParams()
  const hasProcessedAddContainer = useRef(false)
  const prevSpecimenRouteId = useRef(id)

  const specimen = specimenQuery.data ?? null
  const sourceInfoQuery = useSpecimenSourceInfo(specimen)
  const sourceInfo = sourceInfoQuery.data ?? null
  const containers = (containersQuery.data ?? []) as Container[]

  const specimenStatus = fromQuery(specimenQuery)
  const containersStatus = fromQuery(containersQuery)
  const sourceStatus = fromQuery(sourceInfoQuery)

  if (id !== prevSpecimenRouteId.current) {
    prevSpecimenRouteId.current = id
    hasProcessedAddContainer.current = false
  }

  useEffect(() => {
    const add = searchParams.get('addContainer')
    if (add === 'true' && !hasProcessedAddContainer.current) {
      hasProcessedAddContainer.current = true
      setAddContainerModalOpen(true)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.delete('addContainer')
        return next
      })
    }
  }, [searchParams, setSearchParams])

  useHotkey(
    'escape',
    () => {
      if (addContainerModalOpen) setAddContainerModalOpen(false)
    },
    { enabled: addContainerModalOpen, enableOnFormTags: true }
  )

  useHotkey(
    'backspace',
    () => {
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
      ) {
        return
      }
      navigate('/specimens')
    },
    { preventDefault: true }
  )

  useModifierHotkey(
    '[',
    () => {
      const activeElement = document.activeElement
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')
      ) {
        return
      }
      navigate('/specimens')
    },
    { preventDefault: true }
  )

  if (specimenStatus === 'loading') {
    return <DetailPageSkeleton sections={1} />
  }

  if (specimenStatus === 'error') {
    return (
      <div className="subject-specimen-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <PageError
            title="Could not load specimen"
            message={getQueryErrorMessage(specimenQuery.error, 'Failed to load specimen')}
            onRetry={() => void specimenQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!specimen) {
    return (
      <div className="subject-specimen-page">
        <div className="container mx-auto px-4 py-8 relative z-[1]">
          <div className="text-center py-8 text-app-trend-down">Specimen not found</div>
        </div>
      </div>
    )
  }

  const breadcrumbItems = []
  if (sourceInfo?.type === 'subject' && sourceInfo.study) {
    breadcrumbItems.push(
      { label: 'Studies', to: '/studies' },
      {
        label: sourceInfo.study.title || sourceInfo.study.code,
        to: `/studies/${sourceInfo.study.id}`,
      },
      {
        label: sourceInfo.name || `Subject #${sourceInfo.id}`,
        to: `/subjects/${sourceInfo.id}`,
      }
    )
  } else if (sourceInfo?.type === 'control') {
    breadcrumbItems.push({ label: 'Blood Controls', to: '/blood-controls' })
    if (sourceInfo.definition) {
      breadcrumbItems.push({
        label: sourceInfo.definition.name,
        to: `/blood-controls/${sourceInfo.definition.id}`,
      })
    }
    breadcrumbItems.push({
      label: sourceInfo.name || `Batch #${sourceInfo.id}`,
      to: `/blood-controls/batches/${sourceInfo.id}`,
    })
  } else {
    breadcrumbItems.push({ label: 'Specimens', to: '/specimens' })
  }
  breadcrumbItems.push({
    label: specimen.specimenType ? `${specimen.specimenType.name} Specimen` : 'Specimen',
  })

  const showSourceCard =
    specimen.studySubjectId != null || specimen.controlBatchId != null

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 subject-specimen-reveal subject-specimen-reveal-1">
          <EntityBreadcrumbs items={breadcrumbItems} />
          <div className="flex items-center gap-3 mt-2">
            {specimen.specimenType && (
              <span className="text-[rgb(var(--app-accent))]">
                {getSpecimenTypeIcon(specimen.specimenType.name)}
              </span>
            )}
            <h1 className="text-3xl font-bold">
              {specimen.specimenType ? `${specimen.specimenType.name} Specimen` : 'Specimen'}
            </h1>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 subject-specimen-reveal subject-specimen-reveal-2">
          <div className="dashboard-card p-4">
            <h2 className="dashboard-section-title text-base mb-3">Details</h2>
            <dl className="space-y-1.5">
              {specimen.specimenType && (
                <div>
                  <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Type</dt>
                  <dd className="text-sm flex items-center gap-1.5 text-[rgb(var(--app-text))]">
                    <span className="text-[rgb(var(--app-accent))]">
                      {getSpecimenTypeIcon(specimen.specimenType.name)}
                    </span>
                    <span>{specimen.specimenType.name}</span>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Source Type</dt>
                <dd className="text-sm capitalize text-[rgb(var(--app-text))]">
                  {specimen.studySubjectId ? 'subject' : specimen.controlBatchId ? 'control' : 'unknown'}
                </dd>
              </div>
              {specimen.collectionDate && (
                <div>
                  <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Collection Date</dt>
                  <dd className="text-sm text-[rgb(var(--app-text))]">
                    {new Date(specimen.collectionDate).toLocaleDateString()}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Created</dt>
                <dd className="text-sm text-[rgb(var(--app-text))]">
                  {new Date(specimen.created).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </div>

          {showSourceCard && (
            <div className="dashboard-card p-4">
              <h2 className="dashboard-section-title text-base mb-3">Source</h2>
              {sourceStatus === 'loading' && (
                <SectionMessage message="Loading source…" variant="loading" />
              )}
              {sourceStatus === 'error' && (
                <SectionMessage message="Failed to load source" variant="error" />
              )}
              {sourceStatus === 'ready' && sourceInfo && (
                <dl className="space-y-1.5">
                  <div>
                    <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Type</dt>
                    <dd className="text-sm capitalize text-[rgb(var(--app-text))]">{sourceInfo.type}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Name</dt>
                    <dd className="text-sm text-[rgb(var(--app-text))]">
                      {sourceInfo.type === 'subject' ? (
                        <Link to={`/subjects/${sourceInfo.id}`} className="dashboard-link hover:underline">
                          {sourceInfo.name}
                        </Link>
                      ) : sourceInfo.type === 'control' ? (
                        <Link
                          to={`/blood-controls/batches/${sourceInfo.id}`}
                          className="dashboard-link hover:underline"
                        >
                          {sourceInfo.name}
                        </Link>
                      ) : (
                        sourceInfo.name
                      )}
                    </dd>
                  </div>
                  {sourceInfo.type === 'subject' && sourceInfo.study && (
                    <div>
                      <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Study</dt>
                      <dd className="text-sm text-[rgb(var(--app-text))]">
                        <Link to={`/studies/${sourceInfo.study.id}`} className="dashboard-link hover:underline">
                          {sourceInfo.study.title} ({sourceInfo.study.code})
                        </Link>
                      </dd>
                    </div>
                  )}
                  {sourceInfo.type === 'control' && sourceInfo.definition && (
                    <div>
                      <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">
                        Control Definition
                      </dt>
                      <dd className="text-sm text-[rgb(var(--app-text))]">
                        <Link
                          to={`/blood-controls/${sourceInfo.definition.id}`}
                          className="dashboard-link hover:underline"
                        >
                          {sourceInfo.definition.name}
                        </Link>
                      </dd>
                    </div>
                  )}
                </dl>
              )}
            </div>
          )}
        </div>

        <div className="dashboard-card subject-specimen-reveal subject-specimen-reveal-3">
          <div className="p-4 border-b border-[rgb(var(--app-border))] flex items-center justify-between gap-3">
            <h2 className="dashboard-section-title">Containers</h2>
            {canWrite && (
              <Button
                variant="secondary"
                className="text-sm px-3 py-2"
                onClick={() => setAddContainerModalOpen(true)}
              >
                Add container
              </Button>
            )}
          </div>
          <div className="p-4">
            {containersStatus === 'loading' && (
              <SectionMessage message="Loading containers…" variant="loading" />
            )}
            {containersStatus === 'error' && (
              <SectionMessage message="Failed to load containers" variant="error" />
            )}
            {containersStatus === 'ready' && containers.length === 0 && (
              <div className="text-center py-8 text-sm text-[rgb(var(--app-text-muted))]">
                No containers found for this specimen
              </div>
            )}
            {containersStatus === 'ready' && containers.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {containers.map((container) => (
                  <Link
                    key={container.id}
                    to={`/containers/${container.id}`}
                    className="studies-card block p-4 transition-colors no-underline"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        {container.containerType && (
                          <span className="text-[rgb(var(--app-accent))] flex-shrink-0">
                            {getContainerTypeIcon(container.containerType)}
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-[rgb(var(--app-text))] truncate">
                            {container.containerType
                              ? getContainerTypeName(container.containerType)
                              : 'Container'}
                          </p>
                        </div>
                      </div>
                      <svg
                        className="h-4 w-4 text-[rgb(var(--app-text-muted))] flex-shrink-0"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 mb-2">
                      <span
                        className={`px-1.5 py-0.5 text-xs font-medium rounded ${container.remainingQuantity > 0 ? 'bg-app-trend-up/10 text-app-trend-up' : 'bg-app-trend-down/10 text-app-trend-down'}`}
                      >
                        {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
                      </span>
                    </div>

                    {container.locationPath && (
                      <div className="flex items-center text-xs text-[rgb(var(--app-text-muted))] mb-1.5">
                        <svg
                          className="w-3.5 h-3.5 mr-1 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="font-mono truncate">{container.locationPath}</span>
                      </div>
                    )}
                    {container.location && !container.locationPath && (
                      <div className="flex items-center text-xs text-[rgb(var(--app-text-muted))] mb-1.5">
                        <svg
                          className="w-3.5 h-3.5 mr-1 flex-shrink-0"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                        </svg>
                        <span className="font-mono truncate">
                          {container.location.path || container.location.name}
                        </span>
                      </div>
                    )}

                    {(container.micronixTube || container.cryovialTube) && (
                      <div className="text-xs text-[rgb(var(--app-text-muted))] mt-1.5">
                        {container.micronixTube && (
                          <span className="truncate block">
                            Plate: {container.micronixTube.plateName || `#${container.micronixTube.plateId}`}
                            {container.micronixTube.position && ` (${container.micronixTube.position})`}
                          </span>
                        )}
                        {container.cryovialTube && (
                          <span className="truncate block">
                            Box: {container.cryovialTube.boxName || `#${container.cryovialTube.boxId}`}
                            {container.cryovialTube.position && ` (${container.cryovialTube.position})`}
                          </span>
                        )}
                      </div>
                    )}
                    {container.comment && (
                      <div className="mt-2 pt-2 border-t border-[rgb(var(--app-border))]">
                        <span className="text-xs font-medium text-[rgb(var(--app-text-muted))] block mb-0.5">
                          Notes
                        </span>
                        <p className="text-xs text-[rgb(var(--app-text))] whitespace-pre-wrap break-words mt-0">
                          {container.comment}
                        </p>
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        <AddContainerForSpecimenModal
          isOpen={addContainerModalOpen}
          onClose={() => setAddContainerModalOpen(false)}
          specimenId={specimen.id}
          specimenTypeId={specimen.specimenTypeId}
          onSuccess={() => {
            void queryClient.invalidateQueries({ queryKey: specimenKeys.containers(id!) })
          }}
        />
      </div>
    </div>
  )
}
