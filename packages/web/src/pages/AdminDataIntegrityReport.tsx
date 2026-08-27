import { Link } from 'react-router-dom'
import type { EmptyCollectionItem } from '../lib/api/admin'
import { useAdminIntegrityReport } from '../hooks/useAdmin'
import { PageError, fromQuery, getQueryErrorMessage } from '../ui'
import '../styles/admin.css'

function typeLabel(type: EmptyCollectionItem['type']): string {
  switch (type) {
    case 'micronix_plate':
      return 'Micronix plate'
    case 'cryovial_box':
      return 'Cryovial box'
    case 'box':
      return 'Box'
    case 'bag':
      return 'Bag'
    default:
      return type
  }
}

function getCollectionDetailUrl(type: EmptyCollectionItem['type'], id: number): string {
  switch (type) {
    case 'micronix_plate':
      return `/collections/micronix-plates/${id}`
    case 'cryovial_box':
      return `/collections/cryovial-boxes/${id}`
    case 'box':
      return `/collections/boxes/${id}`
    case 'bag':
      return `/collections/bags/${id}`
    default:
      return '#'
  }
}

function IntegritySection({
  title,
  count,
  description,
  children,
}: {
  title: string
  count: number
  description: string
  children: React.ReactNode
}) {
  if (count === 0) return null
  return (
    <section className="admin-card p-4 mb-6">
      <details className="group" open={false}>
        <summary className="cursor-pointer list-none flex items-center justify-between gap-2 py-1">
          <div>
            <h2 className="text-xl font-semibold inline" style={{ color: 'rgb(var(--app-text))' }}>
              {title}
            </h2>
            <span className="ml-2 text-sm font-normal text-[rgb(var(--app-text-muted))]">({count})</span>
          </div>
          <span className="text-[rgb(var(--app-text-muted))] group-open:rotate-180 transition-transform" aria-hidden>
            ▼
          </span>
        </summary>
        <p className="text-sm text-[rgb(var(--app-text-muted))] mt-2 mb-4">{description}</p>
        <div className="mt-2">{children}</div>
      </details>
    </section>
  )
}

