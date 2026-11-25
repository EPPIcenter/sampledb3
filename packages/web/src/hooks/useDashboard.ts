import { useQueries, useQuery, type QueryClient, type UseQueryResult } from '@tanstack/react-query'
import { listTotal, type ListTotalParams, type PaginatedListBody } from '../lib/api/list-total'
import { trendWindows } from '../utils/trends'
import { studiesApi, type Study, type StudySummaryBasic } from '../lib/api/studies'
import { specimensApi } from '../lib/api/specimens'
import { subjectsApi } from '../lib/api/subjects'
import { containersApi } from '../lib/api/containers'
import { locationsApi } from '../lib/api/locations'
import { activityApi } from '../lib/api/search'
import { statisticsApi, type StatisticsData } from '../lib/api/statistics'
import { controlsApi } from '../lib/api/controls'
import { qpcrExperimentsApi, type QpcrExperiment } from '../lib/api/qpcr'
import { displayDateTime } from '../lib/date-utils'

/** A count the dashboard shows on a stat tile. */
export type DashboardMetric = 'studies' | 'specimens' | 'subjects' | 'containers' | 'locations'

/** Metrics whose tile shows a 30-day trend. */
export type DashboardTrendMetric = Extract<DashboardMetric, 'studies' | 'specimens' | 'subjects'>

export const DASHBOARD_METRICS: readonly DashboardMetric[] = [
  'studies',
  'specimens',
  'subjects',
  'containers',
  'locations',
]

/** Count of records created in each trend window. */
export type DashboardTrendCounts = { current: number; previous: number }

export type DashboardActivityItem = {
  id: number
  type: 'specimen' | 'study' | 'container' | 'subject' | 'control' | 'location'
  timestamp: string
  label?: string
  context?: string
}

export type DashboardSecondaryData = {
  statistics: StatisticsData | null
  studies: Study[]
  activity: DashboardActivityItem[]
  hasControls: boolean
}

export const dashboardKeys = {
  all: ['dashboard'] as const,
  counts: () => [...dashboardKeys.all, 'counts'] as const,
  count: (metric: DashboardMetric) => [...dashboardKeys.counts(), metric] as const,
  trends: () => [...dashboardKeys.all, 'trends'] as const,
  trend: (metric: DashboardTrendMetric) => [...dashboardKeys.trends(), metric] as const,
  secondary: () => [...dashboardKeys.all, 'secondary'] as const,
  qpcr: () => [...dashboardKeys.all, 'qpcr'] as const,
  summaries: (ids: number[]) =>
    [...dashboardKeys.all, 'summaries', [...ids].sort((a, b) => a - b)] as const,
}

/** Refetch dashboard widgets after creates/updates elsewhere in the app. */
export function invalidateDashboardQueries(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: dashboardKeys.all })
}

const fetchMetricPage: Record<DashboardMetric, (params: ListTotalParams) => Promise<PaginatedListBody>> = {
  studies: (p) => studiesApi.list(undefined, p),
  specimens: (p) => specimensApi.search(p),
  subjects: (p) => subjectsApi.list(p),
  containers: (p) => containersApi.list(p),
  locations: (p) => locationsApi.list(1, p.limit),
}

/** Total of one metric. A failed request rejects; it never reads as 0. */
export function fetchDashboardCount(metric: DashboardMetric): Promise<number> {
  return listTotal(fetchMetricPage[metric], metric)
}

/** Records of one metric created in the last 30 days and in the 30 days before. */
export async function fetchDashboardTrend(
  metric: DashboardTrendMetric,
  now: Date = new Date(),
): Promise<DashboardTrendCounts> {
  const windows = trendWindows(now)
  const [current, previous] = await Promise.all([
    listTotal(fetchMetricPage[metric], metric, windows.current),
    listTotal(fetchMetricPage[metric], metric, windows.previous),
  ])
  return { current, previous }
}

/** One query per stat tile, so each tile loads, fails, and retries on its own. */
export function useDashboardCounts(): Record<DashboardMetric, UseQueryResult<number>> {
  const results = useQueries({
    queries: DASHBOARD_METRICS.map((metric) => ({
      queryKey: dashboardKeys.count(metric),
      queryFn: () => fetchDashboardCount(metric),
    })),
  })
  return Object.fromEntries(DASHBOARD_METRICS.map((metric, i) => [metric, results[i]])) as Record<
    DashboardMetric,
    UseQueryResult<number>
  >
}

export function useDashboardTrend(metric: DashboardTrendMetric, enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.trend(metric),
    queryFn: () => fetchDashboardTrend(metric),
    enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useDashboardSecondary() {
  return useQuery({
    queryKey: dashboardKeys.secondary(),
    queryFn: async (): Promise<DashboardSecondaryData> => {
      const [statisticsRes, studiesListRes, activityRes, controlsRes] = await Promise.all([
        statisticsApi.get().catch(() => null as StatisticsData | null),
        studiesApi.list(undefined, { limit: 15 }).catch(() => ({ studies: [] as Study[] })),
        activityApi.recent(20).catch(() => ({ activity: [] as unknown[] })),
        controlsApi.list().catch(() => ({ controls: [] as unknown[] })),
      ])

      const activities = activityRes.activity as Array<{
        id: number
        type: string
        timestamp: string
        label?: string
        context?: string
      }>

      return {
        statistics: statisticsRes,
        studies: studiesListRes.studies,
        activity: activities.map((item) => ({
          id: item.id,
          type: item.type as DashboardActivityItem['type'],
          timestamp: item.timestamp,
          label: item.label,
          context: item.context,
        })),
        hasControls: controlsRes.controls.length > 0,
      }
    },
  })
}

export function useDashboardStudySummaries(studyIds: number[]) {
  return useQuery({
    queryKey: dashboardKeys.summaries(studyIds),
    queryFn: async () => {
      const res = await studiesApi.getSummaries(studyIds)
      return res.summaries
    },
    enabled: studyIds.length > 0,
    staleTime: 5 * 60 * 1000,
  })
}

export function useDashboardQpcr() {
  return useQuery({
    queryKey: dashboardKeys.qpcr(),
    queryFn: async (): Promise<QpcrExperiment[]> => {
      const res = await qpcrExperimentsApi.list({ limit: 5 })
      const all = res.experiments
      return [...all]
        .sort((a, b) => displayDateTime(b.lastUpdated) - displayDateTime(a.lastUpdated))
        .slice(0, 5)
    },
  })
}

export type StudyWithSummary = Study & { summary?: StudySummaryBasic | null }

export function mergeStudiesWithSummaries(
  studies: Study[],
  summaries: StudySummaryBasic[] | undefined,
): StudyWithSummary[] {
  if (!summaries?.length) {
    return studies.map((study) => ({ ...study, summary: null }))
  }
  const map = new Map(summaries.map((s) => [s.studyId, s]))
  return studies.map((study) => ({
    ...study,
    summary: map.get(study.id) ?? null,
  }))
}
