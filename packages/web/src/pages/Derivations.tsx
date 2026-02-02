import { Link } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'
import '../styles/storage.css'

export default function Derivations() {
  const { canWrite } = useUser()

  return (
    <div className="storage-page">
      <div className="container mx-auto px-4 py-8 relative z-10">
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Derivations</h1>
              <p className="text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                Track relationships between containers when materials are processed, extracted, diluted, or otherwise transformed.
              </p>
            </div>
            {canWrite && (
              <Link to="/derivations/import" className="storage-btn-primary inline-flex items-center px-4 py-2 text-sm font-medium rounded-lg">
                Import CSV
              </Link>
            )}
          </div>
        </div>

        <div className="storage-card p-6 storage-reveal storage-reveal-2">
          <div className="text-center py-12">
            <svg className="mx-auto h-12 w-12" style={{ color: 'rgb(var(--dashboard-text-muted))' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <h3 className="mt-2 text-sm font-medium storage-section-title">Derivation List View</h3>
            <p className="mt-1 text-sm" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
              Browse derivations from individual container detail pages.
            </p>
            <div className="mt-6">
              <p className="text-sm mb-4" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                To view derivations:
              </p>
              <ul className="text-sm space-y-2 text-left max-w-md mx-auto" style={{ color: 'rgb(var(--dashboard-text-muted))' }}>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Navigate to any container detail page</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>View derived containers or source information in the derivation sections</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Click "View Chain" to see the full derivation chain</span>
                </li>
                <li className="flex items-start">
                  <span className="mr-2">•</span>
                  <span>Use "Import CSV" to create multiple derivations at once</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

