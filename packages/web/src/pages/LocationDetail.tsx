import { useEffect, useMemo, useState } from 'react'
import { useParams, Link, useSearchParams } from 'react-router-dom'
import { locationsApi } from '../lib/api'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import LocationHierarchyTree from '../components/LocationHierarchyTree'
import Pagination from '../components/Pagination'
import SkeletonDetailPage from '../components/SkeletonDetailPage'

interface Location {
  id: number
  locationRoot: string
  storageTypeId: string
  description?: string
  levelI: string
  levelII: string
  levelIII?: string
  created: string
  lastUpdated: string
}

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
  const [allLocations, setAllLocations] = useState<Location[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingContext, setLoadingContext] = useState(true)
  const defaultLimit = 25
  
  // Pagination state for all collection types
  const [platesPage, setPlatesPage] = useState(parseInt(searchParams.get('plates_page') || '1'))
  const [cryovialBoxesPage, setCryovialBoxesPage] = useState(parseInt(searchParams.get('cryovial_boxes_page') || '1'))
  const [boxesPage, setBoxesPage] = useState(parseInt(searchParams.get('boxes_page') || '1'))
  const [bagsPage, setBagsPage] = useState(parseInt(searchParams.get('bags_page') || '1'))
  
  const [pagination, setPagination] = useState<{
    micronixPlates?: { page: number; totalPages: number; total: number; limit: number }
    cryovialBoxes?: { page: number; totalPages: number; total: number; limit: number }
    boxes?: { page: number; totalPages: number; total: number; limit: number }
    bags?: { page: number; totalPages: number; total: number; limit: number }
  } | null>(null)

  // Sync page states with URL params
  useEffect(() => {
    const platesPageFromUrl = parseInt(searchParams.get('plates_page') || '1')
    const cryovialBoxesPageFromUrl = parseInt(searchParams.get('cryovial_boxes_page') || '1')
    const boxesPageFromUrl = parseInt(searchParams.get('boxes_page') || '1')
    const bagsPageFromUrl = parseInt(searchParams.get('bags_page') || '1')
    
    if (platesPageFromUrl !== platesPage) setPlatesPage(platesPageFromUrl)
    if (cryovialBoxesPageFromUrl !== cryovialBoxesPage) setCryovialBoxesPage(cryovialBoxesPageFromUrl)
    if (boxesPageFromUrl !== boxesPage) setBoxesPage(boxesPageFromUrl)
    if (bagsPageFromUrl !== bagsPage) setBagsPage(bagsPageFromUrl)
  }, [searchParams, platesPage, cryovialBoxesPage, boxesPage, bagsPage])

  useEffect(() => {
    if (!id) return

    const numericId = parseInt(id)
    if (Number.isNaN(numericId)) return

    const fetchData = async () => {
      try {
        const [detailResponse, listResponse] = await Promise.all([
          locationsApi.get(numericId, { 
            plates_page: platesPage,
            plates_limit: defaultLimit,
            cryovial_boxes_page: cryovialBoxesPage,
            cryovial_boxes_limit: defaultLimit,
            boxes_page: boxesPage,
            boxes_limit: defaultLimit,
            bags_page: bagsPage,
            bags_limit: defaultLimit,
          }),
          locationsApi.list(),
        ])

        setLocation(detailResponse.data.location)
        setContents(detailResponse.data.contents || {})
        setAllLocations(listResponse.data.locations || [])
        if (detailResponse.data.pagination) {
          setPagination(detailResponse.data.pagination)
        }
      } catch (error) {
        console.error('Failed to load location details:', error)
      } finally {
        setLoading(false)
        setLoadingContext(false)
      }
    }

    fetchData()
  }, [id, platesPage, cryovialBoxesPage, boxesPage, bagsPage])

  const pathLabel = useMemo(() => {
    if (!location) return ''
    const parts = [location.locationRoot, location.levelI, location.levelII]
    if (location.levelIII) parts.push(location.levelIII)
    return parts.filter(Boolean).join(' \u2192 ')
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

  // Filter locations to same root for hierarchy display
  const sameRootLocations = useMemo(() => {
    if (!location || allLocations.length === 0) return []
    return allLocations.filter(
      (loc) => loc.locationRoot === location.locationRoot
    )
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
          <h2 className="text-sm font-medium text-gray-500 mb-1">Storage Type</h2>
          <p className="text-lg font-semibold text-gray-900">{location.storageTypeId}</p>
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        {/* Hierarchy context */}
        <div className="bg-white rounded-lg shadow p-6 lg:col-span-1 max-h-[600px] flex flex-col">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Hierarchy</h2>
          <div className="space-y-4 flex flex-col min-h-0">
            <div className="flex-shrink-0">
              <h3 className="text-sm font-medium text-gray-500 mb-1">Path</h3>
              <p className="text-sm text-gray-900">{pathLabel || 'N/A'}</p>
              <p className="text-xs text-gray-500 mt-1">
                Tree shows all locations in storage root{' '}
                <span className="font-mono text-gray-700">{location.locationRoot}</span>.
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
                    filterByRoot={location.locationRoot}
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
                              {loc.levelIII || loc.levelII}
                            </p>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-gray-900">Contents</h2>
          </div>

          {!contents && (
            <div className="text-gray-500 text-center py-8">No contents information available</div>
          )}

          {contents && (
            <div className="space-y-6">
              {stats.micronixCount > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      Micronix Plates ({stats.micronixCount})
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {contents.micronixPlates?.map((plate: any) => (
                      <Link
                        key={plate.id}
                        to={`/collections/micronix-plates/${plate.id}`}
                        className="flex items-center justify-between text-sm text-gray-700 border-b last:border-b-0 py-1 hover:bg-blue-50"
                      >
                        <div>
                          <span className="font-medium text-blue-700">{plate.name}</span>
                          {plate.barcode && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({plate.barcode})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-blue-600 font-semibold">
                          View
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pagination?.micronixPlates && pagination.micronixPlates.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={platesPage}
                        totalPages={pagination.micronixPlates.totalPages}
                        totalItems={pagination.micronixPlates.total}
                        itemsPerPage={pagination.micronixPlates.limit}
                        onPageChange={(page) => {
                          setPlatesPage(page)
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      Cryovial Boxes ({stats.cryovialBoxCount})
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {contents.cryovialBoxes?.map((box: any) => (
                      <Link
                        key={box.id}
                        to={`/collections/cryovial-boxes/${box.id}`}
                        className="flex items-center justify-between text-sm text-gray-700 border-b last:border-b-0 py-1 hover:bg-blue-50"
                      >
                        <div>
                          <span className="font-medium text-blue-700">{box.name}</span>
                          {box.barcode && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({box.barcode})
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-blue-600 font-semibold">
                          View
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pagination?.cryovialBoxes && pagination.cryovialBoxes.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={cryovialBoxesPage}
                        totalPages={pagination.cryovialBoxes.totalPages}
                        totalItems={pagination.cryovialBoxes.total}
                        itemsPerPage={pagination.cryovialBoxes.limit}
                        onPageChange={(page) => {
                          setCryovialBoxesPage(page)
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      Boxes ({stats.boxCount})
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {contents.boxes?.map((box: any) => (
                      <Link
                        key={box.id}
                        to={`/collections/boxes/${box.id}`}
                        className="flex items-center justify-between text-sm text-gray-700 border-b last:border-b-0 py-1 hover:bg-blue-50"
                      >
                        <div>
                          <span className="font-medium text-blue-700">{box.name}</span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-semibold">
                          View
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pagination?.boxes && pagination.boxes.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={boxesPage}
                        totalPages={pagination.boxes.totalPages}
                        totalItems={pagination.boxes.total}
                        itemsPerPage={pagination.boxes.limit}
                        onPageChange={(page) => {
                          setBoxesPage(page)
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
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      Bags ({stats.bagCount})
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {contents.bags?.map((bag: any) => (
                      <Link
                        key={bag.id}
                        to={`/collections/bags/${bag.id}`}
                        className="flex items-center justify-between text-sm text-gray-700 border-b last:border-b-0 py-1 hover:bg-blue-50"
                      >
                        <div>
                          <span className="font-medium text-blue-700">{bag.name}</span>
                        </div>
                        <span className="text-[10px] text-blue-600 font-semibold">
                          View
                        </span>
                      </Link>
                    ))}
                  </div>
                  {pagination?.bags && pagination.bags.totalPages > 1 && (
                    <div className="mt-4">
                      <Pagination
                        currentPage={bagsPage}
                        totalPages={pagination.bags.totalPages}
                        totalItems={pagination.bags.total}
                        itemsPerPage={pagination.bags.limit}
                        onPageChange={(page) => {
                          setBagsPage(page)
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

      {/* Actions and navigation back to hierarchy view */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          Manage storage locations and inventory from the{' '}
          <Link to="/locations" className="text-blue-600 hover:underline">
            Locations overview
          </Link>
          .
        </div>
      </div>
    </div>
  )
}


