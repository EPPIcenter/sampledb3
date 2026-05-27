import { useMemo, useState } from 'react'
import DataTable, { Column } from '../components/DataTable'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import SpecimenFilter, { type SpecimenFilters } from '../components/SpecimenFilter'
import { useUser } from '../contexts/UserContext'
import { useSpecimens } from '../hooks/useSpecimens'
import type { SpecimenListParams } from '../lib/api/specimens'
import type { Specimen } from '../lib/api/types'
import {
  AsyncPresentation,
  EmptyState,
  PageError,
  buttonClassName,
  fromQuery,
  getQueryErrorMessage,
} from '../ui'
import '../styles/subject-specimen.css'

type SpecimenListRow = Specimen & {
  study?: { shortCode?: string }
  studySubject?: { name: string }
  controlBatch?: { name: string }
}

function filtersToParams(filters: SpecimenFilters): SpecimenListParams {
  return {
    study: filters.study,
    source_type: filters.sourceType,
    specimen_type_id: filters.specimenTypeId,
    collection_date_from: filters.collectionDateFrom,
    collection_date_to: filters.collectionDateTo,
    created_from: filters.createdFrom,
    created_to: filters.createdTo,
    search: filters.search,
  }
}

function filtersFromSearchParams(searchParams: URLSearchParams): SpecimenFilters {
  return {
    study: searchParams.get('study') || undefined,
    sourceType: searchParams.get('source_type') || undefined,
    specimenTypeId: searchParams.get('specimen_type_id') || undefined,
    collectionDateFrom: searchParams.get('collection_date_from') || undefined,
    collectionDateTo: searchParams.get('collection_date_to') || undefined,
    createdFrom: searchParams.get('created_from') || undefined,
    createdTo: searchParams.get('created_to') || undefined,
    search: searchParams.get('search') || searchParams.get('barcode') || undefined,
  }
}

export default function Specimens() {
  const navigate = useNavigate()
  const { canWrite } = useUser()
  const [searchParams, setSearchParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const pageSize = 50

  const [filters, setFilters] = useState<SpecimenFilters>(() => filtersFromSearchParams(searchParams))

  const listParams = useMemo(() => filtersToParams(filters), [filters])
  const specimensQuery = useSpecimens(listParams)

  const specimens = (specimensQuery.data ?? []) as SpecimenListRow[]
  const listStatus = fromQuery(specimensQuery, {
    isEmpty: specimensQuery.isSuccess && specimens.length === 0,
  })

  const handleFilterChange = (newFilters: SpecimenFilters) => {
    setFilters(newFilters)
    setPage(1)

    const params: Record<string, string> = {}
    if (newFilters.study) params.study = newFilters.study
    if (newFilters.sourceType) params.source_type = newFilters.sourceType
    if (newFilters.specimenTypeId) params.specimen_type_id = newFilters.specimenTypeId
    if (newFilters.collectionDateFrom) params.collection_date_from = newFilters.collectionDateFrom
    if (newFilters.collectionDateTo) params.collection_date_to = newFilters.collectionDateTo
    if (newFilters.createdFrom) params.created_from = newFilters.createdFrom
    if (newFilters.createdTo) params.created_to = newFilters.createdTo
    if (newFilters.search) params.search = newFilters.search

    setSearchParams(params)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString()
  }

  const columns: Column<SpecimenListRow>[] = [
    {
      key: 'study',
      label: 'Study',
      render: (_, row) => row.study?.shortCode || '—',
    },
    {
      key: 'source',
      label: 'Source',
      render: (_, row) => {
        if (row.studySubject) return row.studySubject.name
        if (row.controlBatch) return `Control: ${row.controlBatch.name}`
        return '—'
      },
    },
    {
      key: 'specimenType',
      label: 'Type',
      render: (_, row) => row.specimenType?.name || '—',
    },
    {
      key: 'collectionDate',
      label: 'Collected',
      sortable: true,
      render: (value) => formatDate(value as string),
    },
    {
      key: 'created',
      label: 'Created',
      sortable: true,
      render: (value) => formatDate(value as string),
    },
  ]

  const listErrorMessage = specimensQuery.error
    ? getQueryErrorMessage(specimensQuery.error, 'Failed to load specimens')
    : 'Failed to load specimens'

  const emptyAction = canWrite ? (
    <Link to="/specimens/new" className={buttonClassName('primary')}>
      Register a specimen
    </Link>
  ) : undefined

  return (
    <div className="subject-specimen-page">
      <div className="container mx-auto px-4 py-8 relative z-[1]">
        <div className="subject-specimen-reveal subject-specimen-reveal-1 flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold">Specimens</h1>
          {canWrite && (
            <Link
              to="/specimens/new"
              className={buttonClassName('primary', { className: 'whitespace-nowrap no-underline' })}
            >
              New Specimen
            </Link>
          )}
        </div>
        {!canWrite && (
          <div className="subject-specimen-reveal subject-specimen-reveal-2 mb-4 rounded-lg bg-[rgb(var(--app-accent-muted))] border border-[rgb(var(--app-accent)/0.3)] p-3">
            <div className="flex items-center gap-2">
              <svg
                className="w-5 h-5 text-[rgb(var(--app-accent))]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <p className="text-sm font-medium text-[rgb(var(--app-text))]">
                You have view-only access. Contact an administrator or member to create or modify
                specimens.
              </p>
            </div>
          </div>
        )}

        <div className="subject-specimen-reveal subject-specimen-reveal-3">
          <SpecimenFilter
            filters={filters}
            onChange={setFilters}
            onSubmit={handleFilterChange}
            isLoading={specimensQuery.isPending}
          />
        </div>

        <div className="subject-specimen-reveal subject-specimen-reveal-4">
          <AsyncPresentation
            status={listStatus}
            loadingFallback={
              <DataTable
                data={[]}
                columns={columns}
                loading
                density="compact"
                emptyMessage="No specimens found"
                className="dashboard-card overflow-hidden"
              />
            }
            errorFallback={
              <PageError message={listErrorMessage} onRetry={() => void specimensQuery.refetch()} />
            }
            emptyFallback={
              <EmptyState
                title="No specimens found"
                description="Try adjusting your filters"
                action={emptyAction}
              />
            }
          >
            <DataTable
              data={specimens}
              columns={columns}
              loading={false}
              density="compact"
              onRowClick={(specimen) => navigate(`/specimens/${specimen.id}`)}
              emptyMessage="No specimens found"
              pagination={{
                page,
                pageSize,
                onPageChange: setPage,
                showPagination: true,
              }}
              className="dashboard-card overflow-hidden"
            />
          </AsyncPresentation>
        </div>
      </div>
    </div>
  )
}
