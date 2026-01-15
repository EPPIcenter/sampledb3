import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { locationsApi, type Location, type LocationHierarchyStats } from '../lib/api'
import { getLocationAncestors, getLocationDescendants } from '../lib/location-tree'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import LocationHierarchyTree from '../components/LocationHierarchyTree'
import LocationHierarchyStatsDisplay from '../components/LocationHierarchyStats'
import LocationCapabilityBadge from '../components/LocationCapabilityBadge'
import Pagination from '../components/Pagination'
import SkeletonDetailPage from '../components/SkeletonDetailPage'
import ContentCard from '../components/ContentCard'

interface LocationContents {
  micronixPlates?: any[]
  cryovialBoxes?: any[]
  boxes?: any[]
  bags?: any[]
}

export default function LocationDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const [location, setLocation] = useState<Location | null>(null)
  const [contents, setContents] = useState<LocationContents | null>(null)
  const [hierarchyStats, setHierarchyStats] = useState<LocationHierarchyStats | null>(null)
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingContext, setLoadingContext] = useState(true)
  const defaultLimit = 25
  
  // Derive page values directly from URL params to avoid circular dependencies
  const platesPage = parseInt(searchParams.get('plates_page') || '1')
  const cryovialBoxesPage = parseInt(searchParams.get('cryovial_boxes_page') || '1')
  const boxesPage = parseInt(searchParams.get('boxes_page') || '1')
  const bagsPage = parseInt(searchParams.get('bags_page') || '1')
  
  const [pagination, setPagination] = useState<{
    micronixPlates?: { page: number; totalPages: number; total: number; limit: number }
    cryovialBoxes?: { page: number; totalPages: number; total: number; limit: number }
    boxes?: { page: number; totalPages: number; total: number; limit: number }
    bags?: { page: number; totalPages: number; total: number; limit: number }
  } | null>(null)

  useEffect(() => {
    if (!id) return

    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    // Derive page values from URL params inside the effect to ensure fresh values
    const currentPlatesPage = parseInt(searchParams.get('plates_page') || '1')
    const currentCryovialBoxesPage = parseInt(searchParams.get('cryovial_boxes_page') || '1')
    const currentBoxesPage = parseInt(searchParams.get('boxes_page') || '1')
    const currentBagsPage = parseInt(searchParams.get('bags_page') || '1')

    const fetchData = async () => {
      try {
        const [detailResponse, listResponse] = await Promise.all([
          locationsApi.get(numericId, { 
            plates_page: currentPlatesPage,
            plates_limit: defaultLimit,
            cryovial_boxes_page: currentCryovialBoxesPage,
            cryovial_boxes_limit: defaultLimit,
            boxes_page: currentBoxesPage,
            boxes_limit: defaultLimit,
            bags_page: currentBagsPage,
            bags_limit: defaultLimit,
          }),
          locationsApi.list(),
        ])

        setLocation(detailResponse.data.location)
        setContents(detailResponse.data.contents || {})
        setHierarchyStats(detailResponse.data.hierarchyStats || null)
        setAllLocations(listResponse.data.locations || [])
        if (detailResponse.data.pagination) {
          // Pagination is a single object, but we need to set it per collection type
          // For now, we'll handle it differently - the API returns a single pagination object
          // but we need per-type pagination. This is a known limitation.
          // We'll skip setting pagination from the detail response for now
        }
      } catch (error) {
        console.error('Failed to load location details:', error)
      } finally {
        setLoading(false)
        setLoadingContext(false)
      }
    }

    fetchData()
  }, [id, searchParams])

  const pathLabel = useMemo(() => {
    if (!location) return ''
    return location.path || location.name
  }, [location])

  const stats = useMemo(() => {
    const c = contents || {}
    // Use pagination total if available, otherwise fall back to array length
    const micronixCount = pagination?.micronixPlates?.total || c.micronixPlates?.length || 0
    const cryovialBoxCount = pagination?.cryovialBoxes?.total || c.cryovialBoxes?.length || 0
    const boxCount = pagination?.boxes?.total || c.boxes?.length || 0
    const bagCount = pagination?.bags?.total || c.bags?.length || 0

    const storageUnits = micronixCount + cryovialBoxCount + boxCount + bagCount

    return {
      micronixCount,
      cryovialBoxCount,
      boxCount,
      bagCount,
      storageUnits,
    }
  }, [contents, pagination])

  // Get all locations in the same hierarchy tree (ancestors + descendants + siblings)
  const sameRootLocations = useMemo(() => {
    if (!location || allLocations.length === 0) return []
    
    // Get all ancestors
    const ancestors = getLocationAncestors(allLocations, location.id)
    
    // Get all descendants
    const descendants = getLocationDescendants(allLocations, location.id)
    
    // Get root location (first ancestor or location itself if it's a root)
    const rootLocation = ancestors.length > 0 ? ancestors[0] : location
    
    // Get all locations in the same tree (all descendants of the root)
    const rootDescendants = getLocationDescendants(allLocations, rootLocation.id)
    
    // Combine root, ancestors, descendants, and all root descendants
    const allRelated = new Set<number>()
    allRelated.add(rootLocation.id)
    ancestors.forEach(a => allRelated.add(a.id))
    descendants.forEach(d => allRelated.add(d.id))
    rootDescendants.forEach(d => allRelated.add(d.id))
    
    return allLocations.filter(loc => allRelated.has(loc.id))
  }, [location, allLocations])

  if (loading) {
    return <SkeletonDetailPage sections={2} />
  }

  if (!location) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center py-8 text-red-600">Location not found</div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <EntityBreadcrumbs
          items={[
            { label: 'Locations', to: '/locations' },
            { label: pathLabel || `Location #${location.id}` },
          ]}
        />
        <h1 className="text-3xl font-bold text-gray-900">Location Details</h1>
        <p className="mt-1 text-gray-600 font-mono">{pathLabel}</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-lg shadow p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium text-gray-500">Storage Type</h2>
            <LocationCapabilityBadge canContainCollections={location.canContainCollections} size="sm" />
          </div>
          <p className="text-lg font-semibold text-gray-900">
            {location.effectiveStorageTypeName || location.storageTypeName || location.storageTypeId || 'N/A'}
          </p>
          {location.description && (
            <p className="mt-1 text-xs text-gray-500">{location.description}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Storage Units</h2>
          <p className="text-2xl font-bold text-blue-600">
            {stats.storageUnits.toLocaleString()}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Plates, boxes and bags stored here
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Created</h2>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(location.created).toLocaleDateString()}
          </p>
        </div>

        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="text-sm font-medium text-gray-500 mb-1">Last Updated</h2>
          <p className="text-lg font-semibold text-gray-900">
            {new Date(location.lastUpdated).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Hierarchy Statistics */}
      {hierarchyStats && (
        <div className="mb-8">
          <LocationHierarchyStatsDisplay
            stats={hierarchyStats}
            locationName={location.name}
            canContainCollections={location.canContainCollections}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Hierarchy context */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-1 max-h-[600px] flex flex-col">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Hierarchy</h2>
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="flex-shrink-0">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Path</h3>
              <p className="text-sm text-gray-900">{pathLabel || 'N/A'}</p>
              <p className="text-xs text-gray-500 mt-1">
                Tree shows all locations in the same hierarchy.
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-sm font-medium text-gray-500 mb-2">Tree</h3>
              {loadingContext ? (
                <p className="text-xs text-gray-500">Loading hierarchy…</p>
              ) : sameRootLocations.length === 0 ? (
                <p className="text-xs text-gray-500">No hierarchy information available.</p>
              ) : (
                <div className="flex-1 overflow-y-auto min-h-0">
                  <LocationHierarchyTree
                    locations={sameRootLocations}
                    currentLocationId={location.id}
                    renderLocation={(loc, isCurrent) => (
                      <Link
                        to={`/locations/${loc.id}`}
                        className="block"
                      >
                        <div
                          className={`flex items-center justify-between rounded px-2 py-1 ${
                            isCurrent
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50 border border-transparent'
                          }`}
                        >
                          <div>
                            <p className="text-xs text-gray-900">
                              {loc.name}
                            </p>
                            {loc.path && (
                              <p className="text-[10px] text-gray-400 font-mono truncate">
                                {loc.path}
                              </p>
                            )}
                            {loc.description && (
                              <p className="text-[11px] text-gray-500 truncate">
                                {loc.description}
                              </p>
                            )}
                          </div>
                          {isCurrent && (
                            <span className="text-[10px] font-mono text-blue-700">
                              current
                            </span>
                          )}
                        </div>
                      </Link>
                    )}
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Contents breakdown */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold text-gray-900">Contents</h2>
          </div>

          {!contents && (
            <div className="text-gray-500 text-center py-8">No contents information available</div>
          )}

          {contents && (
            <div className="space-y-8">
              {stats.micronixCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Micronix Plates</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {stats.micronixCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contents.micronixPlates?.map((plate: any) => (
                      <ContentCard
                        key={plate.id}
                        id={plate.id}
                        name={plate.name}
                        barcode={plate.barcode}
                        created={plate.created}
                        lastUpdated={plate.lastUpdated}
                        collectionType="micronix_plate"
                        detailUrl={`/collections/micronix-plates/${plate.id}`}
                      />
                    ))}
                  </div>
                  {pagination?.micronixPlates && pagination.micronixPlates.totalPages > 1 && (
                    <div className="mt-6">
                      <Pagination
                        currentPage={platesPage}
                        totalPages={pagination.micronixPlates.totalPages}
                        totalItems={pagination.micronixPlates.total}
                        itemsPerPage={pagination.micronixPlates.limit}
                        onPageChange={(page) => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev)
                            next.set('plates_page', page.toString())
                            return next
                          })
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {stats.cryovialBoxCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Cryovial Boxes</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                      {stats.cryovialBoxCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contents.cryovialBoxes?.map((box: any) => (
                      <ContentCard
                        key={box.id}
                        id={box.id}
                        name={box.name}
                        barcode={box.barcode}
                        created={box.created}
                        lastUpdated={box.lastUpdated}
                        collectionType="cryovial_box"
                        detailUrl={`/collections/cryovial-boxes/${box.id}`}
                      />
                    ))}
                  </div>
                  {pagination?.cryovialBoxes && pagination.cryovialBoxes.totalPages > 1 && (
                    <div className="mt-6">
                      <Pagination
                        currentPage={cryovialBoxesPage}
                        totalPages={pagination.cryovialBoxes.totalPages}
                        totalItems={pagination.cryovialBoxes.total}
                        itemsPerPage={pagination.cryovialBoxes.limit}
                        onPageChange={(page) => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev)
                            next.set('cryovial_boxes_page', page.toString())
                            return next
                          })
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {stats.boxCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Boxes</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      {stats.boxCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contents.boxes?.map((box: any) => (
                      <ContentCard
                        key={box.id}
                        id={box.id}
                        name={box.name}
                        barcode={box.barcode}
                        created={box.created}
                        lastUpdated={box.lastUpdated}
                        collectionType="box"
                        detailUrl={`/collections/boxes/${box.id}`}
                      />
                    ))}
                  </div>
                  {pagination?.boxes && pagination.boxes.totalPages > 1 && (
                    <div className="mt-6">
                      <Pagination
                        currentPage={boxesPage}
                        totalPages={pagination.boxes.totalPages}
                        totalItems={pagination.boxes.total}
                        itemsPerPage={pagination.boxes.limit}
                        onPageChange={(page) => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev)
                            next.set('boxes_page', page.toString())
                            return next
                          })
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {stats.bagCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">Bags</h3>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                      {stats.bagCount}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {contents.bags?.map((bag: any) => (
                      <ContentCard
                        key={bag.id}
                        id={bag.id}
                        name={bag.name}
                        barcode={bag.barcode}
                        created={bag.created}
                        lastUpdated={bag.lastUpdated}
                        collectionType="bag"
                        detailUrl={`/collections/bags/${bag.id}`}
                      />
                    ))}
                  </div>
                  {pagination?.bags && pagination.bags.totalPages > 1 && (
                    <div className="mt-6">
                      <Pagination
                        currentPage={bagsPage}
                        totalPages={pagination.bags.totalPages}
                        totalItems={pagination.bags.total}
                        itemsPerPage={pagination.bags.limit}
                        onPageChange={(page) => {
                          setSearchParams((prev) => {
                            const next = new URLSearchParams(prev)
                            next.set('bags_page', page.toString())
                            return next
                          })
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {stats.storageUnits === 0 && (
                <div className="text-gray-500 text-center py-8">No contents found</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}


