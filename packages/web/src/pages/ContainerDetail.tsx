import { useEffect, useState } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import api, { derivationsApi, type Derivation } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { getContainerTypeIcon, getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import ContainerDerivationModal from '../components/ContainerDerivationModal'
import ContainerEditModal from '../components/ContainerEditModal'
import DerivationChainView from '../components/DerivationChainView'
import { useUser } from '../contexts/UserContext'

interface ContainerDetail {
  id?: number
  container?: any
  specimen?: any
  source?: any
  location?: any
  locationPath?: string
  containerType?: string
  collection?: {
    type: string
    id: number
    name: string
    position?: string
    barcode?: string
    label?: string
  }
}

function statusColor(name: string): string {
  const key = name.toLowerCase()
  if (key.includes('active') || key.includes('in use') || key.includes('in-use')) return 'bg-green-500'
  if (key.includes('used')) return 'bg-blue-500'
  if (key.includes('archived')) return 'bg-yellow-500'
  if (key.includes('discard') || key.includes('destroy')) return 'bg-red-500'
  return 'bg-gray-400'
}

export default function ContainerDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [data, setData] = useState<ContainerDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [derivations, setDerivations] = useState<Derivation[]>([])
  const [childContainers, setChildContainers] = useState<Map<number, ContainerDetail>>(new Map())
  const [sourceDerivation, setSourceDerivation] = useState<{
    type: 'derivation' | 'original'
    derivation?: Derivation
    parentContainer?: any
    parentSpecimen?: any
    source?: any
    container?: any
    specimen?: any
  } | null>(null)
  const [loadingDerivations, setLoadingDerivations] = useState(false)
  const [showDerivationModal, setShowDerivationModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)

  useEffect(() => {
    if (id) {
      loadContainer()
      loadDerivations()
      loadSourceDerivation()
    }
  }, [id])

  const loadContainer = async () => {
    try {
      const response = await api.get(`/containers/${id}`)
      setData(response.data)
    } catch (error) {
      console.error('Failed to load container:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadDerivations = async () => {
    if (!id) return
    try {
      setLoadingDerivations(true)
      const response = await derivationsApi.listFromContainer(parseInt(id))
      const derivationsList = response.data.derivations || []
      setDerivations(derivationsList)
      
      // Load child container details for each derivation
      const containerMap = new Map<number, ContainerDetail>()
      await Promise.all(
        derivationsList.map(async (derivation) => {
          if (derivation.childContainerId) {
            try {
              const containerResponse = await api.get(`/containers/${derivation.childContainerId}`)
              containerMap.set(derivation.childContainerId, containerResponse.data)
            } catch (error) {
              console.error(`Failed to load child container ${derivation.childContainerId}:`, error)
            }
          }
        })
      )
      setChildContainers(containerMap)
    } catch (error) {
      console.error('Failed to load derivations:', error)
    } finally {
      setLoadingDerivations(false)
    }
  }

  const loadSourceDerivation = async () => {
    if (!id) return
    try {
      const response = await derivationsApi.getSource(parseInt(id))
      setSourceDerivation({
        type: 'derivation',
        derivation: response.data.derivation,
        parentContainer: response.data.parentContainer,
        parentSpecimen: response.data.parentSpecimen,
      })
    } catch (error: any) {
      // 404 is expected if container has no source
      if (error.response?.status !== 404) {
        console.error('Failed to load source derivation:', error)
      }
      setSourceDerivation(null)
    }
  }

  const handleDerivationCreated = () => {
    loadContainer()
    loadDerivations()
  }

  if (loading) {
    return <SkeletonDetailPage sections={1} />
  }

  if (!data || (!data.container && !data.id)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Container not found</div>
      </div>
    )
  }

  // Handle both flattened and nested formats from API
  const container = data.container || data
  const { specimen, source, location, locationPath, containerType, collection } = data
  
  // If we're using flattened format, some properties might be on data directly
  const effectiveLocation = location || container.location
  const effectiveLocationPath = locationPath || container.locationPath
  const effectiveContainerType = containerType || container.containerType
  const effectiveCollection = collection || container.collection

  const containerTypeName = getContainerTypeName(effectiveContainerType)
  const containerTypeIcon = getContainerTypeIcon(effectiveContainerType)

  // Get identifier for header (position, barcode, or type)
  const containerIdentifier = 
    effectiveCollection?.position || 
    effectiveCollection?.barcode || 
    effectiveCollection?.label ||
    containerTypeName

  // Build breadcrumbs - use identifier instead of ID
  const breadcrumbItems = []
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-4">
        <EntityBreadcrumbs items={breadcrumbItems} />
      </div>

      {/* Main Container Information Card */}
      <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
        {/* Header with Title and Badges */}
        <div className="px-6 py-4 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="text-2xl text-gray-600">{containerTypeIcon}</div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">{containerTypeName}</h1>
                {(effectiveCollection?.position || effectiveCollection?.barcode || effectiveCollection?.label) && (
                  <div className="mt-1">
                    <span className="text-sm font-mono text-gray-600">
                      {effectiveCollection?.position || effectiveCollection?.barcode || effectiveCollection?.label}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {canWrite && (
                <button
                  onClick={() => setShowEditModal(true)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Edit
                </button>
              )}
              {container.state?.name && (
                <span
                  className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white ${statusColor(container.state.name)}`}
                >
                  {container.state.name}
                </span>
              )}
              <span
                className={`inline-flex items-center px-3 py-1 rounded-md text-sm font-medium text-white ${container.remainingQuantity > 0 ? 'bg-green-500' : 'bg-red-500'}`}
              >
                {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
              </span>
            </div>
          </div>
        </div>

        {/* Information Grid */}
        <div className="px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Left Column */}
            <div className="space-y-4">
              {/* Container Details */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Container Details</h3>
                <dl className="space-y-2">
                  {container.id && (
                    <div>
                      <dt className="text-sm text-gray-500">Container ID</dt>
                      <dd className="text-sm font-mono text-gray-900">{container.id}</dd>
                    </div>
                  )}
                  {effectiveCollection && (
                    <div>
                      <dt className="text-sm text-gray-500">
                        {getContainerTypeName(effectiveCollection.type)}
                      </dt>
                      <dd className="text-sm text-gray-900">
                        <Link
                          to={getCollectionUrl(effectiveCollection.type, effectiveCollection.id)}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {effectiveCollection.name}
                        </Link>
                      </dd>
                    </div>
                  )}
                  {effectiveLocation && displayLocationPath && (
                    <div>
                      <dt className="text-sm text-gray-500">Storage Location</dt>
                      <dd className="text-sm text-gray-900">
                        <Link
                          to={`/locations/${effectiveLocation.id}`}
                          className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          {displayLocationPath}
                        </Link>
                      </dd>
                    </div>
                  )}
                </dl>
              </div>

              {/* Quantity Information */}
              <div>
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Quantity</h3>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-sm text-gray-500">Remaining</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {container.remainingQuantity?.toLocaleString() || '0'} {container.unit?.symbol || 'units'}
                    </dd>
                  </div>
                  {container.totalQuantity !== undefined && (
                    <div>
                      <dt className="text-sm text-gray-500">Total</dt>
                      <dd className="text-sm text-gray-700">
                        {container.totalQuantity?.toLocaleString() || '0'} {container.unit?.symbol || 'units'}
                      </dd>
                    </div>
                  )}
                  {container.totalQuantity && container.remainingQuantity !== undefined && (
                    <div>
                      <dt className="text-sm text-gray-500">Used</dt>
                      <dd className="text-sm text-gray-700">
                        {(container.totalQuantity - container.remainingQuantity).toLocaleString()} {container.unit?.symbol || 'units'}
                      </dd>
                    </div>
                  )}
                </dl>
              </div>
            </div>

            {/* Right Column */}
            <div className="space-y-4">
              {/* Specimen Information */}
              {specimen && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Specimen</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-gray-500">Specimen Type</dt>
                      <dd className="text-sm text-gray-900">
                        <Link
                          to={`/specimens/${specimen.id}`}
                          className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:underline font-medium"
                        >
                          <span>{getSpecimenTypeIcon(specimen.specimenType?.name || 'specimen')}</span>
                          <span>{specimen.specimenType?.name || 'Specimen'}</span>
                        </Link>
                      </dd>
                    </div>
                    {specimen.collectionDate && (
                      <div>
                        <dt className="text-sm text-gray-500">Collection Date</dt>
                        <dd className="text-sm text-gray-900">
                          {new Date(specimen.collectionDate).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })}
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}

              {/* Source Information */}
              {source && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Source</h3>
                  <dl className="space-y-2">
                    <div>
                      <dt className="text-sm text-gray-500 capitalize">{source.type}</dt>
                      <dd className="text-sm text-gray-900">
                        {source.type === 'subject' ? (
                          <Link
                            to={`/subjects/${source.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {source.name}
                          </Link>
                        ) : source.type === 'control' ? (
                          <Link
                            to={`/blood-controls/batches/${source.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                          >
                            {source.name}
                          </Link>
                        ) : (
                          <span>{source.name}</span>
                        )}
                      </dd>
                    </div>
                    {source.type === 'subject' && source.study && (
                      <div>
                        <dt className="text-sm text-gray-500">Study</dt>
                        <dd className="text-sm text-gray-900">
                          <Link
                            to={`/studies/${source.study.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {source.study.title}
                            {source.study.code && <span className="text-gray-500"> ({source.study.code})</span>}
                          </Link>
                        </dd>
                      </div>
                    )}
                    {source.type === 'control' && source.definition && (
                      <div>
                        <dt className="text-sm text-gray-500">Control Definition</dt>
                        <dd className="text-sm text-gray-900">
                          <Link
                            to={`/blood-controls/${source.definition.id}`}
                            className="text-blue-600 hover:text-blue-800 hover:underline"
                          >
                            {source.definition.name}
                          </Link>
                        </dd>
                      </div>
                    )}
                  </dl>
                </div>
              )}
            </div>
          </div>

          {/* Comment Section */}
          {container.comment && (
            <div className="mt-6 pt-6 border-t border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-2">Notes</h3>
              <p className="text-sm text-gray-900 whitespace-pre-wrap">{container.comment}</p>
            </div>
          )}
        </div>
      </div>

      {/* Derivation Sections */}
      <div className="mt-6 space-y-4">
        {/* Source Derivation Information (if this container is a child via derivation) */}
        {sourceDerivation && sourceDerivation.type === 'derivation' && sourceDerivation.derivation && (
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">Source Derivation</h3>
                {sourceDerivation.parentContainer && (
                  <button
                    onClick={() => navigate(`/containers/${sourceDerivation.parentContainer.id}`)}
                    className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    View Parent Container →
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-5">
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-gray-500 mb-1">Derivation Type</dt>
                  <dd className="text-sm font-medium text-gray-900">{sourceDerivation.derivation.derivationType}</dd>
                </div>
                {sourceDerivation.derivation.derivationDate && (
                  <div>
                    <dt className="text-sm text-gray-500 mb-1">Derivation Date</dt>
                    <dd className="text-sm text-gray-900">
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
                    <dt className="text-sm text-gray-500 mb-1">Protocol</dt>
                    <dd className="text-sm text-gray-900">{sourceDerivation.derivation.protocol}</dd>
                  </div>
                )}
                {sourceDerivation.derivation.notes && (
                  <div className="md:col-span-2">
                    <dt className="text-sm text-gray-500 mb-1">Notes</dt>
                    <dd className="text-sm text-gray-900 whitespace-pre-wrap">{sourceDerivation.derivation.notes}</dd>
                  </div>
                )}
              </dl>
            </div>
          </div>
        )}

        {/* Derived Containers (if this container is a parent) */}
        {derivations.length > 0 && (
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm">
            <div className="px-6 py-4 border-b border-gray-100">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-gray-900">
                  Derived Containers <span className="text-gray-500 font-normal">({derivations.length})</span>
                </h3>
                <button
                  onClick={() => setShowDerivationModal(true)}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium"
                >
                  Create New Derivation
                </button>
              </div>
            </div>
            <div className="px-6 py-5">
              {loadingDerivations ? (
                <div className="text-sm text-gray-500 py-4">Loading derivations...</div>
              ) : (
                <div className="space-y-2">
                  {derivations.map((derivation) => {
                    const childContainer = derivation.childContainerId ? childContainers.get(derivation.childContainerId) : null
                    const container = childContainer?.container || childContainer
                    const effectiveContainerType = childContainer?.containerType || container?.containerType
                    const effectiveCollection = childContainer?.collection || container?.collection
                    const effectiveLocation = childContainer?.location || container?.location
                    const effectiveLocationPath = childContainer?.locationPath || container?.locationPath
                    const containerTypeName = effectiveContainerType ? getContainerTypeName(effectiveContainerType) : 'Unknown'
                    const containerTypeIcon = effectiveContainerType ? getContainerTypeIcon(effectiveContainerType) : null
                    const displayLocationPath = effectiveLocationPath || 
                      (effectiveLocation ? (effectiveLocation.path || effectiveLocation.name) : null)
                    
                    return (
                      <div
                        key={derivation.id}
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              {containerTypeIcon && <span className="text-gray-600">{containerTypeIcon}</span>}
                              <span className="font-semibold text-gray-900">{containerTypeName}</span>
                              {derivation.derivationType && (
                                <span className="text-xs text-gray-500 bg-white px-2 py-0.5 rounded border border-gray-300">
                                  {derivation.derivationType}
                                </span>
                              )}
                              {container?.remainingQuantity !== undefined && (
                                <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                                  container.remainingQuantity > 0 
                                    ? 'bg-green-100 text-green-700' 
                                    : 'bg-red-100 text-red-700'
                                }`}>
                                  {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-1 text-sm">
                              {container?.remainingQuantity !== undefined && container?.unit && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap">Quantity:</span>
                                  <span className="text-gray-900 font-medium">
                                    {container.remainingQuantity?.toLocaleString() || '0'} {container.unit?.symbol || 'units'}
                                  </span>
                                </div>
                              )}
                              {effectiveCollection && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap">
                                    {getContainerTypeName(effectiveCollection.type)}:
                                  </span>
                                  <span className="text-gray-900 font-mono">{effectiveCollection.name}</span>
                                  {(effectiveCollection.position || effectiveCollection.barcode || effectiveCollection.label) && (
                                    <span className="text-gray-600">
                                      ({effectiveCollection.position || effectiveCollection.barcode || effectiveCollection.label})
                                    </span>
                                  )}
                                </div>
                              )}
                              {displayLocationPath && (
                                <div className="flex items-start gap-2 md:col-span-2">
                                  <span className="text-gray-500 whitespace-nowrap">Location:</span>
                                  <span className="text-gray-900 font-mono">{displayLocationPath}</span>
                                </div>
                              )}
                              {derivation.protocol && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap">Protocol:</span>
                                  <span className="text-gray-900">{derivation.protocol}</span>
                                </div>
                              )}
                              {derivation.derivationDate && (
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-500 whitespace-nowrap">Derived:</span>
                                  <span className="text-gray-900">
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
                                  <span className="text-gray-500 whitespace-nowrap">Notes:</span>
                                  <span className="text-gray-900">{derivation.notes}</span>
                                </div>
                              )}
                            </div>
                          </div>
                          {derivation.childContainerId && (
                            <Link
                              to={`/containers/${derivation.childContainerId}`}
                              className="flex-shrink-0 text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium whitespace-nowrap"
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
          <div className="bg-white rounded-lg border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-1">No Derived Containers</h3>
                <p className="text-sm text-gray-600">
                  This container has not been used to create any derived containers yet. Create a derivation to track materials derived from this container.
                </p>
              </div>
              {canWrite && (
                <button
                  onClick={() => setShowDerivationModal(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium whitespace-nowrap ml-4"
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
            remainingQuantity: container.remainingQuantity,
            unit: container.unit,
            containerType: effectiveContainerType,
          }}
          onSuccess={handleDerivationCreated}
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
            remainingQuantity: container.remainingQuantity,
            tags: container.tags,
            unit: container.unit,
            containerType: effectiveContainerType,
          }}
          onSuccess={() => {
            loadContainer()
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
  )
}
