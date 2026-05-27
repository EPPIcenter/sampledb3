import { useMemo } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import type { LocationHierarchyStats } from '../lib/api/locations'
import type { Location } from '../lib/api/types'
import { getLocationAncestors, getLocationDescendants } from '../lib/location-tree'
import { useLocationDetailPage } from '../hooks/useLocations'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import LocationHierarchyTree from '../components/LocationHierarchyTree'
import LocationHierarchyStatsDisplay from '../components/LocationHierarchyStats'
import LocationCapabilityBadge from '../components/LocationCapabilityBadge'
import Pagination from '../components/Pagination'
import { DetailPageSkeleton, PageError, fromQuery, getQueryErrorMessage } from '../ui'
import ContentCard from '../components/ContentCard'
import '../styles/storage.css'

interface LocationContents {
  micronixPlates?: any[]
  cryovialBoxes?: any[]
  boxes?: any[]
  bags?: any[]
}

export default function LocationDetail() {
  const { id } = useParams<{ id: string }>()
  const [searchParams, setSearchParams] = useSearchParams()
  const defaultLimit = 25
  const locationId = id != null ? parseInt(id, 10) : NaN

  const platesPage = parseInt(searchParams.get('plates_page') || '1')
  const cryovialBoxesPage = parseInt(searchParams.get('cryovial_boxes_page') || '1')
  const boxesPage = parseInt(searchParams.get('boxes_page') || '1')
  const bagsPage = parseInt(searchParams.get('bags_page') || '1')

  const pageParams = {
    plates_page: platesPage,
    plates_limit: defaultLimit,
    cryovial_boxes_page: cryovialBoxesPage,
    cryovial_boxes_limit: defaultLimit,
    boxes_page: boxesPage,
    boxes_limit: defaultLimit,
    bags_page: bagsPage,
    bags_limit: defaultLimit,
  }

  const detailQuery = useLocationDetailPage(locationId, pageParams)
  const detailStatus = fromQuery(detailQuery)
  const location = (detailQuery.data?.location as Location | undefined) ?? null
  const contents = (detailQuery.data?.contents as LocationContents | undefined) ?? null
  const hierarchyStats = (detailQuery.data?.hierarchyStats as LocationHierarchyStats | undefined) ?? null
  const allLocations = (detailQuery.data?.allLocations as Location[] | undefined) ?? []
  const pagination = detailQuery.data?.pagination ?? null

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

  if (detailStatus === 'loading') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <DetailPageSkeleton sections={2} />
        </div>
      </div>
    )
  }

  if (detailStatus === 'error') {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <PageError
            title="Could not load location"
            message={getQueryErrorMessage(detailQuery.error, 'Failed to load location details')}
            onRetry={() => void detailQuery.refetch()}
          />
        </div>
      </div>
    )
  }

  if (!location) {
    return (
      <div className="storage-page">
        <div className="container mx-auto px-4 py-8 relative z-10">
          <div className="text-center py-8 text-app-trend-down">Location not found</div>
        </div>
      </div>
    )
  }

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
      <div className="mb-6 storage-reveal storage-reveal-1">
        <EntityBreadcrumbs
          items={[
            { label: 'Locations', to: '/locations' },
            { label: pathLabel || `Location #${location.id}` },
          ]}
        />
        <h1 className="text-3xl font-bold">Location Details</h1>
        <p className="mt-1 font-mono" style={{ color: 'rgb(var(--app-text-muted))' }}>{pathLabel}</p>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 storage-reveal storage-reveal-2">
        <div className="storage-card p-4">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-sm font-medium" style={{ color: 'rgb(var(--app-text-muted))' }}>Storage Type</h2>
            <LocationCapabilityBadge canContainCollections={location.canContainCollections} size="sm" />
          </div>
          <p className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
            {location.effectiveStorageTypeName || location.storageTypeName || location.storageTypeId || 'N/A'}
          </p>
          {location.description && (
            <p className="mt-1 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>{location.description}</p>
          )}
        </div>

        <div className="storage-card p-4">
          <h2 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Storage Units</h2>
          <p className="text-2xl font-bold" style={{ color: 'rgb(var(--app-accent))' }}>
            {stats.storageUnits.toLocaleString()}
          </p>
          <p className="mt-1 text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Plates, boxes and bags stored here
          </p>
        </div>

        <div className="storage-card p-4">
          <h2 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Created</h2>
          <p className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
            {new Date(location.created).toLocaleDateString()}
          </p>
        </div>

        <div className="storage-card p-4">
          <h2 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Last Updated</h2>
          <p className="text-lg font-semibold" style={{ color: 'rgb(var(--app-text))' }}>
            {new Date(location.lastUpdated).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Hierarchy Statistics */}
      {hierarchyStats && (
        <div className="mb-8 storage-reveal storage-reveal-3">
          <LocationHierarchyStatsDisplay
            stats={hierarchyStats}
            locationName={location.name}
            canContainCollections={location.canContainCollections}
            className="storage-hierarchy-stats"
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8 storage-reveal storage-reveal-4">
        {/* Hierarchy context */}
        <div className="storage-card p-6 lg:col-span-1 max-h-[600px] flex flex-col">
          <h2 className="text-xl font-semibold storage-section-title mb-4">Hierarchy</h2>
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="flex-shrink-0">
              <h3 className="text-sm font-medium mb-1" style={{ color: 'rgb(var(--app-text-muted))' }}>Path</h3>
              <p className="text-sm" style={{ color: 'rgb(var(--app-text))' }}>{pathLabel || 'N/A'}</p>
              <p className="text-xs mt-1" style={{ color: 'rgb(var(--app-text-muted))' }}>
                Tree shows all locations in the same hierarchy.
              </p>
            </div>

            <div className="flex-1 flex flex-col min-h-0">
              <h3 className="text-sm font-medium mb-2" style={{ color: 'rgb(var(--app-text-muted))' }}>Tree</h3>
              {detailQuery.isPending ? (
                <p className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>Loading hierarchy…</p>
              ) : sameRootLocations.length === 0 ? (
                <p className="text-xs" style={{ color: 'rgb(var(--app-text-muted))' }}>No hierarchy information available.</p>
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
                          className={`flex items-center justify-between rounded px-2 py-1 border transition-colors ${
                            isCurrent
                              ? 'border shadow-sm'
                              : 'border-transparent hover:bg-[rgb(var(--app-surface))]'
                          }`}
                          style={isCurrent ? { backgroundColor: 'rgb(var(--app-accent-muted))', borderColor: 'rgb(var(--app-accent) / 0.4)' } : undefined}
                        >
                          <div>
                            <p className="text-xs" style={{ color: 'rgb(var(--app-text))' }}>
                              {loc.name}
                            </p>
                            {loc.path && (
                              <p className="text-[10px] font-mono truncate" style={{ color: 'rgb(var(--app-text-muted))' }}>
                                {loc.path}
                              </p>
                            )}
                            {loc.description && (
                              <p className="text-[11px] truncate" style={{ color: 'rgb(var(--app-text-muted))' }}>
                                {loc.description}
                              </p>
                            )}
                          </div>
                          {isCurrent && (
                            <span className="text-[10px] font-mono" style={{ color: 'rgb(var(--app-accent))' }}>
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
        <div className="storage-card p-6 lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-semibold storage-section-title">Contents</h2>
          </div>

          {!contents && (
            <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>No contents information available</div>
          )}

          {contents && (
            <div className="space-y-8">
              {stats.micronixCount > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <h3 className="text-lg font-semibold storage-section-title">Micronix Plates</h3>
                    <span className="storage-badge-plate">
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
                    <h3 className="text-lg font-semibold storage-section-title">Cryovial Boxes</h3>
                    <span className="storage-badge-cryovial">
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
                    <h3 className="text-lg font-semibold storage-section-title">Boxes</h3>
                    <span className="storage-badge-box">
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
                    <h3 className="text-lg font-semibold storage-section-title">Bags</h3>
                    <span className="storage-badge-bag">
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
                <div className="text-center py-8" style={{ color: 'rgb(var(--app-text-muted))' }}>No contents found</div>
              )}
            </div>
          )}
        </div>
      </div>
      </div>
    </div>
  )
}


