import type { Study, StudySummary } from '../lib/api'
import EntityBreadcrumbs from './EntityBreadcrumbs'

export interface StudyDetailHeaderProps {
  study: Study
  summaryLoading: boolean
  summaryData: StudySummary['summary'] | undefined
  canWrite: boolean
  canDelete: boolean
  actionsMenuOpen: boolean
  setActionsMenuOpen: (value: boolean | ((prev: boolean) => boolean)) => void
  actionsMenuRef: React.RefObject<HTMLDivElement | null>
  onEditStudy: () => void
  onMergeSubjects: () => void
  onCreateSubject: () => void
  onExport: () => void
  onBulkImport: () => void
  onDelete: () => void
}

export default function StudyDetailHeader({
  study,
  summaryLoading,
  summaryData,
  canWrite,
  canDelete,
  actionsMenuOpen,
  setActionsMenuOpen,
  actionsMenuRef,
  onEditStudy,
  onMergeSubjects,
  onCreateSubject,
  onExport,
  onBulkImport,
  onDelete,
}: StudyDetailHeaderProps) {
  return (
    <header className="study-detail-header">
      <EntityBreadcrumbs
        items={[
          { label: 'Studies', to: '/studies' },
          { label: study.title },
        ]}
      />
      <div className="study-detail-identity">
        <h1>{study.title}</h1>
        <div className="study-detail-badges">
          <span className="study-detail-badge" aria-label={`Short code: ${study.shortCode}`}>
            {study.shortCode}
          </span>
          {study.leadPerson && (
            <span className="study-detail-badge">Lead: {study.leadPerson}</span>
          )}
          {study.isLongitudinal && (
            <span className="study-detail-badge study-detail-badge--accent">Longitudinal</span>
          )}
        </div>
      </div>
      <div className="study-detail-desc">
        {study.description ? (
          <span>{study.description}</span>
        ) : (
          <span style={{ fontStyle: 'italic' }}>No description.</span>
        )}
      </div>
      <div className="study-detail-metrics" role="list" aria-label="Study metrics">
        <div className="study-detail-metric" role="listitem">
          <span className="study-detail-metric-label">Subjects</span>
          <span className="study-detail-metric-value" aria-label={`Subjects: ${summaryData?.totalSubjects ?? '—'}`}>
            {summaryLoading ? '—' : (summaryData?.totalSubjects ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="study-detail-metric" role="listitem">
          <span className="study-detail-metric-label">Specimens</span>
          <span className="study-detail-metric-value" aria-label={`Specimens: ${summaryData?.totalSpecimens ?? '—'}`}>
            {summaryLoading ? '—' : (summaryData?.totalSpecimens ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="study-detail-metric" role="listitem">
          <span className="study-detail-metric-label">Containers</span>
          <span className="study-detail-metric-value" aria-label={`Containers: ${summaryData?.totalContainers ?? '—'}`}>
            {summaryLoading ? '—' : (summaryData?.totalContainers ?? 0).toLocaleString()}
          </span>
        </div>
        <div className="study-detail-metric" role="listitem">
          <span className="study-detail-metric-label">Avg per subject</span>
          <span className="study-detail-metric-value" aria-label={`Average specimens per subject: ${summaryData?.averageSpecimensPerSubject ?? '—'}`}>
            {summaryLoading ? '—' : (summaryData?.averageSpecimensPerSubject ?? 0).toFixed(1)}
          </span>
        </div>
      </div>
      <div className="study-detail-actions" ref={actionsMenuRef}>
        {canWrite && (
          <button
            type="button"
            onClick={onCreateSubject}
            className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
            style={{ backgroundColor: 'rgb(var(--dashboard-accent))' }}
          >
            Create Subject
          </button>
        )}
        <button
          type="button"
          onClick={onExport}
          className="px-4 py-2 text-white rounded-lg font-medium transition-colors"
          style={{ backgroundColor: 'rgb(var(--dashboard-accent))' }}
        >
          Export Data
        </button>
        {canWrite && (
          <div className="relative">
            <button
              type="button"
              onClick={() => setActionsMenuOpen((o) => !o)}
              className="px-4 py-2 rounded-lg font-medium border transition-colors"
              style={{ borderColor: 'rgb(var(--dashboard-border))', color: 'rgb(var(--dashboard-text))' }}
              aria-expanded={actionsMenuOpen}
              aria-haspopup="true"
              aria-label="More actions"
            >
              More actions
            </button>
            {actionsMenuOpen && (
              <div
                className="absolute right-0 top-full mt-1 min-w-[10rem] rounded-lg border shadow-lg z-20 py-1"
                style={{ borderColor: 'rgb(var(--dashboard-border))', background: 'rgb(var(--dashboard-card))' }}
                role="menu"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded-none first:rounded-t-lg"
                  style={{ color: 'rgb(var(--dashboard-text))' }}
                  onClick={() => {
                    setActionsMenuOpen(false)
                    onEditStudy()
                  }}
                >
                  Edit study
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded-none"
                  style={{ color: 'rgb(var(--dashboard-text))' }}
                  onClick={() => {
                    setActionsMenuOpen(false)
                    onBulkImport()
                  }}
                >
                  Bulk import
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full text-left px-4 py-2 text-sm hover:bg-gray-100 rounded-none last:rounded-b-lg"
                  style={{ color: 'rgb(var(--dashboard-text))' }}
                  onClick={() => {
                    setActionsMenuOpen(false)
                    onMergeSubjects()
                  }}
                >
                  Merge subjects
                </button>
              </div>
            )}
          </div>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="px-4 py-2 border-2 border-red-600 text-red-600 rounded-lg hover:bg-red-50 font-medium"
          >
            Delete study
          </button>
        )}
      </div>
    </header>
  )
}
