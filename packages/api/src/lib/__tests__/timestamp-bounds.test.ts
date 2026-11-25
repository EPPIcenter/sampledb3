import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { and, asc, eq } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { errorLogs, study, users } from '../../db/schema'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createTestSpecimen, createTestSpecimenType, createTestStudy } from '../../__tests__/helpers/factories'
import { createTestUser } from '../../__tests__/helpers/auth-helpers'
import { timestampFilter } from '../date-filters'
import { buildSpecimenCollectionSummary, type EnrichedSpecimenSummary } from '../container-enrichment'
import { cleanupOldErrorLogs } from '../error-logger'
import { dateRangeConditions } from '../sql-helpers'
import { getAdminStatistics } from '../statistics/admin-stats'
import { computeSpecimenAggregates } from '../statistics/specimen-aggregates'

// Issue #127: every bound on a stored timestamp (`YYYY-MM-DD HH:MM:SS`, UTC) is written in that
// format. Each test runs with a non-UTC process time zone so local-time mistakes show.
describe('timestamp bounds against stored timestamps', () => {
  const originalTz = process.env.TZ
  let db: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']

  beforeAll(() => {
    process.env.TZ = 'America/Los_Angeles'
  })
  afterAll(() => {
    if (originalTz === undefined) delete process.env.TZ
    else process.env.TZ = originalTz
  })
  beforeEach(async () => {
    const setup = await setupTestDatabase()
    db = setup.db
    sqlite = setup.sqlite
  })
  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  describe('admin statistics recent logins', () => {
    const now = new Date('2024-03-15T12:00:00Z') // cutoff 2024-03-08 12:00:00, across the DST change

    async function userWithLastLogin(email: string, lastLogin: string | null) {
      const user = await createTestUser(db, { email, name: email, role: 'member' })
      await db.update(users).set({ lastLogin }).where(eq(users.id, user.id))
    }

    it('counts logins at or after the cutoff, including later on the cutoff day', async () => {
      await userWithLastLogin('before@test.com', '2024-03-08 11:59:59')
      await userWithLastLogin('at@test.com', '2024-03-08 12:00:00')
      await userWithLastLogin('later-same-day@test.com', '2024-03-08 18:00:00')
      await userWithLastLogin('recent@test.com', '2024-03-15 11:00:00')
      await userWithLastLogin('never@test.com', null)

      const data = await getAdminStatistics(db, now)

      expect(data.users.recentLogins).toBe(3)
    })
  })

  describe('error-log retention', () => {
    const now = new Date('2024-03-15T12:00:00Z') // 90 days back: 2023-12-16 12:00:00

    it('deletes exactly the rows older than the cutoff', async () => {
      const stamps = [
        '2023-12-15 23:59:59',
        '2023-12-16 11:59:59',
        '2023-12-16 12:00:00',
        '2023-12-16 18:00:00',
        '2024-03-15 11:00:00',
      ]
      for (const timestamp of stamps) {
        await db.insert(errorLogs).values({ timestamp, source: 'backend', level: 'error', message: timestamp })
      }

      const result = await cleanupOldErrorLogs(db, 90, now)

      expect(result).toEqual({ deleted: 2, retentionDays: 90 })
      const remaining = await db.select({ timestamp: errorLogs.timestamp }).from(errorLogs).orderBy(asc(errorLogs.timestamp))
      expect(remaining.map((r) => r.timestamp)).toEqual(['2023-12-16 12:00:00', '2023-12-16 18:00:00', '2024-03-15 11:00:00'])
    })
  })

  describe('monthly created timeline', () => {
    it('buckets by UTC month', async () => {
      const type = await createTestSpecimenType(db, { name: 'Blood' })
      // Each February row is still January 31 in Los Angeles; the UTC month is February.
      const endOfJanuary = await createTestSpecimen(db, type.id, { created: '2024-01-31 23:59:59' })
      const startOfFebruary = await createTestSpecimen(db, type.id, { created: '2024-02-01 00:00:00' })
      const zonedFebruary = await createTestSpecimen(db, type.id, { created: '2024-02-01T03:00:00Z' })

      const result = await computeSpecimenAggregates(db, [endOfJanuary, startOfFebruary, zonedFebruary], {})

      expect(result.creationTimeline).toEqual([
        { date: '2024-01', count: 1 },
        { date: '2024-02', count: 2 },
      ])
    })

    it('buckets a collection date by its own month', async () => {
      const type = await createTestSpecimenType(db, { name: 'Blood' })
      const first = await createTestSpecimen(db, type.id, { collectionDate: '2024-02-01' })
      const last = await createTestSpecimen(db, type.id, { collectionDate: '2024-01-31' })

      const result = await computeSpecimenAggregates(db, [first, last], {})

      expect(result.collectionTimeline).toEqual([
        { date: '2024-01', count: 1 },
        { date: '2024-02', count: 1 },
      ])
    })

    it('buckets a collection date written M/D/YYYY by its own month east of UTC (#107)', async () => {
      process.env.TZ = 'Pacific/Auckland'
      try {
        const type = await createTestSpecimenType(db, { name: 'Blood' })
        const legacy = await createTestSpecimen(db, type.id, { collectionDate: '5/1/2024' })

        const result = await computeSpecimenAggregates(db, [legacy], {})

        expect(result.collectionTimeline).toEqual([{ date: '2024-05', count: 1 }])
      } finally {
        process.env.TZ = 'America/Los_Angeles'
      }
    })
  })

  describe('created_from / created_to filters', () => {
    async function seedStudies(createdValues: string[]) {
      for (const [i, created] of createdValues.entries()) {
        await createTestStudy(db, { title: created, shortCode: `S${i}`, created })
      }
    }

    async function titlesWithin(from: string | undefined, to: string | undefined) {
      const rows = await db
        .select({ title: study.title })
        .from(study)
        .where(and(...dateRangeConditions(study.created, timestampFilter('created_from', from), timestampFilter('created_to', to))))
        .orderBy(asc(study.created))
      return rows.map((r) => r.title)
    }

    it('includes the whole created_to day and excludes the next', async () => {
      await seedStudies(['2024-01-15 23:59:59', '2024-01-16 00:00:00'])
      expect(await titlesWithin(undefined, '2024-01-15')).toEqual(['2024-01-15 23:59:59'])
    })

    it('includes the start of the created_from day and excludes the day before', async () => {
      await seedStudies(['2024-01-14 23:59:59', '2024-01-15 00:00:00'])
      expect(await titlesWithin('2024-01-15', undefined)).toEqual(['2024-01-15 00:00:00'])
    })

    it('compares a bound with a T separator or no seconds as the stored instant', async () => {
      await seedStudies(['2024-01-15 09:59:59', '2024-01-15 10:00:00', '2024-01-15 10:00:01'])
      expect(await titlesWithin('2024-01-15T10:00', '2024-01-15T10:00')).toEqual(['2024-01-15 10:00:00'])
      expect(await titlesWithin('2024-01-15T10:00:00', '2024-01-15 10:00:00')).toEqual(['2024-01-15 10:00:00'])
    })
  })

  describe('specimen timeline order', () => {
    function summarySpecimen(id: number, collectionDate: string | null, created: string): EnrichedSpecimenSummary {
      return {
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
      }
    }

    it('orders a created timestamp and a collection date by their UTC instants', () => {
      // Read as local time, 2024-01-14 20:00:00 would land after 2024-01-15 00:00 UTC.
      const summary = buildSpecimenCollectionSummary(
        [summarySpecimen(1, '2024-01-15', '2024-01-20 00:00:00'), summarySpecimen(2, null, '2024-01-14 20:00:00')],
        [],
        new Map(),
      )

      expect(summary.timeline.map((entry) => entry.id)).toEqual([2, 1])
    })
  })
})
