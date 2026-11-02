import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createSpecimensRoutes } from '../specimens'
import { createStatisticsRoutes } from '../statistics'
import { createStudiesRoutes } from '../studies'
import { createTestSpecimen, createTestSpecimenType, createTestStudy, createTestStudySubject } from '../../__tests__/helpers/factories'
import { buildSpecimenCollectionSummary, type EnrichedSpecimenSummary } from '../../lib/container-enrichment'
import { computeSpecimenAggregates } from '../../lib/statistics/specimen-aggregates'

// Migration 008 leaves a collection date it cannot read as it was (`13/2/2024`, `Apr 2025`).
// Compared as text, `13/2/2024` sorts before every YYYY-MM-DD date and `Apr 2025` after, so
// each would pass or fail a date bound by accident. Date filters, ranges and sorts read only
// real YYYY-MM-DD dates; the integrity report lists the rest.
describe('collection dates migration 008 left as they were', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: { email: 'admin@test.com', name: 'Admin', password: 'password123', role: 'admin' },
      settings: { pagination: true },
      mount: (app, { db, sqlite }) => {
        app.route('/api/specimens', createSpecimensRoutes(db))
        app.route('/api/statistics', createStatisticsRoutes(db))
        app.route('/api/studies', createStudiesRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  /** A study with Specimens collected on `dates`, in that order. */
  async function seedStudy(dates: Array<string | undefined>) {
    const studyRecord = await createTestStudy(ctx.db, { title: 'Legacy dates', shortCode: 'LEG' })
    const subject = await createTestStudySubject(ctx.db, { studyId: studyRecord.id, name: 'S1' })
    const type = await createTestSpecimenType(ctx.db, { name: 'DBS' })
    const specimens = []
    for (const collectionDate of dates) {
      specimens.push(await createTestSpecimen(ctx.db, type.id, { studySubjectId: subject.id, collectionDate }))
    }
    return { studyRecord, type, specimens }
  }

  it('the specimen list matches no date bound on a leftover value', async () => {
    const { specimens } = await seedStudy(['1999-12-31', '2024-05-07', '13/2/2024', 'Apr 2025'])

    const to = await ctx.request('/api/specimens?collection_date_to=2000-01-01')
    const from = await ctx.request('/api/specimens?collection_date_from=2000-01-01')

    expect(((await to.json()) as { specimens: Array<{ id: number }> }).specimens.map((s) => s.id)).toEqual([specimens[0]!.id])
    expect(((await from.json()) as { specimens: Array<{ id: number }> }).specimens.map((s) => s.id)).toEqual([specimens[1]!.id])
  })

  it('the specimen list sorts a leftover value after every real date and before a missing one, in either direction', async () => {
    const { type, specimens } = await seedStudy(['Apr 2025', undefined, '2024-05-07', '13/2/2024', '1999-12-31'])
    const [april, none, may, legacy, early] = specimens.map((s) => s!.id)

    const ids = async (order: string) => {
      const res = await ctx.request(`/api/specimens?specimen_type_id=${type.id}&sort=collection_date&order=${order}`)
      return ((await res.json()) as { specimens: Array<{ id: number }> }).specimens.map((s) => s.id)
    }

    expect(await ids('asc')).toEqual([early, may, legacy, april, none])
    expect(await ids('desc')).toEqual([may, early, april, legacy, none])
  })

  it('statistics and Container selection match no date bound on a leftover value', async () => {
    await seedStudy(['1999-12-31', '13/2/2024', 'Apr 2025'])

    const to = await ctx.request('/api/statistics?collection_date_to=2000-01-01')
    const from = await ctx.request('/api/statistics?collection_date_from=2000-01-01')

    expect(((await to.json()) as { specimens: { total: number } }).specimens.total).toBe(1)
    expect(((await from.json()) as { specimens: { total: number } }).specimens.total).toBe(0)
  })

  it('a study summary, the study summaries and the study timeline take their date range from real dates only', async () => {
    const { studyRecord } = await seedStudy(['2023-01-10', '13/2/2024', '2022-09-07', 'Apr 2025'])
    const range = { earliest: '2022-09-07', latest: '2023-01-10' }

    const summary = (await (await ctx.request(`/api/studies/${studyRecord.id}/summary`)).json()) as {
      summary: { collectionDateRange: unknown; studyDurationDays: number; collectionTimeline: Array<{ date: string }> }
    }
    const summaries = (await (await ctx.request(`/api/studies/summaries?ids=${studyRecord.id}`)).json()) as {
      summaries: Array<{ collectionDateRange: unknown }>
    }
    const timeline = (await (await ctx.request(`/api/studies/${studyRecord.id}/timeline`)).json()) as { dateRange: unknown }

    expect(summary.summary.collectionDateRange).toEqual(range)
    expect(summary.summary.studyDurationDays).toBe(125)
    expect(summary.summary.collectionTimeline.map((t) => t.date)).toEqual(['2022-09-07', '2023-01-10'])
    expect(summaries.summaries[0]!.collectionDateRange).toEqual(range)
    expect(timeline.dateRange).toEqual(range)
  })

  it('the monthly collection timeline counts real dates only', async () => {
    const { specimens } = await seedStudy(['2024-02-01', '5/7/24', '13/2/2024'])

    const result = await computeSpecimenAggregates(ctx.db, specimens, {})

    expect(result.collectionTimeline).toEqual([{ date: '2024-02', count: 1 }])
  })

  it('a subject or control batch summary takes its date range from real dates, and places a leftover by its created time', () => {
    const specimen = (id: number, collectionDate: string | null, created: string): EnrichedSpecimenSummary => ({
      id,
      specimenTypeId: 1,
      specimenTypeName: 'Blood',
      collectionDate,
      created,
      lastUpdated: created,
      containerCount: 0,
      containerBreakdown: {},
      unitBreakdown: {},
      containers: [],
    })

    const summary = buildSpecimenCollectionSummary(
      [
        specimen(1, '2024-01-15', '2024-03-01 00:00:00'),
        specimen(2, '13/2/2024', '2024-01-01 00:00:00'),
        specimen(3, '1/1/20', '2024-02-01 00:00:00'),
      ],
      [],
      new Map(),
    )

    expect(summary.collectionDateRange).toEqual({ earliest: '2024-01-15', latest: '2024-01-15' })
    expect(summary.timeline.map((entry) => entry.id)).toEqual([2, 1, 3])
  })
})
