import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { createTestClient, loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import { createAuthRoutes } from '../auth'
import { createStudiesRoutes } from '../studies'
import { handleRouteError } from '../../lib/error-handler'
import { setupPasswordRequirements, setupSessionSettings, createTestUser } from '../../__tests__/helpers/auth-helpers'
import {
  createTestStudy,
  createTestStudySubject,
  createTestSpecimen,
  createTestSpecimenType,
  createTestUnit,
  createTestStorageContainer,
} from '../../__tests__/helpers/factories'
import type { Database } from '../../db/client'
import { eq } from 'drizzle-orm'
import { study, studySubject, specimen, storageContainer } from '../../db/schema'
import { specimenTypeContainerType } from '../../db/schema'

describe('Studies DELETE (cascade)', () => {
  let app: Hono
  let testDb: Database
  let sqlite: Awaited<ReturnType<typeof setupTestDatabase>>['sqlite']
  let adminCookie: string
  let memberCookie: string

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)

    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin',
      password: 'password123',
      role: 'admin',
    })
    await createTestUser(testDb, {
      email: 'member@test.com',
      name: 'Member',
      password: 'password123',
      role: 'member',
    })

    app = new Hono()
    app.use('*', (c, next) => {
      c.set('db', testDb)
      return next()
    })
    app.onError((err, c) => handleRouteError(err, c))
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/studies', createStudiesRoutes(testDb, sqlite))

    adminCookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')
    memberCookie = await loginAndGetCookie(app, 'member@test.com', 'password123')
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('returns 200 and removes study when study has no subjects', async () => {
    const testStudy = await createTestStudy(testDb, {
      title: 'Empty Study',
      shortCode: 'EMPTY01',
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: adminCookie,
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await testDb.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 200 and cascades delete when study has subjects, specimens, and containers', async () => {
    const testSpecimenType = await createTestSpecimenType(testDb, { name: 'Whole Blood' })
    await testDb.insert(specimenTypeContainerType).values({
      specimenTypeId: testSpecimenType.id,
      containerType: 'cryovial_tube',
    })

    const testStudy = await createTestStudy(testDb, {
      title: 'Study With Data',
      shortCode: 'DATA01',
    })
    const testSubject = await createTestStudySubject(testDb, {
      studyId: testStudy.id,
      name: 'Subject A',
    })
    const testSpecimen = await createTestSpecimen(testDb, testSpecimenType.id, {
      studySubjectId: testSubject.id,
    })
    const testUnit = await createTestUnit(testDb, {
      symbol: 'uL',
      name: 'microliter',
      category: 'volume',
    })
    const testContainer = await createTestStorageContainer(testDb, {
      specimenId: testSpecimen.id,
      unitId: testUnit.id,
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: adminCookie,
    })

    expect(res.status).toBe(200)

    const remainingStudy = await testDb.select().from(study).where(eq(study.id, testStudy.id))
    expect(remainingStudy.length).toBe(0)

    const remainingSubjects = await testDb.select().from(studySubject).where(eq(studySubject.studyId, testStudy.id))
    expect(remainingSubjects.length).toBe(0)

    const remainingSpecimens = await testDb.select().from(specimen).where(eq(specimen.studySubjectId, testSubject.id))
    expect(remainingSpecimens.length).toBe(0)

    const remainingContainers = await testDb.select().from(storageContainer).where(eq(storageContainer.id, testContainer.id))
    expect(remainingContainers.length).toBe(0)
  })

  it('returns 404 when study does not exist', async () => {
    const res = await authenticatedRequest(app, '/api/studies/99999', {
      method: 'DELETE',
      cookie: adminCookie,
    })

    expect(res.status).toBe(404)
    const data = (await res.json()) as { error?: string }
    expect(data.error).toContain('not found')
  })

  it('returns 401 when not authenticated', async () => {
    const testStudy = await createTestStudy(testDb, {
      title: 'Some Study',
      shortCode: 'SOME01',
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
    })

    expect(res.status).toBe(401)
  })

  it('returns 403 when authenticated as member (non-admin) deleting non-tutorial study', async () => {
    const testStudy = await createTestStudy(testDb, {
      title: 'Member Study',
      shortCode: 'MEMB01',
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: memberCookie,
    })

    expect(res.status).toBe(403)
    const data = (await res.json()) as { error?: string }
    expect(data.error).toBe('Only administrators can delete non-tutorial studies.')

    const remaining = await testDb.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(1)
  })

  it('returns 200 when member deletes tutorial study (TUT01)', async () => {
    const testStudy = await createTestStudy(testDb, {
      title: 'Tutorial Study',
      shortCode: 'TUT01',
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: memberCookie,
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await testDb.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 200 when member deletes tutorial-namespace study (TUT-123)', async () => {
    const testStudy = await createTestStudy(testDb, {
      title: 'Per-user tutorial study',
      shortCode: 'TUT-123',
    })

    const res = await authenticatedRequest(app, `/api/studies/${testStudy.id}`, {
      method: 'DELETE',
      cookie: memberCookie,
    })

    expect(res.status).toBe(200)
    const data = (await res.json()) as { message?: string }
    expect(data.message).toBe('Study deleted successfully')

    const remaining = await testDb.select().from(study).where(eq(study.id, testStudy.id))
    expect(remaining.length).toBe(0)
  })

  it('returns 400 when study ID is invalid', async () => {
    const res = await authenticatedRequest(app, '/api/studies/not-a-number', {
      method: 'DELETE',
      cookie: adminCookie,
    })

    expect(res.status).toBe(400)
  })
})
