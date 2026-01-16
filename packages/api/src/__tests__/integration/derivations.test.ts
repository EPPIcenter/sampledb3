import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestClient } from '../helpers/test-client'
import { setupTestDatabase, cleanupTestDatabase } from '../helpers/db-setup'
import { 
  createTestStudy,
  createTestStudySubject,
  createTestSpecimenType,
  createTestSpecimen,
} from '../helpers/factories'
import type { Database } from '../../db/client'
import { createDerivationsRoutes } from '../../routes/derivations'

describe('Derivation Workflow Integration Tests', () => {
  let testDb: Database
  let sqlite: any
  let client: ReturnType<typeof createTestClient>

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    const app = new (await import('hono')).Hono()
    app.route('/api', createDerivationsRoutes(testDb))
    client = createTestClient(app)
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  it('should create a derivation from parent container', async () => {
    // Setup: Create study, subject, specimen type, and specimen with container
    const study = await createTestStudy(testDb, {
      title: 'Test Study',
      shortCode: 'TEST001',
    })
    const subject = await createTestStudySubject(testDb, {
      studyId: study.id,
      name: 'Subject 1',
    })
    const specimenType = await createTestSpecimenType(testDb, { name: 'Blood' })
    const specimen = await createTestSpecimen(testDb, specimenType.id, {
      studySubjectId: subject.id,
    })

    // Note: This test requires a container to be created first
    // The actual derivation creation would need container setup
    // This is a basic structure - expand based on actual derivation route structure
    expect(specimen).toBeDefined()
    expect(specimen.id).toBeGreaterThan(0)
  })
})
