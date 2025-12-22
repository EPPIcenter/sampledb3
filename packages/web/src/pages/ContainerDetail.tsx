import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import api from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import { getContainerTypeIcon, getContainerTypeName, getSpecimenTypeIcon } from '../lib/icons'

interface ContainerDetail {
  id?: number
  container?: any
  specimen?: any
  source?: any
  location?: any
  locationPath?: string
  containerType?: string
  manifest?: {
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
  const [data, setData] = useState<ContainerDetail | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (id) {
      loadContainer()
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

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8">Loading...</div>
      </div>
    )
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
  const { specimen, source, location, locationPath, containerType, manifest } = data
  
  // If we're using flattened format, some properties might be on data directly
  const effectiveLocation = location || container.location
  const effectiveLocationPath = locationPath || container.locationPath
  const effectiveContainerType = containerType || container.containerType
  const effectiveManifest = manifest || container.manifest

  const containerTypeName = getContainerTypeName(effectiveContainerType)
  const containerTypeIcon = getContainerTypeIcon(effectiveContainerType)

  // Get identifier for header (position, barcode, or type)
  const containerIdentifier = 
    effectiveManifest?.position || 
    effectiveManifest?.barcode || 
    effectiveManifest?.label ||
    containerTypeName

  // Build breadcrumbs - use identifier instead of ID
  const breadcrumbItems = []
  if (source?.type === 'control') {
    breadcrumbItems.push({ label: 'Controls', to: '/controls' })
    if (source.definition) {
      breadcrumbItems.push({ label: source.definition.name, to: `/controls/${source.definition.id}` })
    }
    breadcrumbItems.push({ label: source.name, to: `/controls/batches/${source.id}` })
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
    (effectiveLocation ? `${effectiveLocation.locationRoot} → ${effectiveLocation.levelI} → ${effectiveLocation.levelII}${effectiveLocation.levelIII ? ` → ${effectiveLocation.levelIII}` : ''}` : null)

  const getManifestUrl = (type: string, id: number) => {
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

      {/* Single Compact Information Card */}
      <div className="bg-white rounded-lg border border-gray-100 p-4">
        {/* Header Section */}
        <div className="flex items-center flex-wrap gap-3 pb-4 border-b border-gray-100 mb-4">
          {/* Container Type Icon + Name */}
          <div className="flex items-center gap-2">
            <div className="text-gray-600">{containerTypeIcon}</div>
            <span className="font-semibold text-gray-900">{containerTypeName}</span>
          </div>

          {/* Position/Barcode */}
          {(effectiveManifest?.position || effectiveManifest?.barcode || effectiveManifest?.label) && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-500">•</span>
              <span className="font-mono text-gray-700">
                {effectiveManifest?.position || effectiveManifest?.barcode || effectiveManifest?.label}
              </span>
            </div>
          )}

          {/* State Badge */}
          {container.state?.name && (
            <div className="flex items-center gap-2">
              <span className="text-gray-500">•</span>
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white ${statusColor(container.state.name)}`}
                title={`State: ${container.state.name}`}
              >
                {container.state.name}
              </span>
            </div>
          )}

          {/* Status Badge */}
          <div className="flex items-center gap-2">
            <span className="text-gray-500">•</span>
            <span
              className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium text-white ${container.remainingQuantity > 0 ? 'bg-green-500' : 'bg-red-500'}`}
              title={`Status: ${container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}`}
            >
              {container.remainingQuantity > 0 ? 'In Use' : 'Exhausted'}
            </span>
          </div>

          {/* Location - Compact and Clickable */}
          {effectiveLocation && displayLocationPath && (
            <div className="flex items-center gap-2 ml-auto">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <Link
                to={`/locations/${effectiveLocation.id}`}
                className="text-sm font-mono text-blue-600 hover:text-blue-800 hover:underline"
              >
                {displayLocationPath}
              </Link>
            </div>
          )}
        </div>

        <div className="space-y-4">
          {/* Container Type-Specific Information */}
          {effectiveManifest && (
            <div className="flex flex-wrap items-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 capitalize">{getContainerTypeName(effectiveManifest.type)}:</span>
                <span className="font-mono text-gray-900">{effectiveManifest.name}</span>
              </div>
              <Link
                to={getManifestUrl(effectiveManifest.type, effectiveManifest.id)}
                className="text-blue-600 hover:text-blue-800 hover:underline text-xs"
              >
                View {getContainerTypeName(effectiveManifest.type).toLowerCase()} details →
              </Link>
            </div>
          )}

          {/* Specimen Context - Compact Inline */}
          {specimen && (
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <div className="text-blue-600">{getSpecimenTypeIcon(specimen.specimenTypeName || 'specimen')}</div>
                <Link
                  to={`/specimens/${specimen.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800 hover:underline font-medium"
                >
                  {specimen.specimenTypeName || 'Specimen'}
                </Link>
              </div>
              {specimen.collectionDate && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="text-gray-400">•</span>
                  <span>Collected: {new Date(specimen.collectionDate).toLocaleDateString()}</span>
                </div>
              )}
            </div>
          )}

          {/* Source Context - Compact Inline */}
          {source && (
            <div className="flex items-center gap-3 flex-wrap text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 capitalize">{source.type}:</span>
                {source.type === 'subject' ? (
                  <Link
                    to={`/subjects/${source.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    {source.name}
                  </Link>
                ) : source.type === 'control' ? (
                  <Link
                    to={`/controls/batches/${source.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline font-medium"
                  >
                    {source.name}
                  </Link>
                ) : (
                  <span className="text-gray-900">{source.name}</span>
                )}
              </div>
              {source.type === 'subject' && source.study && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-500">Study:</span>
                  <Link
                    to={`/studies/${source.study.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {source.study.title}
                  </Link>
                  {source.study.code && (
                    <span className="text-gray-500">({source.study.code})</span>
                  )}
                </div>
              )}
              {source.type === 'control' && source.definition && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-400">•</span>
                  <span className="text-gray-500">Control Definition:</span>
                  <Link
                    to={`/controls/${source.definition.id}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    {source.definition.name}
                  </Link>
                </div>
              )}
            </div>
          )}

          {/* Comment */}
          {container.comment && (
            <div className="pt-3 border-t border-gray-100">
              <div className="text-xs text-gray-500 mb-1">Comment</div>
              <div className="text-sm text-gray-900">{container.comment}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
