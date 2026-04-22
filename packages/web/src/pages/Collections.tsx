import { useEffect, useState, useMemo, useCallback, useRef } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import DataTable, { Column } from '../components/DataTable'
import SkeletonTable from '../components/SkeletonTable'
import { collectionsApi } from '../lib/api'
import { filterCollections, type CollectionListItem, type CollectionTypeFilter } from '../lib/collections-browse'
import { useFocusSearchOnSlash } from '../hooks/useHotkey'
import '../styles/subject-specimen.css'

const PAGE_SIZE = 50
const TYPE_TABS: { value: CollectionTypeFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'micronix_plate', label: 'Micronix Plates' },
  { value: 'cryovial_box', label: 'Cryovial Boxes' },
  { value: 'box', label: 'Boxes' },
  { value: 'bag', label: 'Bags' },
]

function getCollectionDetailUrl(c: CollectionListItem): string {
  switch (c.type) {
    case 'micronix_plate':
      return `/collections/micronix-plates/${c.id}`
    case 'cryovial_box':
      return `/collections/cryovial-boxes/${c.id}`
    case 'box':
      return `/collections/boxes/${c.id}`
    case 'bag':
      return `/collections/bags/${c.id}`
    default:
      return '#'
  }
}

function getTypeLabel(type: CollectionListItem['type']): string {
  const tab = TYPE_TABS.find((t) => t.value === type)
  return tab?.label ?? type
}

export default function Collections() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const tabFromUrl = (searchParams.get('tab') as CollectionTypeFilter | null) ?? 'all'
  const [page, setPage] = useState(1)
  const prevTabRef = useRef(tabFromUrl)

  // Reset page when tab changes (e.g. back/forward or tab click); URL is source of truth
  if (prevTabRef.current !== tabFromUrl) {
    prevTabRef.current = tabFromUrl
    setPage(1)
  }

  const setTypeTab = useCallback(
    (tab: CollectionTypeFilter) => {
      setPage(1)
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (tab === 'all') {
          next.delete('tab')
        } else {
          next.set('tab', tab)
        }
        return next
      })
    },
    [setSearchParams]
  )

  const [collections, setCollections] = useState<CollectionListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef<HTMLInputElement>(null)
  useFocusSearchOnSlash(searchInputRef)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        setLoading(true)
        setError(null)
        const res = await collectionsApi.listAllCollections()
        const list = res.data.collections as CollectionListItem[]
        if (!cancelled) setCollections(list)
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load collections')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredCollections = useMemo(
    () => filterCollections(collections, search, tabFromUrl),
    [collections, search, tabFromUrl]
  )

  const columns: Column<CollectionListItem>[] = [
    {
      key: 'name',
      label: 'Name',
      sortable: true,
      render: (_, row) => (
        <Link to={getCollectionDetailUrl(row)} className="dashboard-link font-medium hover:underline">
          {row.name}
        </Link>
      ),
    },
    {
      key: 'type',
      label: 'Type',
      sortable: true,
      render: (_, row) => getTypeLabel(row.type),
    },
    {
      key: 'barcode',
      label: 'Barcode',
      render: (value) => (value ? String(value) : '—'),
    },
    {
      key: 'location',
      label: 'Location',
      render: (_, row) => row.location?.path ?? '—',
    },
    {
      key: 'itemCount',
      label: 'Items',
      sortable: true,
      render: (value) => (typeof value === 'number' ? value : '—'),
    },
  ]

  const emptyMessage =
    search.trim() || tabFromUrl !== 'all'
      ? 'No collections match your search.'
      : 'No collections in the system.'

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="subject-specimen-reveal subject-specimen-reveal-1 mb-6">
          <h1 className="text-3xl font-bold">Collections</h1>
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Browse and search plates, boxes, and bags. Use the search box to find by name, barcode, or location.
          </p>
        </div>

        {error && (
          <div
            className="subject-specimen-reveal subject-specimen-reveal-2 mb-4 rounded-lg border border-app-trend-down bg-app-trend-down/10 p-3 text-app-trend-down"
            role="alert"
          >
            {error}
          </div>
        )}

        <div className="dashboard-card rounded-xl overflow-hidden subject-specimen-reveal subject-specimen-reveal-3">
          <div
            className="border-b flex flex-wrap gap-1 px-4 pt-2"
            style={{ borderColor: 'rgb(var(--app-border))' }}
          >
            {TYPE_TABS.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setTypeTab(tab.value)}
                className={`px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                  tabFromUrl === tab.value ? 'border-[rgb(var(--app-accent))] text-[rgb(var(--app-accent))]' : 'border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-4">
            <div className="mb-4">
              <label htmlFor="collections-search" className="sr-only">
                Search by name, barcode, or location
              </label>
              <div className="relative max-w-md">
                <div
                  className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"
                  style={{ color: 'rgb(var(--app-text-muted))' }}
                >
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  id="collections-search"
                  ref={searchInputRef}
                  type="search"
                  placeholder="Search by name, barcode, or location"
                  className="block w-full pl-10 pr-3 py-2 border rounded-lg text-sm"
                  style={{ borderColor: 'rgb(var(--app-border))' }}
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value)
                    setPage(1)
                  }}
                />
              </div>
            </div>

            {loading ? (
              <SkeletonTable rows={8} columns={5} density="compact" />
            ) : (
              <DataTable
                key={tabFromUrl}
                data={filteredCollections}
                columns={columns}
                loading={false}
                density="compact"
                onRowClick={(row) => navigate(getCollectionDetailUrl(row))}
                emptyMessage={emptyMessage}
                pagination={{
                  page,
                  pageSize: PAGE_SIZE,
                  onPageChange: setPage,
                  showPagination: true,
                }}
              />
            )}
          </div>
        </div>

        {!loading && !error && filteredCollections.length > 0 && (
          <p className="mt-2 text-sm subject-specimen-reveal subject-specimen-reveal-4" style={{ color: 'rgb(var(--app-text-muted))' }}>
            Showing {Math.min((page - 1) * PAGE_SIZE + 1, filteredCollections.length)}–
            {Math.min(page * PAGE_SIZE, filteredCollections.length)} of {filteredCollections.length} collections
            {filteredCollections.length < collections.length && ' (filtered)'}.
          </p>
        )}
      </div>
    </div>
  )
}
