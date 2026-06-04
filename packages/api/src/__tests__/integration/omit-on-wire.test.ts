import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../helpers/authenticated-route-test'
import { createStudiesRoutes } from '../../routes/studies'
import { createSettingsRoutes } from '../../routes/settings'
import { createSpecimensRoutes } from '../../routes/specimens'
import { study } from '../../db/schema'
import { utcNow } from '../../lib/datetime'
import { createTestSpecimenType, createTestStudy, createTestStudySubject, createTestSpecimen } from '../helpers/factories'

describe('omit-on-wire middleware (integration)', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      settings: { pagination: true },
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      mount: (app, { db, sqlite }) => {
        app.route('/api/studies', createStudiesRoutes(db, sqlite))
        app.route('/api/settings', createSettingsRoutes(db))
        app.route('/api/specimens', createSpecimensRoutes(db))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('omits null optional fields on study detail responses', async () => {
    const now = utcNow()
    const [studyRecord] = await ctx.db
      .insert(study)
      .values({
        title: 'Omit Study',
        shortCode: 'OMIT1',
        description: null,
        isLongitudinal: false,
        leadPerson: 'Lead',
        created: now,
        lastUpdated: now,
      })
      .returning()

    const res = await ctx.request(`/api/studies/${studyRecord!.id}`)
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(raw).not.toContain('"description":null')
    const data = JSON.parse(raw) as { study: Record<string, unknown> }
    expect(data.study).not.toHaveProperty('description')
  })

  it('omits null optional fields on settings value responses', async () => {
    const res = await ctx.request('/api/settings/pagination_settings')
    expect(res.status).toBe(200)
    const data = (await res.json()) as { key: string; value: Record<string, unknown> }
    expect(data.key).toBe('pagination_settings')
    expect(data.value).toBeDefined()
    expect(JSON.stringify(data)).not.toMatch(/:\s*null/)
  })

  it('omits null optional fields on specimen list responses', async () => {
    const studyRecord = await createTestStudy(ctx.db, { title: 'Omit Study 2', shortCode: 'OMIT2' })
    const subject = await createTestStudySubject(ctx.db, { studyId: studyRecord.id, name: 'Subj-1' })
    const st = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
    await createTestSpecimen(ctx.db, st.id, { studySubjectId: subject.id })

    const res = await ctx.request('/api/specimens')
    expect(res.status).toBe(200)
    const raw = await res.text()
    expect(raw).not.toContain('"collectionDate":null')
    expect(raw).not.toContain('"controlBatchId":null')
  })
})
