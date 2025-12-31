import { useEffect, useState, useCallback, useRef } from 'react'
import DataTable, { Column } from '../components/DataTable'
import Pagination from '../components/Pagination'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import api from '../lib/api'
import SpecimenFilter, { type SpecimenFilters } from '../components/SpecimenFilter'
import { getModifierKey } from '../lib/hotkeys'

interface Specimen {
  id: number
  studySubjectId?: number
  controlBatchId?: number
  specimenTypeId: number
  collectionDate?: string
  created: string
  specimenType?: {
    id: number
    name: string
  }
  studySubject?: {
    id: number
    name: string
  }
  study?: {
    id: number
    shortCode: string
  }
  controlBatch?: {
    id: number
    name: string
  }
}

export default function Specimens() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [specimens, setSpecimens] = useState<Specimen[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(parseInt(searchParams.get('page') || '1'))
  const [totalPages, setTotalPages] = useState(1)
  const [total, setTotal] = useState(0)
  const limit = 50
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const [filters, setFilters] = useState<SpecimenFilters>({
    study: searchParams.get('study') || undefined,
    sourceType: searchParams.get('source_type') || undefined,
    specimenTypeId: searchParams.get('specimen_type_id') || undefined,
    collectionDateFrom: searchParams.get('collection_date_from') || undefined,
    collectionDateTo: searchParams.get('collection_date_to') || undefined,
    createdFrom: searchParams.get('created_from') || undefined,
    createdTo: searchParams.get('created_to') || undefined,
    search: searchParams.get('search') || searchParams.get('barcode') || undefined,
  })

  const loadSpecimens = useCallback(async () => {
    try {
      setLoading(true)
      const params: any = { 
        page, 
        limit,
        study: filters.study,
        source_type: filters.sourceType,
        specimen_type_id: filters.specimenTypeId,
        collection_date_from: filters.collectionDateFrom,
        collection_date_to: filters.collectionDateTo,
        created_from: filters.createdFrom,
        created_to: filters.createdTo,
        search: filters.search,
      }
      
      const response = await api.get('/specimens', { params })
      setSpecimens(response.data.specimens || [])
      if (response.data.pagination) {
        setTotalPages(response.data.pagination.totalPages)
        setTotal(response.data.pagination.total)
      }
    } catch (error) {
      console.error('Failed to load specimens:', error)
    } finally {
      setLoading(false)
    }
  }, [page, filters])

  useEffect(() => {
    void loadSpecimens()
  }, [loadSpecimens])

  const handleFilterChange = (newFilters: SpecimenFilters) => {
    setFilters(newFilters)
    setPage(1) // Reset to first page when filters change
    
    // Update URL params
    const params: any = { page: '1' }
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

  const handleFilterSubmit = (newFilters: SpecimenFilters) => {
    handleFilterChange(newFilters)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return '—'
    return new Date(dateString).toLocaleDateString()
  }


  const columns: Column<Specimen>[] = [
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

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-gray-900">Specimens</h1>
        <Link
          to="/specimens/new"
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium whitespace-nowrap transition-colors inline-flex items-center"
        >
            New Specimen
          </Link>
      </div>

      <SpecimenFilter
        filters={filters}
        onChange={setFilters}
        onSubmit={handleFilterSubmit}
        isLoading={loading}
      />

      <DataTable
        data={specimens}
        columns={columns}
        loading={loading}
        density="compact"
        onRowClick={(specimen) => window.location.href = `/specimens/${specimen.id}`}
        emptyMessage="No specimens found"
      />
      
      {!loading && specimens.length > 0 && (
        <Pagination
          currentPage={page}
          totalPages={totalPages}
          totalItems={total}
          itemsPerPage={limit}
          onPageChange={(p) => {
            setPage(p)
            setSearchParams({ ...Object.fromEntries(searchParams.entries()), page: p.toString() })
          }}
        />
      )}
    </div>
  )
}
