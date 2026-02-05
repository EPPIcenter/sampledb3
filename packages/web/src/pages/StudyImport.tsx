import { useParams, Navigate, Link } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import { useStudy } from '../hooks/useStudies'
import BulkImportFlow from '../components/BulkImportFlow'
import EntityBreadcrumbs from '../components/EntityBreadcrumbs'
import '../styles/storage.css'
import '../styles/studies.css'

export default function StudyImport() {
  const { id } = useParams<{ id: string }>()
  const { canWrite } = useUser()
  const studyId = id != null ? parseInt(id, 10) : NaN
  const { data: study, isLoading, isError } = useStudy(studyId)

  if (!canWrite) {
    return <Navigate to={id ? `/studies/${id}` : '/studies'} replace />
  }

  if (id == null || Number.isNaN(studyId)) {
    return (
      <div className="studies-page min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-8">
          <p style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Invalid study.</p>
          <Link to="/studies" className="storage-link mt-2 inline-block">Back to Studies</Link>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="studies-page min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-8">
          <p style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Loading study…</p>
        </div>
      </div>
    )
  }

  if (isError || !study) {
    return (
      <div className="studies-page min-h-screen">
        <div className="max-w-screen-2xl mx-auto px-4 py-8">
          <p style={{ color: 'rgb(var(--dashboard-text-muted))' }}>Study not found or failed to load.</p>
          <Link to="/studies" className="storage-link mt-2 inline-block">Back to Studies</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="studies-page min-h-screen">
      <div className="max-w-screen-2xl mx-auto px-4 py-8 relative z-10">
        <EntityBreadcrumbs
          items={[
            { label: 'Studies', to: '/studies' },
            { label: study.title, to: `/studies/${study.id}` },
            { label: 'Bulk import' },
          ]}
        />
        <div className="mt-4 mb-6">
          <h1 className="text-3xl font-bold" style={{ color: 'rgb(var(--dashboard-text))' }}>
            Bulk import
          </h1>
          <p className="mt-1 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
            Study: {study.title} ({study.shortCode}). You do not need a study column in your CSV.
          </p>
        </div>
        <BulkImportFlow
          fixedStudyShortCode={study.shortCode}
          backLink={{ to: `/studies/${study.id}`, label: 'Back to study' }}
        />
      </div>
    </div>
  )
}
