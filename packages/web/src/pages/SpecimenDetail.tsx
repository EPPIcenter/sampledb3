import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import { specimensApi, type Specimen } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { getSpecimenTypeIcon, getContainerTypeIcon, getContainerTypeName } from '../lib/icons'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import { useModifierHotkey, useHotkey } from '../hooks/useHotkey'

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
  const [specimen, setSpecimen] = useState<Specimen | null>(null)
  const [containers, setContainers] = useState<Container[]>([])
  const [sourceInfo, setSourceInfo] = useState<SourceInfo | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadSpecimen()
      loadContainers()
    }
  }, [id])

  const loadSpecimen = async () => {
    try {
      const response = await specimensApi.get(parseInt(id!))
      const specData = response.data.specimen
      setSpecimen(specData)
      
      // Load source information
      if (specData.studySubjectId) {
        try {
          const subjectResponse = await api.get(`/subjects/${specData.studySubjectId}`)
          if (subjectResponse.data.subject) {
            const studyResponse = await api.get(`/studies/${subjectResponse.data.subject.studyId}`)
            setSourceInfo({
              type: 'subject',
              id: specData.studySubjectId,
              name: subjectResponse.data.subject.name,
              study: {
                id: studyResponse.data.study.id,
                title: studyResponse.data.study.title,
                code: studyResponse.data.study.shortCode,
              },
            })
          }
        } catch (e) {
          console.error('Failed to load subject source info:', e)
        }
      } else if (specData.controlBatchId) {
        try {
          const batchResponse = await api.get(`/blood-controls/batches/${specData.controlBatchId}`)
          if (batchResponse.data.batch) {
            const batch = batchResponse.data.batch
            const defResponse = await api.get(`/blood-controls/${batch.controlDefinitionId}`)
            setSourceInfo({
              type: 'control',
              id: specData.controlBatchId,
              name: batch.name,
              definition: defResponse.data.control ? {
                id: defResponse.data.control.id,
                name: defResponse.data.control.name,
              } : undefined
            })
          }
        } catch (e) {
          console.error('Failed to load control source info:', e)
        }
      }
    } catch (error) {
      console.error('Failed to load specimen:', error)
    }
  }

  const loadContainers = async () => {
    try {
      // Find containers for this specimen
      const response = await api.get('/containers', {
        params: { specimen_id: id },
      })
      setContainers(response.data.containers || [])
    } catch (error) {
      console.error('Failed to load containers:', error)
    } finally {
      setLoading(false)
    }
  }

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
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Specimen not found</div>
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
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs items={breadcrumbItems} />
        <div className="flex items-center gap-3 mt-2">
          {specimen.specimenType && (
            <span className="text-gray-600">{getSpecimenTypeIcon(specimen.specimenType.name)}</span>
          )}
          <h1 className="text-3xl font-bold text-gray-900">
            {specimen.specimenType ? `${specimen.specimenType.name} Specimen` : 'Specimen'}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-base font-semibold mb-3 text-gray-900">Details</h2>
          <dl className="space-y-1.5">
            {specimen.specimenType && (
              <div>
                <dt className="text-xs font-medium text-gray-500">Type</dt>
                <dd className="text-sm text-gray-900 flex items-center gap-1.5">
                  <span>{getSpecimenTypeIcon(specimen.specimenType.name)}</span>
                  <span>{specimen.specimenType.name}</span>
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-gray-500">Source Type</dt>
              <dd className="text-sm capitalize text-gray-900">{specimen.studySubjectId ? 'subject' : specimen.controlBatchId ? 'control' : 'unknown'}</dd>
            </div>
            {specimen.collectionDate && (
              <div>
                <dt className="text-xs font-medium text-gray-500">Collection Date</dt>
                <dd className="text-sm text-gray-900">{new Date(specimen.collectionDate).toLocaleDateString()}</dd>
              </div>
            )}
            <div>
              <dt className="text-xs font-medium text-gray-500">Created</dt>
              <dd className="text-sm text-gray-900">{new Date(specimen.created).toLocaleDateString()}</dd>
            </div>
          </dl>
        </div>

        {sourceInfo && (
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-base font-semibold mb-3 text-gray-900">Source</h2>
            <dl className="space-y-1.5">
              <div>
                <dt className="text-xs font-medium text-gray-500">Type</dt>
                <dd className="text-sm capitalize text-gray-900">{sourceInfo.type}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-gray-500">Name</dt>
                <dd className="text-sm text-gray-900">
                  {sourceInfo.type === 'subject' ? (
                    <Link to={`/subjects/${sourceInfo.id}`} className="text-blue-600 hover:underline">
                      {sourceInfo.name}
                    </Link>
                  ) : sourceInfo.type === 'control' ? (
                    <Link to={`/blood-controls/batches/${sourceInfo.id}`} className="text-blue-600 hover:underline">
                      {sourceInfo.name}
                    </Link>
                  ) : (
                    sourceInfo.name
                  )}
                </dd>
              </div>
              {sourceInfo.type === 'subject' && sourceInfo.study && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Study</dt>
                  <dd className="text-sm text-gray-900">
                    <Link to={`/studies/${sourceInfo.study.id}`} className="text-blue-600 hover:underline">
                      {sourceInfo.study.title} ({sourceInfo.study.code})
                    </Link>
                  </dd>
                </div>
              )}
              {sourceInfo.type === 'control' && sourceInfo.definition && (
                <div>
                  <dt className="text-xs font-medium text-gray-500">Control Definition</dt>
                  <dd className="text-sm text-gray-900">
                    <Link to={`/blood-controls/${sourceInfo.definition.id}`} className="text-blue-600 hover:underline">
                      {sourceInfo.definition.name}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Containers</h2>
        </div>
        <div className="p-4">
          {containers.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              No containers found for this specimen
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {containers.map((container) => (
                <Link
                  key={container.id}
                  to={`/containers/${container.id}`}
                  className="block p-4 border border-gray-100 rounded-lg hover:bg-gray-50 hover:border-gray-200 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {container.containerType && (
                        <span className="text-gray-600 flex-shrink-0">
                          {getContainerTypeIcon(container.containerType)}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {container.containerType ? getContainerTypeName(container.containerType) : 'Container'}
                        </p>
                      </div>
                    </div>
                    <svg
                      className="h-4 w-4 text-gray-400 flex-shrink-0"
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
                    <span className={`px-1.5 py-0.5 text-xs font-medium rounded ${container.remainingQuantity > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
                    </span>
                  </div>

                  {container.locationPath && (
                    <div className="flex items-center text-xs text-gray-600 mb-1.5">
                      <svg className="w-3.5 h-3.5 mr-1 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-mono truncate">{container.locationPath}</span>
                    </div>
                  )}
                  {container.location && !container.locationPath && (
                    <div className="flex items-center text-xs text-gray-600 mb-1.5">
                      <svg className="w-3.5 h-3.5 mr-1 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span className="font-mono truncate">
                        {container.location.path || container.location.name}
                      </span>
                    </div>
                  )}
                  
                  {(container.micronixTube || container.cryovialTube) && (
                    <div className="text-xs text-gray-500 mt-1.5">
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
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
