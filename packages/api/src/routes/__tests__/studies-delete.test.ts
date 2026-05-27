import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { authenticatedRequest } from '../../__tests__/helpers/test-client'
import {
  setupAuthenticatedRouteTest,
  type AuthenticatedRouteTestContext,
} from '../../__tests__/helpers/authenticated-route-test'
import { createStudiesRoutes } from '../studies'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestUnit,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'
import { eq } from 'drizzle-orm'
import { study, studySubject, specimen, storageContainer, specimenTypeContainerType } from '../../db/schema'

describe('Studies DELETE (cascade)', () => {
  let ctx: AuthenticatedRouteTestContext

  beforeEach(async () => {
    ctx = await setupAuthenticatedRouteTest({
      user: {
        email: 'admin@test.com',
        name: 'Admin',
        password: 'password123',
        role: 'admin',
      },
      additionalUsers: [
        {
          key: 'member',
          email: 'member@test.com',
          name: 'Member',
          password: 'password123',
          role: 'member',
        },
      ],
      mount: (app, { db, sqlite }) => {
        app.route('/api/studies', createStudiesRoutes(db, sqlite))
      },
    })
  })

  afterEach(() => {
    ctx.cleanup()
  })

  it('returns 200 and removes study when study has no subjects', async () => {
    const testStudy = await createTestStudy(ctx.db, {
      title: 'Empty Study',
      shortCode: 'EMPTY01',
    })

    const res = await ctx.request(`/api/studies/${testStudy.id}`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await ctx.db.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 200 and cascades delete when study has subjects, specimens, and containers', async () => {
    const testSpecimenType = await createTestSpecimenType(ctx.db, { name: 'Whole Blood' })
    await ctx.db.insert(specimenTypeContainerType).values({
      specimenTypeId: testSpecimenType.id,
      containerType: 'cryovial_tube',
    })

    const testStudy = await createTestStudy(ctx.db, {
      title: 'Study With Data',
      shortCode: 'DATA01',
    })
    const testSubject = await createTestStudySubject(ctx.db, {
      studyId: testStudy.id,
      name: 'Subject A',
    })
    const testSpecimen = await createTestSpecimen(ctx.db, testSpecimenType.id, {
      studySubjectId: testSubject.id,
    })
    const testUnit = await createTestUnit(ctx.db, {
      symbol: 'uL',
      name: 'microliter',
      category: 'volume',
    })
    const testContainer = await createTestStorageContainer(ctx.db, {
      specimenId: testSpecimen.id,
      unitId: testUnit.id,
    })

    const res = await ctx.request(`/api/studies/${testStudy.id}`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(200)

    const remainingStudy = await ctx.db.select().from(study).where(eq(study.id, testStudy.id))
    expect(remainingStudy.length).toBe(0)

    const remainingSubjects = await ctx.db.select().from(studySubject).where(eq(studySubject.studyId, testStudy.id))
    expect(remainingSubjects.length).toBe(0)

    const remainingSpecimens = await ctx.db.select().from(specimen).where(eq(specimen.studySubjectId, testSubject.id))
    expect(remainingSpecimens.length).toBe(0)

    const remainingContainers = await ctx.db.select().from(storageContainer).where(eq(storageContainer.id, testContainer.id))
    expect(remainingContainers.length).toBe(0)
  })

  it('returns 404 when study does not exist', async () => {
    const res = await ctx.request('/api/studies/99999', {
      method: 'DELETE',
    })

    expect(res.status).toBe(404)
    const data = (await res.json()) as { error?: string }
    expect(data.error).toContain('not found')
  })

  it('returns 401 when not authenticated', async () => {
    const testStudy = await createTestStudy(ctx.db, {
      title: 'Some Study',
      shortCode: 'SOME01',
    })

    const res = await authenticatedRequest(ctx.createRequestApp(), `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated as member (non-admin) deleting non-tutorial study', async () => {
    const testStudy = await createTestStudy(ctx.db, {
      title: 'Member Study',
      shortCode: 'MEMB01',
    })

    const res = await ctx.request(`/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: ctx.cookies.member,
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error?: string }
    expect(data.error).toBe('Only administrators can delete non-tutorial studies.')

    const remaining = await ctx.db.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(1)
  })

  it('returns 200 when member deletes tutorial study (TUT01)', async () => {
    const testStudy = await createTestStudy(ctx.db, {
      title: 'Tutorial Study',
      shortCode: 'TUT01',
    })

    const res = await ctx.request(`/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: ctx.cookies.member,
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await ctx.db.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 200 when member deletes tutorial-namespace study (TUT-123)', async () => {
    const testStudy = await createTestStudy(ctx.db, {
      title: 'Per-user tutorial study',
      shortCode: 'TUT-123',
    })

    const res = await ctx.request(`/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: ctx.cookies.member,
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await ctx.db.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 400 when study ID is invalid', async () => {
    const res = await ctx.request('/api/studies/not-a-number', {
      method: 'DELETE',
    })

    expect(res.status).toBe(400)
  })
})
