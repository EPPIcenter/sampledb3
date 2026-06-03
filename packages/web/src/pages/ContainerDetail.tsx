import { useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import type { Derivation } from '../lib/api/derivations'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { getContainerTypeIcon, getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'
import type { ContainerDetail as ContainerDetailData } from '../lib/api/containers'
import {
  containerKeys,
  useContainer,
  useContainerDerivationTree,
  useContainerSource,
} from '../hooks/useContainers'
import { DetailPageSkeleton, PageError, SectionMessage, fromQuery, getQueryErrorMessage } from '../ui'
import ContainerDerivationModal from '../components/ContainerDerivationModal'
import ContainerEditModal from '../components/ContainerEditModal'
import DerivationChainView from '../components/DerivationChainView'
import { useUser } from '../contexts/UserContext'
import { formatDerivationType } from '../lib/derivation-types'
import '../styles/storage.css'

function statusColor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('active') || key.includes('in use') || key.includes('in-use')) return 'bg-app-trend-up/100'
  if (key.includes('used')) return 'bg-app-accent-muted0'
  if (key.includes('archived')) return 'bg-yellow-500'
  if (key.includes('discard') || key.includes('destroy')) return 'bg-app-trend-down/100'
  return 'bg-gray-400'
}

export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { canWrite } = useUser()
  const containerId = id != null ? parseInt(id, 10) : NaN
  const containerQuery = useContainer(containerId)
  const derivationsQuery = useContainerDerivationTree(containerId)
  const sourceQuery = useContainerSource(containerId)
  const data: ContainerDetailData | null = containerQuery.data ?? null
  const detailStatus = fromQuery(containerQuery)
  const derivations = derivationsQuery.data?.derivations ?? []
  const childContainers =
    derivationsQuery.data?.childContainers ?? new Map<number, ContainerDetailData>()
  const loadingDerivations = derivationsQuery.isPending
  const sourceDerivation = sourceQuery.data
    ? {
        type: 'derivation' as const,
        derivation: sourceQuery.data.derivation,
        parentContainer: sourceQuery.data.parentContainer,
        parentSpecimen: sourceQuery.data.parentSpecimen,
      }
    : null
  const [showDerivationModal, setShowDerivationModal] = useState(false)
  const [derivationModalKey, setDerivationModalKey] = useState(0)
  const [showEditModal, setShowEditModal] = useState(false)

  const refreshContainer = () => {
    void queryClient.invalidateQueries({ queryKey: containerKeys.detail(containerId) })
    void queryClient.invalidateQueries({ queryKey: containerKeys.derivations(containerId) })
    void queryClient.invalidateQueries({ queryKey: containerKeys.source(containerId) })
  }

  const handleDerivationCreated = () => {
    refreshContainer()
  }

  if (detailStatus === 'loading') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <DetailPageSkeleton sections={1} />
        </div>
      </div>
    )
  }

  if (detailStatus === 'error') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <PageError
            title="Could not load container"
            message={getQueryErrorMessage(containerQuery.error, 'Failed to load container')}
            onRetry={() => void containerQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!data?.container?.id) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Container not found</div>
        </div>
      </div>
    )
  }

  const { container, specimen, source } = data
  const effectiveLocation = container.location
  const effectiveLocationPath = container.locationPath
  const effectiveContainerType = container.containerType
  const effectiveCollection = container.collection

  const containerTypeName = getContainerTypeName(effectiveContainerType)
  const containerTypeIcon = getContainerTypeIcon(effectiveContainerType)

  // Primary lab identifier for header: barcode (tubes), sublabel (paper), else position, else type
  const tubeBarcode =
    effectiveContainerType === 'micronix_tube' || effectiveContainerType === 'cryovial_tube'
      ? container.barcode ?? effectiveCollection?.barcode
      : undefined
  const paperSublabel = effectiveContainerType === 'paper' ? container.sublabel : undefined
  const hasBarcode = Boolean(tubeBarcode || paperSublabel)
  const containerIdentifier = hasBarcode
    ? (tubeBarcode ?? paperSublabel ?? containerTypeName)
    : effectiveCollection?.position || effectiveCollection?.name || containerTypeName
  const showIdentifierLine =
    Boolean(
      effectiveCollection?.position ||
        tubeBarcode ||
        paperSublabel ||
        effectiveCollection?.name,
    )

  // Build breadcrumbs - use identifier instead of ID
  const breadcrumbItems: Array<{ label: string; to?: string }> = []
  if (source?.type === 'control') {
    breadcrumbItems.push({ label: 'Blood Controls', to: '/blood-controls' })
    if (source.definition) {
      breadcrumbItems.push({ label: source.definition.name, to: `/blood-controls/${source.definition.id}` })
    }
    breadcrumbItems.push({ label: source.name, to: `/blood-controls/batches/${source.id}` })
  } else if (source?.type === 'subject') {
    breadcrumbItems.push({ label: 'Studies', to: '/studies' })
    if (source.study) {
      breadcrumbItems.push({ label: source.study.title, to: `/studies/${source.study.id}` })
    }
    breadcrumbItems.push({ label: source.name, to: `/subjects/${source.id}` })
  }

  if (specimen) {
    const specimenLabel = specimen.specimenType 
      ? `${specimen.specimenType.name} Specimen`
      : 'Specimen'
    breadcrumbItems.push({ label: specimenLabel, to: `/specimens/${specimen.id}` })
  }
  breadcrumbItems.push({ label: containerIdentifier })

  // Build location path
  const displayLocationPath = effectiveLocationPath || 
    (effectiveLocation ? (effectiveLocation.path || effectiveLocation.name) : null)

  const getCollectionUrl = (type: string, id: number) => {
    switch (type) {
      case 'micronix_plate':
        return `/collections/micronix-plates/${id}`
      case 'cryovial_box':
        return `/collections/cryovial-boxes/${id}`
      case 'box':
        return `/collections/boxes/${id}`
      case 'sheet':
        return `/collections/sheets/${id}`
      case 'bag':
        return `/collections/bags/${id}`
      default:
        return '#'
    }
  }

  const buildCollectionUrlWithHighlight = (type: string, id: number, position?: string | null, containerId?: number) => {
    const url = getCollectionUrl(type, id)
    if (url === '#') return url
    
    const params = new URLSearchParams()
    if (position) {
      params.set('position', position)
    }
    // For paper containers without position, use container ID as fallback
    if (type === 'sheet' && !position && containerId !== undefined) {
      params.set('containerId', String(containerId))
    }
    
    const queryString = params.toString()
    return queryString ? `${url}?${queryString}` : url
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-4 storage-reveal storage-reveal-1">
        <EntityBreadcrumbs items={breadcrumbItems} />
      </div>

      {/* Main Container Information Card */}
      <div className="storage-card storage-reveal storage-reveal-2">
        {/* Header with Title and Badges */}
        <div className="storage-card-divider px-6 py-4 border-b">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl" style={{ color: 'rgb(var(--app-text-muted))' }}>{containerTypeIcon}</div>
              <div>
                <h1 className="text-2xl font-bold">{containerTypeName}</h1>
                {(showIdentifierLine || hasBarcode) && (
                  <div className="mt-1">
                    <span
                      className={
                        effectiveContainerType === 'micronix_tube' && tubeBarcode
                          ? 'storage-barcode text-lg'
                          : 'text-sm font-mono'
                      }
                      style={effectiveContainerType === 'micronix_tube' && tubeBarcode ? undefined : { color: 'rgb(var(--app-text-muted))' }}
                    >
                      {containerIdentifier}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="storage-btn-primary px-4 py-2 text-sm font-medium"
                >
                  Edit
                </button>
              )}
              {container.tags?.map((tag) => (
                <span
                  key={tag.id}
                  className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white ${statusColor(tag.name)}`}
                >
                  {tag.name}
                </span>
              ))}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white ${(container.remainingQuantity ?? 0) > 0 ? 'bg-app-trend-up/100' : 'bg-app-trend-down/100'}`}
              >
                {(container.remainingQuantity ?? 0) > 0 ? 'In Use' : 'Exhausted'}
              </span>
            </div>
          </div>
        </div>

        {/* Dense lab-oriented grid: Identifier | Location | Quantity on row 1; Specimen | Source row 2; Tags/Notes/Audit */}
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
            {/* 1. Identifier */}
            <div className="min-w-0">
              <h3 className="storage-subsection-title mb-2 text-sm font-semibold">Identifier</h3>
              <dl className="space-y-1.5 text-sm">
                {tubeBarcode && (
                  <div>
                    <dt className="storage-detail-dt text-xs">Barcode</dt>
                    <dd className="storage-detail-dd mt-0.5">
                      <span className="storage-barcode font-mono text-base">{tubeBarcode}</span>
                    </dd>
                  </div>
                )}
                {paperSublabel && (
                  <div>
                    <dt className="storage-detail-dt text-xs">Sublabel</dt>
                    <dd className="storage-detail-dd mt-0.5">
                      <span className="storage-barcode font-mono text-base">{paperSublabel}</span>
                    </dd>
                  </div>
                )}
                {effectiveCollection?.position && (
                  <div>
                    <dt className="storage-detail-dt text-xs">{effectiveContainerType === 'static_well' ? 'Well' : 'Position'}</dt>
                    <dd className="storage-detail-dd font-mono mt-0.5">{effectiveCollection.position}</dd>
                  </div>
                )}
                {effectiveCollection && (
                  <div>
                    <dt className="storage-detail-dt text-xs">In collection</dt>
                    <dd className="storage-detail-dd mt-0.5">
                      <Link
                        to={buildCollectionUrlWithHighlight(
                          effectiveCollection.type,
                          effectiveCollection.id,
                          effectiveCollection.position,
                          container.id
                        )}
                        className="dashboard-link hover:underline font-medium break-all"
                      >
                        {effectiveCollection.name}
                      </Link>
                      <span className="text-xs ml-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
                        (View in {effectiveCollection.type === 'micronix_plate' ? 'plate' : effectiveCollection.type === 'cryovial_box' ? 'box' : 'sheet'})
                      </span>
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* 2. Storage location */}
            {effectiveLocation && displayLocationPath && (
              <div className="min-w-0">
                <h3 className="storage-subsection-title mb-2 text-sm font-semibold">Storage location</h3>
                <p className="storage-detail-dd text-sm mt-0.5">
                  <Link
                    to={`/locations/${effectiveLocation.id}`}
                    className="dashboard-link hover:underline font-medium break-all"
                  >
                    {displayLocationPath}
                  </Link>
                </p>
              </div>
            )}

            {/* 3. Quantity */}
            <div className="min-w-0">
              <h3 className="storage-subsection-title mb-2 text-sm font-semibold">Quantity</h3>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-1 text-sm">
                <div>
                  <dt className="storage-detail-dt text-xs">Remaining</dt>
                  <dd className="storage-detail-dd font-semibold mt-0.5">
                    {container.remainingQuantity?.toLocaleString() ?? '0'} {container.unit?.symbol || ''}
                  </dd>
                </div>
                {container.totalQuantity != null && (
                  <div>
                    <dt className="storage-detail-dt text-xs">Total</dt>
                    <dd className="storage-detail-dd mt-0.5">
                      {container.totalQuantity.toLocaleString()} {container.unit?.symbol || ''}
                    </dd>
                  </div>
                )}
                {container.totalQuantity != null && container.remainingQuantity != null && (
                  <div>
                    <dt className="storage-detail-dt text-xs">Used</dt>
                    <dd className="storage-detail-dd mt-0.5">
                      {(container.totalQuantity - container.remainingQuantity).toLocaleString()} {container.unit?.symbol || ''}
                    </dd>
                  </div>
                )}
              </dl>
              {container.totalQuantity != null && container.totalQuantity > 0 && container.remainingQuantity != null && (
                <div className="mt-1.5 h-1 w-full max-w-[12rem] rounded-full bg-app-surface overflow-hidden" role="presentation" aria-hidden>
                  <div
                    className="h-full rounded-full bg-app-trend-up/100"
                    style={{ width: `${Math.min(100, (container.remainingQuantity / container.totalQuantity) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* 4. Sample: Specimen | Source (same row, dense) */}
          {(specimen || source) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mt-4 pt-4 border-t border-app-border">
              {specimen && (
                <div className="min-w-0">
                  <h3 className="storage-subsection-title mb-2 text-sm font-semibold">Specimen</h3>
                  <dl className="space-y-1.5 text-sm">
                    <div>
                      <dt className="storage-detail-dt text-xs">Type</dt>
                      <dd className="storage-detail-dd mt-0.5">
                        <Link
                          to={`/specimens/${specimen.id}`}
                          className="dashboard-link inline-flex items-center gap-1.5 hover:underline font-medium"
                        >
                          <span>{getSpecimenTypeIcon(specimen.specimenType?.name || 'specimen')}</span>
                          <span>{specimen.specimenType?.name || 'Specimen'}</span>
                        </Link>
                      </dd>
                    </div>
                    {specimen.collectionDate && (
                      <div>
                        <dt className="storage-detail-dt text-xs">Collection date</dt>
                        <dd className="storage-detail-dd mt-0.5">
                          {new Date(specimen.collectionDate).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
              {source && (
                <div className="min-w-0">
                  <h3 className="storage-subsection-title mb-2 text-sm font-semibold">Source</h3>
                  <dl className="space-y-1.5 text-sm">
                    <div>
                      <dt className="storage-detail-dt text-xs capitalize">{source.type}</dt>
                      <dd className="storage-detail-dd mt-0.5">
                        {source.type === 'subject' ? (
                          <Link to={`/subjects/${source.id}`} className="dashboard-link hover:underline font-medium break-all">
                            {source.name}
                          </Link>
                        ) : (
                          <Link to={`/blood-controls/batches/${source.id}`} className="dashboard-link hover:underline font-medium break-all">
                            {source.name}
                          </Link>
                        )}
                      </dd>
                    </div>
                    {source.type === 'subject' && source.study && (
                      <div>
                        <dt className="storage-detail-dt text-xs">Study</dt>
                        <dd className="storage-detail-dd mt-0.5">
                          <Link to={`/studies/${source.study.id}`} className="dashboard-link hover:underline break-all">
                            {source.study.title}
                            {source.study.code && <span style={{ color: 'rgb(var(--app-text-muted))' }}> ({source.study.code})</span>}
                          </Link>
                        </dd>
                      </div>
                    )}
                    {source.type === 'control' && source.definition && (
                      <div>
                        <dt className="storage-detail-dt text-xs">Definition</dt>
                        <dd className="storage-detail-dd mt-0.5">
                          <Link to={`/blood-controls/${source.definition.id}`} className="dashboard-link hover:underline break-all">
                            {source.definition.name}
                          </Link>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          )}

          {/* 5. Tags + 6. Notes (compact) + 7. Audit footer */}
          {((container.tags && Array.isArray(container.tags) && container.tags.length > 0) || container.comment) && (
            <div className="mt-4 pt-4 border-t border-app-border space-y-2">
              {container.tags && Array.isArray(container.tags) && container.tags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {container.tags.map((tag: { id: number; name: string }) => (
                    <span
                      key={tag.id}
                      className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border border-app-border bg-app-surface text-app-text"
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
              {container.comment && (
                <div className="min-w-0">
                  <span className="storage-detail-dt text-xs block mb-0.5">Notes</span>
                  <p className="storage-detail-dd text-sm whitespace-pre-wrap break-words mt-0">{container.comment}</p>
                </div>
              )}
            </div>
          )}
          {(container.created || container.lastUpdated) && (
            <div className="mt-3 pt-3 border-t border-app-border flex justify-end">
              <p className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
                {container.created && (
                  <span>Created {new Date(container.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                )}
                {container.created && container.lastUpdated && ' · '}
                {container.lastUpdated && (
                  <span>Updated {new Date(container.lastUpdated).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                )}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Derivation Sections */}
      <div className="mt-6 space-y-4">
        {/* Source Derivation Information (if this container is a child via derivation) */}
        {sourceDerivation && sourceDerivation.type === 'derivation' && sourceDerivation.derivation && (
          <div className="storage-card storage-reveal storage-reveal-3">
            <div className="storage-card-divider px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold storage-section-title">Source Derivation</h3>
                {sourceDerivation.parentContainer && (
                  <button
                    onClick={() => navigate(`/containers/${sourceDerivation.parentContainer.id}`)}
                    className="dashboard-link text-sm hover:underline font-medium"
                  >
                    View Parent Container →
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-5">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="storage-detail-dt mb-1">Derivation Type</dt>
                  <dd className="storage-detail-dd font-medium">{formatDerivationType(sourceDerivation.derivation.derivationType)}</dd>
                </div>
                {sourceDerivation.derivation.derivationDate && (
                  <div>
                    <dt className="storage-detail-dt mb-1">Derivation Date</dt>
                    <dd className="storage-detail-dd">
                      {new Date(sourceDerivation.derivation.derivationDate).toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                      })}
                    </dd>
                  </div>
                )}
                {sourceDerivation.derivation.protocol && (
                  <div className="md:col-span-2">
                    <dt className="storage-detail-dt mb-1">Protocol</dt>
                    <dd className="storage-detail-dd">{sourceDerivation.derivation.protocol}</dd>
                  </div>
                )}
                {sourceDerivation.derivation.notes && (
                  <div className="md:col-span-2">
                    <dt className="storage-detail-dt mb-1">Notes</dt>
                    <dd className="storage-detail-dd whitespace-pre-wrap">{sourceDerivation.derivation.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Derived Containers (if this container is a parent) */}
        {derivations.length > 0 && (
          <div className="storage-card storage-reveal storage-reveal-4">
            <div className="storage-card-divider px-6 py-4 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold storage-section-title">
                  Derived Containers <span style={{ color: 'rgb(var(--app-text-muted))', fontWeight: 400 }}>({derivations.length})</span>
                </h3>
                <button
                  onClick={() => {
                    setDerivationModalKey((k) => k + 1)
                    setShowDerivationModal(true)
                  }}
                  className="storage-btn-primary px-4 py-2 text-sm font-medium"
                >
                  Create New Derivation
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              {loadingDerivations ? (
                <div className="storage-detail-dt py-4">Loading derivations...</div>
              ) : (
                <div className="space-y-2">
                  {derivations.map((derivation) => {
                    const childDetail = derivation.childContainerId
                      ? childContainers.get(derivation.childContainerId)
                      : null
                    const container = childDetail?.container
                    const effectiveContainerType = container?.containerType
                    const effectiveCollection = container?.collection
                    const effectiveLocation = container?.location
                    const effectiveLocationPath = container?.locationPath
                    const containerTypeName = effectiveContainerType ? getContainerTypeName(effectiveContainerType) : 'Unknown'
                    const containerTypeIcon = effectiveContainerType ? getContainerTypeIcon(effectiveContainerType) : null
                    const displayLocationPath = effectiveLocationPath || 
                      (effectiveLocation ? (effectiveLocation.path || effectiveLocation.name) : null)
                    
                    return (
                      <div
                        key={derivation.id}
                        className="storage-sub-card p-3"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {containerTypeIcon && <span style={{ color: 'rgb(var(--app-text-muted))' }}>{containerTypeIcon}</span>}
                              <span className="font-semibold storage-detail-dd">{containerTypeName}</span>
                              {derivation.derivationType && (
                                <span className="text-xs storage-detail-dt bg-app-card px-2 py-0.5 rounded border storage-card-divider">
                                  {formatDerivationType(derivation.derivationType)}
                                </span>
                              )}
                              {container?.remainingQuantity != null && (
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  (container.remainingQuantity ?? 0) > 0 
                                    ? 'bg-app-trend-up/10 text-app-trend-up' 
                                    : 'bg-app-trend-down/10 text-app-trend-down'
                                }`}>
                                  {(container.remainingQuantity ?? 0) > 0 ? 'In Use' : 'Exhausted'}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {container?.remainingQuantity !== undefined && container?.unit && (
                                <div className="flex items-start gap-2">
                                  <span className="storage-detail-dt whitespace-nowrap">Quantity:</span>
                                  <span className="storage-detail-dd font-medium">
                                    {container.remainingQuantity?.toLocaleString() || '0'} {container.unit?.symbol || 'units'}
                                  </span>
                                </div>
                              )}
                              {effectiveCollection && (
                                <div className="flex items-start gap-2">
                                  <span className="storage-detail-dt whitespace-nowrap">
                                    {getContainerTypeName(effectiveCollection.type)}:
                                  </span>
                                  <span className="storage-detail-dd font-mono">{effectiveCollection.name}</span>
                                  {(effectiveCollection.position || effectiveCollection.barcode || effectiveCollection.name) && (
                                    <span style={{ color: 'rgb(var(--app-text-muted))' }}>
                                      ({effectiveCollection.position || effectiveCollection.barcode || effectiveCollection.name})
                                    </span>
                                  )}
                                </div>
                              )}
                              {displayLocationPath && (
                                <div className="flex items-start gap-2 md:col-span-2">
                                  <span className="storage-detail-dt whitespace-nowrap">Location:</span>
                                  <span className="storage-detail-dd font-mono">{displayLocationPath}</span>
                                </div>
                              )}
                              {derivation.protocol && (
                                <div className="flex items-start gap-2">
                                  <span className="storage-detail-dt whitespace-nowrap">Protocol:</span>
                                  <span className="storage-detail-dd">{derivation.protocol}</span>
                                </div>
                              )}
                              {derivation.derivationDate && (
                                <div className="flex items-start gap-2">
                                  <span className="storage-detail-dt whitespace-nowrap">Derived:</span>
                                  <span className="storage-detail-dd">
                                    {new Date(derivation.derivationDate).toLocaleDateString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      year: 'numeric'
                                    })}
                                  </span>
                                </div>
                              )}
                              {derivation.notes && (
                                <div className="flex items-start gap-2 md:col-span-2">
                                  <span className="storage-detail-dt whitespace-nowrap">Notes:</span>
                                  <span className="storage-detail-dd">{derivation.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {derivation.childContainerId && (
                            <Link
                              to={`/containers/${derivation.childContainerId}`}
                              className="dashboard-link flex-shrink-0 text-sm hover:underline font-medium whitespace-nowrap"
                            >
                              View →
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Create Derivation Button (if no derivations yet) */}
        {!loadingDerivations && derivations.length === 0 && (
          <div className="storage-card storage-reveal storage-reveal-4 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold storage-section-title mb-1">No Derived Containers</h3>
                <p className="storage-detail-dd">
                  This container has not been used to create any derived containers yet. Create a derivation to track materials derived from this container.
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => {
                    setDerivationModalKey((k) => k + 1)
                    setShowDerivationModal(true)
                  }}
                  className="storage-btn-primary px-4 py-2 font-medium whitespace-nowrap ml-4"
                >
                  Create Derivation
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Derivation Modal */}
      {showDerivationModal && id && (
        <ContainerDerivationModal
          isOpen={showDerivationModal}
          onClose={() => setShowDerivationModal(false)}
          parentContainerId={parseInt(id)}
          parentContainer={{
            remainingQuantity: container.remainingQuantity ?? undefined,
            unit: container.unit,
            containerType: effectiveContainerType,
            barcode: tubeBarcode,
            position: effectiveCollection?.position,
            sublabel: paperSublabel,
            specimenTypeName: specimen?.specimenType?.name,
          }}
          onSuccess={handleDerivationCreated}
          openKey={derivationModalKey}
        />
      )}

      {/* Edit Modal */}
      {showEditModal && container && (
        <ContainerEditModal
          isOpen={showEditModal}
          onClose={() => setShowEditModal(false)}
          container={{
            id: container.id!,
            comment: container.comment,
            remainingQuantity: container.remainingQuantity ?? undefined,
            tags: container.tags,
            unit: container.unit,
            containerType: effectiveContainerType,
            barcode: tubeBarcode ?? paperSublabel,
          }}
          onSuccess={() => {
            refreshContainer()
            setShowEditModal(false)
          }}
        />
      )}

      {/* Derivation Chain View - Always show when there's derivation data */}
      {id &&
        ((sourceDerivation && sourceDerivation.type === 'derivation' && sourceDerivation.derivation) ||
          derivations.length > 0) && (
          <div className="mt-6">
            <DerivationChainView containerId={parseInt(id)} />
          </div>
        )}
      </div>
    </div>
  )
}
