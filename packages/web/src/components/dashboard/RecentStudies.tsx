import { Link } from 'react-router-dom'
import { Study, StudySummaryBasic } from '../../lib/api'
import SkeletonList from '../SkeletonList'

interface RecentStudiesProps {
  studies: Array<Study & { summary?: StudySummaryBasic | null }>
  loading?: boolean
}

export default function RecentStudies({ studies, loading }: RecentStudiesProps) {
  if (loading) {
    return (
      <section className="dashboard-card p-6" aria-labelledby="recent-studies-title">
        <h2 id="recent-studies-title" className="dashboard-section-title mb-4">Recent Studies</h2>
        <SkeletonList count={5} itemHeight="h-20" />
      </section>
    )
  }

  if (studies.length === 0) {
    return (
      <section className="dashboard-card p-6" aria-labelledby="recent-studies-title">
        <h2 id="recent-studies-title" className="dashboard-section-title mb-4">Recent Studies</h2>
        <div className="text-center py-8 text-[rgb(var(--dashboard-text-muted))]">No studies found</div>
      </section>
    )
  }

  return (
    <section className="dashboard-card p-6" aria-labelledby="recent-studies-title">
      <h2 id="recent-studies-title" className="dashboard-section-title mb-4">Recent Studies</h2>
      <div className="space-y-3">
        {studies.slice(0, 10).map((study) => (
          <Link
            key={study.id}
            to={`/studies/${study.id}`}
            className="block p-4 border border-[rgb(var(--dashboard-border))] rounded-lg hover:border-[rgb(var(--dashboard-accent)/0.4)] hover:bg-[rgb(var(--dashboard-surface))] transition-all duration-200"
            aria-label={`View study ${study.title}`}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-medium text-[rgb(var(--dashboard-text))] truncate">{study.title}</h3>
                  <span className="text-sm text-[rgb(var(--dashboard-text-muted))] font-mono flex-shrink-0">
                    ({study.shortCode})
                  </span>
                </div>
                {study.summary && (
                  <div className="flex items-center gap-4 mt-2 text-sm text-[rgb(var(--dashboard-text-muted))]">
                    <span>
                      <span className="font-medium text-[rgb(var(--dashboard-text))]">{study.summary.totalSubjects}</span> subjects
                    </span>
                    <span>
                      <span className="font-medium text-[rgb(var(--dashboard-text))]">{study.summary.totalSpecimens}</span> specimens
                    </span>
                    <span>
                      <span className="font-medium text-[rgb(var(--dashboard-text))]">{study.summary.totalContainers}</span> containers
                    </span>
                  </div>
                )}
              </div>
              <div className="ml-4 text-right flex-shrink-0">
                <span className="text-xs text-[rgb(var(--dashboard-text-muted))]">
                  {new Date(study.lastUpdated).toLocaleDateString()}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
      <div className="mt-4 pt-4 border-t border-[rgb(var(--dashboard-border))]">
        <Link to="/studies" className="dashboard-link text-sm" aria-label="View all studies">
          View All Studies →
        </Link>
      </div>
    </section>
  )
}

