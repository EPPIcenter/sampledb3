import { Hono } from 'hono'
import { db } from '../db/client'
import { users, specimenType, unit, storageType, location, strain, composition, compositionStrain } from '../db/schema'
import { sql, eq } from 'drizzle-orm'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import {
  setContainerDefaults,
  setPaginationSettings,
  setPasswordRequirements,
  setSessionSettings,
  setExportConfigurations,
  setScannerConfigurations,
} from '../lib/settings'

const setupRoutes = new Hono()

// Check if system is initialized
setupRoutes.get('/status', async (c) => {
    // Check if any users exist
    const userCount = await db.select({ count: sql<number>`count(*)` }).from(users).get()
    const initialized = (userCount?.count || 0) > 0

    return c.json({ initialized })
})

const defaultSpecimenTypes = [
    { name: 'Blood' },
    { name: 'Plasma' },
    { name: 'Serum' },
    { name: 'Saliva' },
    { name: 'DNA' },
]

const defaultUnits = [
    { name: 'Milliliter', symbol: 'mL', category: 'volume' },
    { name: 'Microliter', symbol: 'µL', category: 'volume' },
    { name: 'Gram', symbol: 'g', category: 'mass' },
    { name: 'Count', symbol: 'cnt', category: 'count' },
    { name: 'Generic items', symbol: 'items', category: 'count' },
    { name: 'DBS spots', symbol: 'spots', category: 'count' },
    { name: 'Cryovial tubes', symbol: 'tubes', category: 'count' },
]

const defaultStorageTypes = [
    { name: 'Freezer -80°C', description: 'Ultra-low temperature freezer' },
    { name: 'Freezer -20°C', description: 'Standard freezer' },
    { name: 'Refrigerator 4°C', description: 'Standard fridge' },
    { name: 'Room Temperature', description: 'Ambient storage' },
]

const initSchema = z.object({
    adminName: z.string().min(1),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8), // Default during setup, configurable after initialization
    seedData: z.boolean().default(true),
    // Expanded configurations
    locations: z.array(z.object({
        name: z.string(),
        storageTypeId: z.string().optional(),
        description: z.string().optional(),
    })).optional(),
    specimenTypes: z.array(z.object({ name: z.string() })).optional(),
    units: z.array(z.object({ name: z.string(), symbol: z.string(), category: z.string() })).optional(),
    storageTypes: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
    strains: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
    compositions: z.array(z.object({
        label: z.string(),
        index: z.number().optional(),
        legacy: z.number().default(0),
        strains: z.array(z.object({
            strainName: z.string(),
            percentage: z.number().min(0).max(100)
        })).optional()
    })).optional()
})

