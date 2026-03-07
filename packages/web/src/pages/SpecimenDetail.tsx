import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Specimen } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import AddContainerForSpecimenModal from '../components/AddContainerForSpecimenModal'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useModifierHotkey, useHotkey } from '../hooks/useHotkey'
import { useUser } from '../contexts/UserContext'
import { useSpecimen, useContainersForSpecimen, specimenKeys } from '../hooks/useSpecimens'
import '../styles/subject-specimen.css'

interface Container {
  id: number
  specimenId: number
  totalQuantity: number
  remainingQuantity: number
  comment?: string
  containerType?: string
  unit?: { id: number; symbol: string; name: string }
  location?: any
  locationPath?: string
  micronixTube?: any
  cryovialTube?: any
}

interface SourceInfo {
  type: string
  id: number
  name: string
  study?: {
    id: number
    title: string
    code: string
  }
  definition?: {
    id: number
    name: string
  }
}

export default function SpecimenDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useUser()
  const specimenId = id != null ? parseInt(id, 10) : NaN
  const specimenQuery = useSpecimen(specimenId)
  const containersQuery = useContainersForSpecimen(id)
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [addContainerModalOpen, setAddContainerModalOpen] = useState(false)

  const specimen = specimenQuery.data ?? null
  const containers = (containersQuery.data ?? []) as Container[]
  const loading = specimenQuery.isLoading || containersQuery.isLoading

  // Load source information when specimen is available (subject or control batch)
  useEffect(() => {
    if (!specimen) {
      setSourceInfo(null)
      return
    }
    if (specimen.studySubjectId) {
      let cancelled = false
      api.get(`/subjects/${specimen.studySubjectId}`).then((subjectResponse) => {
        if (cancelled) return
        const subject = subjectResponse.data?.subject
        if (!subject) return
        api.get(`/studies/${subject.studyId}`).then((studyResponse) => {
          if (cancelled) return
          const study = studyResponse.data?.study
          if (study) {
            setSourceInfo({
              type: 'subject',
              id: specimen.studySubjectId!,
              name: subject.name,
              study: {
                id: study.id,
                title: study.title,
                code: study.shortCode,
              },
            })
          }
        }).catch((e) => {
          if (!cancelled) console.error('Failed to load study source info:', e)
        })
      }).catch((e) => {
        if (!cancelled) console.error('Failed to load subject source info:', e)
      })
      return () => { cancelled = true }
    }
    if (specimen.controlBatchId) {
      let cancelled = false
      api.get(`/blood-controls/batches/${specimen.controlBatchId}`).then((batchResponse) => {
        if (cancelled) return
        const batch = batchResponse.data?.batch
        if (!batch) return
        api.get(`/blood-controls/${batch.controlDefinitionId}`).then((defResponse) => {
          if (cancelled) return
          const control = defResponse.data?.control
          setSourceInfo({
            type: 'control',
            id: specimen.controlBatchId!,
            name: batch.name,
            definition: control ? { id: control.id, name: control.name } : undefined,
          })
        }).catch((e) => {
          if (!cancelled) console.error('Failed to load control definition:', e)
        })
      }).catch((e) => {
        if (!cancelled) console.error('Failed to load control source info:', e)
      })
      return () => { cancelled = true }
    }
    setSourceInfo(null)
  }, [specimen])

  // Close Add container modal on Escape
  useHotkey('escape', () => {
    if (addContainerModalOpen) {
      setAddContainerModalOpen(false)
    }
  }, { enabled: addContainerModalOpen, enableOnFormTags: true })

  // Hotkeys
  // Backspace or Cmd/Ctrl+[ to go back
  useHotkey('backspace', () => {
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return // Don't interfere if user is typing
    }
    navigate('/specimens')
  }, { preventDefault: true })

  useModifierHotkey('[', () => {
    const activeElement = document.activeElement
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA')) {
      return // Don't interfere if user is typing
    }
    navigate('/specimens')
  }, { preventDefault: true })

  if (loading) {
    return <SkeletonDetailPage sections={1} />
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

  // Build breadcrumb based on available information
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

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="mb-6 subject-specimen-reveal subject-specimen-reveal-1">
          <EntityBreadcrumbs items={breadcrumbItems} />
          <div className="flex items-center gap-3 mt-2">
            {specimen.specimenType && (
              <span className="text-[rgb(var(--app-accent))]">{getSpecimenTypeIcon(specimen.specimenType.name)}</span>
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
                    <span className="text-[rgb(var(--app-accent))]">{getSpecimenTypeIcon(specimen.specimenType.name)}</span>
                    <span>{specimen.specimenType.name}</span>
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Source Type</dt>
                <dd className="text-sm capitalize text-[rgb(var(--app-text))]">{specimen.studySubjectId ? 'subject' : specimen.controlBatchId ? 'control' : 'unknown'}</dd>
              </div>
              {specimen.collectionDate && (
                <div>
                  <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Collection Date</dt>
                  <dd className="text-sm text-[rgb(var(--app-text))]">{new Date(specimen.collectionDate).toLocaleDateString()}</dd>
                </div>
              )}
              <div>
                <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Created</dt>
                <dd className="text-sm text-[rgb(var(--app-text))]">{new Date(specimen.created).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>

          {sourceInfo && (
            <div className="dashboard-card p-4">
              <h2 className="dashboard-section-title text-base mb-3">Source</h2>
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
                      <Link to={`/blood-controls/batches/${sourceInfo.id}`} className="dashboard-link hover:underline">
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
                    <dt className="text-xs font-medium text-[rgb(var(--app-text-muted))]">Control Definition</dt>
                    <dd className="text-sm text-[rgb(var(--app-text))]">
                      <Link to={`/blood-controls/${sourceInfo.definition.id}`} className="dashboard-link hover:underline">
                        {sourceInfo.definition.name}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
            </div>
          )}
        </div>

        <div className="dashboard-card subject-specimen-reveal subject-specimen-reveal-3">
          <div className="p-4 border-b border-[rgb(var(--app-border))] flex items-center justify-between gap-3">
            <h2 className="dashboard-section-title">Containers</h2>
            {canWrite && (
              <button
                type="button"
                onClick={() => setAddContainerModalOpen(true)}
                className="subject-specimen-btn-secondary text-sm"
              >
                Add container
              </button>
            )}
          </div>
          <div className="p-4">
            {containers.length === 0 ? (
              <div className="text-center py-8 text-sm text-[rgb(var(--app-text-muted))]">
                No containers found for this specimen
              </div>
            ) : (
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
                          {container.containerType ? getContainerTypeName(container.containerType) : 'Container'}
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
                    {/* Note: container.state is deprecated - states are no longer used */}
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${container.remainingQuantity > 0 ? 'bg-app-trend-up/10 text-app-trend-up' : 'bg-app-trend-down/10 text-app-trend-down'}`}>
                      {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
                    </span>
                  </div>

                  {container.locationPath && (
                    <div className="flex items-center text-xs text-[rgb(var(--app-text-muted))] mb-1.5">
                      <svg className="w-3.5 h-3.5 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-mono truncate">{container.locationPath}</span>
                    </div>
                  )}
                  {container.location && !container.locationPath && (
                    <div className="flex items-center text-xs text-[rgb(var(--app-text-muted))] mb-1.5">
                      <svg className="w-3.5 h-3.5 mr-1 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
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
                      <span className="text-xs font-medium text-[rgb(var(--app-text-muted))] block mb-0.5">Notes</span>
                      <p className="text-xs text-[rgb(var(--app-text))] whitespace-pre-wrap break-words mt-0">{container.comment}</p>
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
            queryClient.invalidateQueries({ queryKey: specimenKeys.containers(id!) })
          }}
        />
      </div>
    </div>
  )
}
