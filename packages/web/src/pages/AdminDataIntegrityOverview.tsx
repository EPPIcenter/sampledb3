import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { adminApi } from '../lib/api/admin';
import type { IntegrityReport } from '../lib/api/admin';
import '../styles/admin.css'

export default function AdminDataIntegrityOverview() {
  const [report, setReport] = useState<IntegrityReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    adminApi
      .getIntegrityReport()
      .then((res) => {
        if (!cancelled) setReport(res.data)
      })
      .catch((err) => {
        if (!cancelled) {
          const message =
            err && typeof err === 'object' && 'response' in err
              ? (err as { response?: { data?: { error?: string } } }).response?.data?.error
              : null
          setError(message || 'Failed to load integrity report')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const emptyCount = report?.emptyCollections.length ?? 0
  const integrityIssueCount = report
    ? report.collectionsWithMissingLocation.length +
      report.containersWithMissingSpecimen.length +
      report.subtypeOrphans.length +
      report.sheetsWithMissingBoxOrBag.length +
      report.specimensWithMissingSubjectOrBatch.length +
      report.studySubjectsWithMissingStudy.length +
      report.derivationBrokenRefs.length +
      report.storageContainerTagOrphans.length +
      report.duplicateBarcodes.length +
      report.locationPathInconsistencies.length
    : 0

  if (loading) {
    return (
      <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">
        Loading…
      </div>
    )
  }

  if (error) {
    return (
      <div className="mb-4 rounded-lg bg-app-trend-down/10 border border-app-trend-down p-3">
        <p className="text-sm text-app-trend-down">{error}</p>
      </div>
    )
  }

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
