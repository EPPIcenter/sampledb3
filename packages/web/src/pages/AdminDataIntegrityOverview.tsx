import { Link } from 'react-router-dom'
import { useAdminIntegrityReport } from '../hooks/useAdmin'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/admin.css'

export default function AdminDataIntegrityOverview() {
  const reportQuery = useAdminIntegrityReport()
  const reportStatus = fromQuery(reportQuery)
  const report = reportQuery.data ?? null

  if (reportStatus === 'loading') {
    return (
      <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">
        Loading…
      </div>
    )
  }

  if (reportStatus === 'error') {
    return (
      <PageError
        title="Could not load integrity overview"
        message={getQueryErrorMessage(reportQuery.error, 'Failed to load integrity report')}
        onRetry={() => void reportQuery.refetch()}
      />
    )
  }

  if (!report) return null

  const emptyCount = report.emptyCollections.length
  const integrityIssueCount =
    report.collectionsWithMissingLocation.length +
    report.containersWithMissingSpecimen.length +
    report.subtypeOrphans.length +
    report.sheetsWithMissingBoxOrBag.length +
    report.specimensWithMissingSubjectOrBatch.length +
    report.studySubjectsWithMissingStudy.length +
    report.derivationBrokenRefs.length +
    report.storageContainerTagOrphans.length +
    report.duplicateBarcodes.length +
    report.locationPathInconsistencies.length
    // containersWithNoGridPosition is informational and is not an integrity issue count

  return (
    <div className="space-y-6">
      <p className="text-[rgb(var(--app-text-muted))]">
        View and manage data integrity: empty collections (with delete) and read-only integrity checks.
      </p>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Link
          to="/admin/data-integrity/empty-collections"
          className="admin-card block p-6 no-underline transition-shadow hover:shadow-md"
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'rgb(var(--app-text))' }}>
            Empty collections
          </h2>
          <p className="text-2xl font-bold text-[rgb(var(--app-accent))] mb-2">{emptyCount}</p>
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Plates, boxes, bags with no items. Select and delete to tidy.
          </p>
        </Link>

        <Link
          to="/admin/data-integrity/report"
          className="admin-card block p-6 no-underline transition-shadow hover:shadow-md"
        >
          <h2 className="text-lg font-semibold mb-1" style={{ color: 'rgb(var(--app-text))' }}>
            Integrity report
          </h2>
          <p className="text-2xl font-bold text-[rgb(var(--app-accent))] mb-2">{integrityIssueCount}</p>
          <p className="text-sm text-[rgb(var(--app-text-muted))]">
            Orphans, broken references, duplicate micronix barcodes, path inconsistencies.
          </p>
        </Link>
      </div>
    </div>
  )
}