export default function AdminDataIntegrityReport() {
  const reportQuery = useAdminIntegrityReport()
  const reportStatus = fromQuery(reportQuery)
  const report = reportQuery.data ?? null

  if (reportStatus === 'loading') {
    return <div className="p-8 text-center text-[rgb(var(--app-text-muted))]">Loading…</div>
  }

  if (reportStatus === 'error') {
    return (
      <PageError
        title="Could not load integrity report"
        message={getQueryErrorMessage(reportQuery.error, 'Failed to load integrity report')}
        onRetry={() => void reportQuery.refetch()}
      />
    )
  }

  if (!report) return null

  return (
    <div className="space-y-0">
      <p className="text-sm text-[rgb(var(--app-text-muted))] mb-6">
        Read-only checks. Fix issues via normal app flows or database corrections.
      </p>

      <IntegritySection
        title="Collections with missing location"
        count={report.collectionsWithMissingLocation.length}
        description="Plates, boxes, or bags whose location no longer exists."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Missing location ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.collectionsWithMissingLocation.map((c) => (
                <tr key={`${c.type}-${c.id}`} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">{typeLabel(c.type)}</td>
                  <td className="px-4 py-3 text-sm font-medium">
                    <Link to={getCollectionDetailUrl(c.type, c.id)} className="text-[rgb(var(--app-accent))] hover:underline">
                      {c.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.locationId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Containers with missing specimen"
        count={report.containersWithMissingSpecimen.length}
        description="Storage containers that reference a deleted specimen."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Container ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Missing specimen ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.containersWithMissingSpecimen.map((c) => (
                <tr key={c.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/containers/${c.id}`} className="text-[rgb(var(--app-accent))] hover:underline">
                      {c.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{c.specimenId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Subtype orphans"
        count={report.subtypeOrphans.length}
        description="Storage container rows with no micronix_tube, cryovial_tube, paper, or static_well row."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Container ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.subtypeOrphans.map((c) => (
                <tr key={c.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/containers/${c.id}`} className="text-[rgb(var(--app-accent))] hover:underline">
                      {c.id}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Sheets with missing box or bag"
        count={report.sheetsWithMissingBoxOrBag.length}
        description="Sheets that reference a deleted box or bag."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Box ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Bag ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.sheetsWithMissingBoxOrBag.map((s) => (
                <tr key={s.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">{s.id}</td>
                  <td className="px-4 py-3 text-sm font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-sm">{s.boxId ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{s.bagId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Specimens with missing subject or batch"
        count={report.specimensWithMissingSubjectOrBatch.length}
        description="Specimens that reference a deleted study subject or control batch."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Specimen ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Study subject ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Control batch ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.specimensWithMissingSubjectOrBatch.map((s) => (
                <tr key={s.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/specimens/${s.id}`} className="text-[rgb(var(--app-accent))] hover:underline">
                      {s.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{s.studySubjectId ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{s.controlBatchId ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Study subjects with missing study"
        count={report.studySubjectsWithMissingStudy.length}
        description="Study subjects that reference a deleted study."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Subject ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Missing study ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.studySubjectsWithMissingStudy.map((s) => (
                <tr key={s.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">{s.id}</td>
                  <td className="px-4 py-3 text-sm font-medium">{s.name}</td>
                  <td className="px-4 py-3 text-sm">{s.studyId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Derivation broken references"
        count={report.derivationBrokenRefs.length}
        description="Container derivation rows with missing parent or child container."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Derivation ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Parent container ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Child container ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.derivationBrokenRefs.map((d) => (
                <tr key={d.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">{d.id}</td>
                  <td className="px-4 py-3 text-sm">{d.parentContainerId}</td>
                  <td className="px-4 py-3 text-sm">{d.childContainerId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Storage container tag orphans"
        count={report.storageContainerTagOrphans.length}
        description="Tag links that reference a deleted container or tag."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Container ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Tag ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.storageContainerTagOrphans.map((t, i) => (
                <tr key={`${t.storageContainerId}-${t.tagId}-${i}`} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">{t.storageContainerId}</td>
                  <td className="px-4 py-3 text-sm">{t.tagId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Duplicate barcodes (micronix)"
        count={report.duplicateBarcodes.length}
        description="Micronix tubes that share the same barcode (schema expects unique barcodes)."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Barcode</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Container IDs</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.duplicateBarcodes.map((d, i) => (
                <tr key={`${d.barcode}-${i}`} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm font-medium">{d.barcode}</td>
                  <td className="px-4 py-3 text-sm">{d.containerType}</td>
                  <td className="px-4 py-3 text-sm">
                    {d.ids.map((id) => (
                      <Link key={id} to={`/containers/${id}`} className="text-[rgb(var(--app-accent))] hover:underline mr-2">
                        {id}
                      </Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Location path inconsistencies"
        count={report.locationPathInconsistencies.length}
        description="Locations whose stored path does not match the path computed from the parent chain."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Location ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Stored path</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Expected path</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.locationPathInconsistencies.map((loc) => (
                <tr key={loc.id} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/locations/${loc.id}`} className="text-[rgb(var(--app-accent))] hover:underline">
                      {loc.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium">{loc.name}</td>
                  <td className="px-4 py-3 text-sm">{loc.storedPath ?? '—'}</td>
                  <td className="px-4 py-3 text-sm">{loc.expectedPath}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>

      <IntegritySection
        title="Containers with no grid position"
        count={report.containersWithNoGridPosition.length}
        description="Tubes or wells in a collection with no well or slot assigned. Legacy rows are allowed; they do not occupy a grid position. Assign a position via edit or scan move when you know the well."
      >
        <div className="overflow-x-auto">
          <table className="admin-table min-w-full">
            <thead>
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Container ID</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-app-text-muted uppercase tracking-wider">Collection ID</th>
              </tr>
            </thead>
            <tbody className="bg-app-card divide-y divide-app-border">
              {report.containersWithNoGridPosition.map((row) => (
                <tr key={`${row.containerType}-${row.id}`} className="hover:bg-app-surface">
                  <td className="px-4 py-3 text-sm">
                    <Link to={`/containers/${row.id}`} className="text-[rgb(var(--app-accent))] hover:underline">
                      {row.id}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm">{row.containerType}</td>
                  <td className="px-4 py-3 text-sm">{row.collectionId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </IntegritySection>
    </div>
  )
}