setupRoutes.post('/initialize', async (c) => {
    try {
        const body = await c.req.json()
        const {
            adminName,
            adminEmail,
            adminPassword,
            seedData,
            locations,
            specimenTypes,
            units,
            storageTypes,
            strains,
            compositions
        } = initSchema.parse(body)

        // Double check initialization status to prevent overwrites
        const userCount = await db.select({ count: sql<number>`count(*)` }).from(users).get()
        if ((userCount?.count || 0) > 0) {
            return c.json({ error: 'System already initialized' }, 400)
        }

        // 1. Create Admin User
        const passwordHash = await bcrypt.hash(adminPassword, 10)
        await db.insert(users).values({
            id: 1,
            name: adminName,
            email: adminEmail,
            passwordHash,
            role: 'admin',
            createdAt: new Date().toISOString()
        })

        const now = new Date().toISOString()

        // 2. Storage Types (must be created first for location references)
        const storageTypesToInsert = storageTypes || (seedData ? defaultStorageTypes : [])
        const storageTypeMap = new Map<string, number>() // name -> id mapping
        
        if (storageTypesToInsert.length > 0) {
            // Insert storage types and capture their IDs
            for (const s of storageTypesToInsert) {
                const existing = await db.select().from(storageType).where(eq(storageType.name, s.name)).get()
                if (existing) {
                    storageTypeMap.set(s.name, existing.id)
                } else {
                    const result = await db.insert(storageType).values({
                        name: s.name,
                        description: s.description
                    }).returning()
                    if (result[0]) {
                        storageTypeMap.set(s.name, result[0].id)
                    }
                }
            }
        }

        // 3. Specimen Types
        const specimenTypesToInsert = specimenTypes || (seedData ? defaultSpecimenTypes : [])
        if (specimenTypesToInsert.length > 0) {
            await db.insert(specimenType).values(specimenTypesToInsert.map(s => ({
                name: s.name,
                created: now,
                lastUpdated: now
            }))).onConflictDoNothing()
        }

        // 4. Units
        const unitsToInsert = units || (seedData ? defaultUnits : [])
        if (unitsToInsert.length > 0) {
            await db.insert(unit).values(unitsToInsert.map(u => ({
                name: u.name,
                symbol: u.symbol,
                category: u.category
            }))).onConflictDoNothing()
        }

        // 5. Strains (Optional - must be created before compositions)
        const strainMap = new Map<string, number>() // name -> id mapping
        if (strains && strains.length > 0) {
            for (const s of strains) {
                const existing = await db.select().from(strain).where(eq(strain.name, s.name)).get()
                if (existing) {
                    strainMap.set(s.name, existing.id)
                } else {
                    const result = await db.insert(strain).values({
                        name: s.name,
                        description: s.description
                    }).returning()
                    if (result[0]) {
                        strainMap.set(s.name, result[0].id)
                    }
                }
            }
        }

        // 6. Compositions (Optional - requires strains)
        if (compositions && compositions.length > 0) {
            for (const comp of compositions) {
                const result = await db.insert(composition).values({
                    label: comp.label,
                    index: comp.index,
                    legacy: comp.legacy || 0
                }).returning()
                
                if (result[0] && comp.strains && comp.strains.length > 0) {
                    // Insert composition-strain relationships
                    const compStrains = comp.strains.map(cs => {
                        const strainId = strainMap.get(cs.strainName)
                        if (!strainId) {
                            throw new Error(`Strain "${cs.strainName}" not found for composition "${comp.label}"`)
                        }
                        return {
                            compositionId: result[0].id,
                            strainId,
                            percentage: cs.percentage
                        }
                    })
                    await db.insert(compositionStrain).values(compStrains)
                }
            }
        }

        // 7. Locations (Root) - must resolve storage type IDs
        if (locations && locations.length > 0) {
            const locationValues = locations.map((l, i) => {
                let resolvedStorageTypeId = '1'
                if (l.storageTypeId) {
                    // Frontend sends storage type name, look it up
                    const storageTypeId = storageTypeMap.get(l.storageTypeId)
                    if (storageTypeId) {
                        resolvedStorageTypeId = String(storageTypeId)
                    } else {
                        // If not found by name, try parsing as numeric ID
                        const numId = parseInt(l.storageTypeId, 10)
                        if (!isNaN(numId)) {
                            resolvedStorageTypeId = l.storageTypeId
                        } else if (storageTypeMap.size > 0) {
                            // Use first storage type as default if name not found
                            resolvedStorageTypeId = String(Array.from(storageTypeMap.values())[0])
                        }
                    }
                } else if (storageTypeMap.size > 0) {
                    // Use first storage type as default
                    resolvedStorageTypeId = String(Array.from(storageTypeMap.values())[0])
                }
                
                return {
                    id: i + 1,
                    locationRoot: l.name,
                    storageTypeId: resolvedStorageTypeId,
                    levelI: 'Root',
                    levelII: 'Root',
                    description: l.description,
                    created: now,
                    lastUpdated: now
                }
            })
            await db.insert(location).values(locationValues).onConflictDoNothing()
        }

        // 8. Seed default settings
        await setContainerDefaults({
          micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
          cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
          tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
          paper: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
          static_well: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'spots' },
        })
        await setPaginationSettings({ defaultPageSize: 50, maxPageSize: 1000 })
        await setPasswordRequirements({ minLength: 8 })
        await setSessionSettings({ maxAgeSeconds: 604800 }) // 7 days
        
        // Create default export configuration with all available columns
        await setExportConfigurations({
          configurations: [
            {
              name: 'All Columns',
              columns: [
                'container_id',
                'container_type',
                'barcode',
                'position',
                'label',
                'collection_name',
                'status',
                'comment',
                'specimen_id',
                'specimen_type',
                'collection_date',
                'subject_id',
                'subject_name',
                'control_batch_id',
                'control_batch_name',
                'control_definition_name',
                'control_type',
                'target_density',
                'target_density_unit',
                'strain_composition',
                'study_id',
                'study_code',
                'study_title',
                'study_lead_person',
                'location_path',
                'location_root',
                'location_level_i',
                'location_level_ii',
                'location_level_iii',
                'created',
                'last_updated',
              ],
              isDefault: true,
            },
          ],
        })

        // Create default scanner configurations for different plate scanning devices
        await setScannerConfigurations({
          configurations: [
            {
              id: 'traxcer',
              name: 'Traxcer',
              barcodeColumn: 'Tube ID',
              positionType: 'single',
              positionColumn: 'Position',
              skipRows: 0,
              isDefault: true,
            },
            {
              id: 'visionmate',
              name: 'VisionMate',
              barcodeColumn: 'TubeCode',
              positionType: 'combined',
              rowColumn: 'LocationRow',
              columnColumn: 'LocationColumn',
              skipRows: 0,
            },
            {
              id: 'general',
              name: 'General',
              barcodeColumn: 'Barcode',
              positionType: 'combined',
              rowColumn: 'Row',
              columnColumn: 'Column',
              skipRows: 0,
            },
          ],
        })

        // Validate minimum required data
        const specimenTypeCount = await db.select({ count: sql<number>`count(*)` }).from(specimenType).get()
        const unitCount = await db.select({ count: sql<number>`count(*)` }).from(unit).get()
        
        if ((specimenTypeCount?.count || 0) === 0) {
            return c.json({ error: 'At least one specimen type is required' }, 400)
        }
        if ((unitCount?.count || 0) === 0) {
            return c.json({ error: 'At least one unit is required' }, 400)
        }

        return c.json({ success: true, message: 'System initialized successfully' })
    } catch (error) {
        if (error instanceof z.ZodError) {
            return c.json({ error: 'Invalid input', details: error.issues }, 400)
        }
        console.error('Setup error:', error)
        return c.json({ error: 'Setup failed', details: String(error) }, 500)
    }
})

export default setupRoutes
