import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { loginAndGetCookie, authenticatedRequest } from '../../__tests__/helpers/test-client'
import { Hono } from 'hono'
import { createAuthRoutes } from '../auth'
import { createQpcrExperimentsRoutes } from '../qpcr-experiments'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import type { Database as SQLiteDatabase } from 'bun:sqlite'
import { createTestUser, setupPasswordRequirements, setupSessionSettings } from '../../__tests__/helpers/auth-helpers'
import { qpcrExperiment, qpcrExperimentWell } from '../../db/schema'

describe('qPCR Experiments Template', () => {
  let app: Hono
  let testDb: Database
  let sqlite: SQLiteDatabase

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite

    await setupPasswordRequirements(testDb, 8)
    await setupSessionSettings(testDb, 604800)
    await createTestUser(testDb, {
      email: 'admin@test.com',
      name: 'Admin User',
      password: 'password123',
      role: 'admin',
    })

    app = new Hono()
    app.route('/api/auth', createAuthRoutes(testDb, testDb))
    app.route('/api/qpcr-experiments', createQpcrExperimentsRoutes(testDb))
  })

  afterEach(() => {
    if (sqlite) {
      cleanupTestDatabase(sqlite)
    }
  })

  describe('GET /:id/template', () => {
    it('includes only rows for wells that have a tube; skips positions with no tube', async () => {
      const cookie = await loginAndGetCookie(app, 'admin@test.com', 'password123')

      const [exp] = await testDb
        .insert(qpcrExperiment)
        .values({
          name: 'Template test',
          templateFormat: 'biorad',
          status: 'setup',
          created: new Date().toISOString(),
          lastUpdated: new Date().toISOString(),
        })
        .returning()
      if (!exp) throw new Error('Insert failed')

      await testDb.insert(qpcrExperimentWell).values([
        {
          qpcrExperimentId: exp.id,
          wellPosition: 'A01',
          contentType: 'unknown',
          standardDensity: null,
        },
        {
          qpcrExperimentId: exp.id,
          wellPosition: 'A02',
          contentType: 'unknown',
          standardDensity: null,
        },
      ])

      const bioradRes = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/template?format=biorad`, {
        cookie,
      })
      expect(bioradRes.status).toBe(200)
      const bioradText = await bioradRes.text()
      const bioradLines = bioradText.split('\n').filter(Boolean)
      expect(bioradLines[0]).toBe('Well,Fluorophore,Target Name,Content,Sample Name,Quantity')
      expect(bioradLines.length).toBe(3)
      expect(bioradLines[1]).toContain('A1')
      expect(bioradLines[2]).toContain('A2')

      const quantRes = await authenticatedRequest(app, `/api/qpcr-experiments/${exp.id}/template?format=quant_studio`, {
        cookie,
      })
      expect(quantRes.status).toBe(200)
      const quantText = await quantRes.text()
      const quantLines = quantText.split('\n').filter(Boolean)
      const dataHeaderIdx = quantLines.findIndex((l) => l.startsWith('Well\tWell Position'))
      expect(dataHeaderIdx).toBeGreaterThanOrEqual(0)
      const dataLines = quantLines.slice(dataHeaderIdx + 1)
      expect(dataLines.length).toBe(2)
      expect(dataLines[0]).toContain('A1')
      expect(dataLines[1]).toContain('A2')
    })
  })
})
