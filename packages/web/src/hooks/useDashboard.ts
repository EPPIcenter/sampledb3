import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api/client'
import { studiesApi, type Study, type StudySummaryBasic } from '../lib/api/studies'
import { activityApi } from '../lib/api/search'
import { statisticsApi, type StatisticsData } from '../lib/api/statistics'
import { controlsApi } from '../lib/api/controls'
import { qpcrExperimentsApi, type QpcrExperiment } from '../lib/api/qpcr'

export type DashboardStats = {
  studies: number
  specimens: number
  subjects: number
  containers: number
  locations: number
}

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
  critical: () => [...dashboardKeys.all, 'critical'] as const,
  trends: () => [...dashboardKeys.all, 'trends'] as const,
  secondary: () => [...dashboardKeys.all, 'secondary'] as const,
  qpcr: () => [...dashboardKeys.all, 'qpcr'] as const,
  summaries: (ids: number[]) =>
    [...dashboardKeys.all, 'summaries', [...ids].sort((a, b) => a - b)] as const,
}

async function fetchCount(
  path: string,
  arrayKey: string
): Promise<number> {
  const res = await api.get<Record<string, unknown>>(path, { params: { limit: 1 } })
  const pagination = res.pagination as { total?: number } | undefined
  if (pagination?.total != null) return pagination.total
  const arr = res[arrayKey]
  return Array.isArray(arr) ? arr.length : 0
}

async function fetchCountSafe(path: string, arrayKey: string): Promise<number> {
  try {
    return await fetchCount(path, arrayKey)
  } catch {
    return 0
  }
}

export function useDashboardCritical() {
  return useQuery({
    queryKey: dashboardKeys.critical(),
    queryFn: async (): Promise<{ stats: DashboardStats; fetchedAt: Date }> => {
      const [studies, specimens, subjects, containers, locations] = await Promise.all([
        fetchCount('/studies', 'studies'),
        fetchCount('/specimens', 'specimens'),
        fetchCountSafe('/subjects', 'subjects'),
        fetchCountSafe('/containers', 'containers'),
        fetchCountSafe('/locations', 'locations'),
      ])
      return {
        stats: { studies, specimens, subjects, containers, locations },
        fetchedAt: new Date(),
      }
    },
  })
}

async function fetchCountWithCreatedTo(
  path: string,
  arrayKey: string,
  createdTo: string
): Promise<number> {
  try {
    const res = await api.get<Record<string, unknown>>(path, {
      params: { limit: 1, created_to: createdTo },
    })
    const pagination = res.pagination as { total?: number } | undefined
    if (pagination?.total != null) return pagination.total
    const arr = res[arrayKey]
    return Array.isArray(arr) ? arr.length : 0
  } catch {
    return 0
  }
}

export function useDashboardTrendStats(enabled: boolean) {
  return useQuery({
    queryKey: dashboardKeys.trends(),
    queryFn: async (): Promise<DashboardStats> => {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      const createdTo = thirtyDaysAgo.toISOString().split('T')[0]

      const [studies, specimens, subjects] = await Promise.all([
        fetchCountWithCreatedTo('/studies', 'studies', createdTo),
        fetchCountWithCreatedTo('/specimens', 'specimens', createdTo),
        fetchCountWithCreatedTo('/subjects', 'subjects', createdTo),
      ])

      return {
        studies,
        specimens,
        subjects,
        containers: 0,
        locations: 0,
      }
    },
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

      const activities = (activityRes.activity ?? []) as Array<{
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
        hasControls: (controlsRes.controls?.length ?? 0) > 0,
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
        .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
        .slice(0, 5)
    },
  })
}

export type StudyWithSummary = Study & { summary?: StudySummaryBasic | null }

export function mergeStudiesWithSummaries(
  studies: Study[],
  summaries: StudySummaryBasic[] | undefined
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
