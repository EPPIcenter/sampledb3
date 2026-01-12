import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { setupTestDatabase, cleanupTestDatabase } from '../../__tests__/helpers/db-setup'
import type { Database } from '../../db/client'
import { Database } from 'bun:sqlite'
import { createSetupRoutes } from '../setup'
import { users, unit, specimenType, storageType, location, containerTypeUnit, specimenTypeContainerType } from '../../db/schema'

describe('Setup Route', () => {
  let testDb: Database
  let sqlite: Database

  function createTestApp(): Hono {
    // Create a fresh app instance for each test to avoid state leakage
    const setupRoutes = createSetupRoutes(testDb)
    const app = new Hono()
    app.route('/setup', setupRoutes)
    return app
  }

  beforeEach(async () => {
    const setup = await setupTestDatabase()
    testDb = setup.db
    sqlite = setup.sqlite
  })

  afterEach(() => {
    cleanupTestDatabase(sqlite)
  })

  describe('POST /setup/initialize', () => {
    it('should fail if container type relationships cannot be created due to missing units', async () => {
      // Create minimal setup data but omit required units
      const setupData = {
        adminName: 'Test Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'password123',
        storageTypes: [{ name: 'Freezer' }],
        specimenTypes: [{ name: 'Blood', containerTypes: ['cryovial_tube'] }],
        units: [
          // Only include some units, missing 'items' which is required for cryovial_tube
          { name: 'spots', symbol: 'spots', category: 'count' },
          { name: 'tubes', symbol: 'tubes', category: 'count' },
        ],
        locations: [{ name: 'Location 1' }],
      }

      const app = createTestApp()
      const res = await app.request('/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData),
      })

      expect(res.status).toBe(500)
      const body = await res.json() as { error?: string }
      expect(body.error).toContain('unit')
    })

    it('should validate all critical data was created', async () => {
      // Create a fresh object to avoid mutation issues
      const setupData = {
        adminName: 'Test Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'password123',
        storageTypes: [{ name: 'Freezer' }],
        specimenTypes: [{ name: 'Blood' }],
        units: [
          { name: 'items', symbol: 'items', category: 'count' },
          { name: 'spots', symbol: 'spots', category: 'count' },
          { name: 'tubes', symbol: 'tubes', category: 'count' },
          { name: 'microliter', symbol: 'µL', category: 'volume' },
          { name: 'milliliter', symbol: 'mL', category: 'volume' },
        ],
        locations: [{ name: 'Location 1', storageTypeId: 'Freezer' }],
      }
      
      // Deep clone to prevent mutation
      const requestBody = JSON.parse(JSON.stringify(setupData))

      const app = createTestApp()
      const res = await app.request('/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      })

      if (res.status !== 200) {
        const errorBody = await res.json() as any
        console.error('Setup failed:', JSON.stringify(errorBody, null, 2))
      }
      expect(res.status).toBe(200)
      const body = await res.json() as { success?: boolean }
      expect(body.success).toBe(true)

      // Verify all entities were created
      const storageTypes = await testDb.select().from(storageType).all()
      expect(storageTypes.length).toBeGreaterThan(0)

      const locations = await testDb.select().from(location).all()
      expect(locations.length).toBeGreaterThan(0)

      const containerTypeUnits = await testDb.select().from(containerTypeUnit).all()
      expect(containerTypeUnits.length).toBeGreaterThan(0)
    })

    it('should fail if storage type not found by name', async () => {
      const setupData = {
        adminName: 'Test Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'password123',
        storageTypes: [{ name: 'Freezer' }],
        specimenTypes: [{ name: 'Blood' }],
        units: [{ name: 'items', symbol: 'items', category: 'count' }],
        locations: [
          {
            name: 'Location 1',
            storageTypeId: 'NonExistentStorageType', // This doesn't exist
          },
        ],
      }

      const app = createTestApp()
      const res = await app.request('/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData),
      })

      // Should fail because storage type not found
      expect(res.status).toBe(500)
      const body = await res.json() as { error?: string }
      expect(body.error).toBeDefined()
    })

    it('should succeed when all data is valid', async () => {
      const setupData = {
        adminName: 'Test Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'password123',
        storageTypes: [{ name: 'Freezer', description: 'Cold storage' }],
        specimenTypes: [
          {
            name: 'Blood',
            containerTypes: ['cryovial_tube', 'paper'],
          },
        ],
        units: [
          { name: 'items', symbol: 'items', category: 'count' },
          { name: 'spots', symbol: 'spots', category: 'count' },
          { name: 'tubes', symbol: 'tubes', category: 'count' },
          { name: 'microliter', symbol: 'µL', category: 'volume' },
          { name: 'milliliter', symbol: 'mL', category: 'volume' },
        ],
        locations: [
          {
            name: 'Location 1',
            storageTypeId: 'Freezer',
            description: 'Main freezer',
          },
        ],
      }

      const app = createTestApp()
      const res = await app.request('/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData),
      })

      expect(res.status).toBe(200)
      const body = await res.json() as { success?: boolean; message?: string }
      expect(body.success).toBe(true)
      expect(body.message).toContain('successfully')

      // Verify all relationships were created
      const relationships = await testDb
        .select()
        .from(specimenTypeContainerType)
        .all()
      expect(relationships.length).toBeGreaterThan(0)
    })

    it('should fail if system already initialized', async () => {
      // First, create an admin user to simulate initialized system
      await testDb.insert(users).values({
        id: 1,
        name: 'Existing Admin',
        email: 'existing@test.com',
        passwordHash: 'hash',
        role: 'admin',
        createdAt: new Date().toISOString(),
      })

      const setupData = {
        adminName: 'Test Admin',
        adminEmail: 'admin@test.com',
        adminPassword: 'password123',
        storageTypes: [{ name: 'Freezer' }],
        specimenTypes: [{ name: 'Blood' }],
        units: [{ name: 'items', symbol: 'items', category: 'count' }],
      }

      const app = createTestApp()
      const res = await app.request('/setup/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(setupData),
      })

      expect(res.status).toBe(400)
      const body = await res.json() as { error?: string }
      expect(body.error).toBe('System already initialized')
    })
  })
})

