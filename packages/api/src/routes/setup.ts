import { Hono } from 'hono'
import { users, specimenType, unit, storageType, location, strain, specimenTypeContainerType, containerTypeUnit } from '../db/schema'
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
import type { Database } from '../db/client'
// Note: Defaults are only used in the frontend Setup.tsx
// Backend requires all data to be provided via the API

export function createSetupRoutes(database: Database) {
  const setupRoutes = new Hono()

  // Check if system is initialized
  setupRoutes.get('/status', async (c) => {
    // Check if any users exist
    const userCount = await database.select({ count: sql<number>`count(*)` }).from(users).get()
    const initialized = (userCount?.count || 0) > 0

    return c.json({ initialized })
  })


const initSchema = z.object({
    adminName: z.string().min(1),
    adminEmail: z.email(),
    adminPassword: z.string().min(8),
    locations: z.array(z.object({
        name: z.string(),
        storageTypeId: z.string().optional(),
        description: z.string().optional(),
    })).optional(),
    specimenTypes: z.array(z.object({ 
        name: z.string(),
        containerTypes: z.array(z.enum(['paper', 'cryovial_tube', 'micronix_tube', 'static_well'])).optional()
    })).optional(),
    units: z.array(z.object({ name: z.string(), symbol: z.string(), category: z.string() })).optional(),
    storageTypes: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional(),
    strains: z.array(z.object({ name: z.string(), description: z.string().optional() })).optional()
})

  setupRoutes.post('/initialize', async (c) => {
    try {
      const body = await c.req.json()
      const {
        adminName,
        adminEmail,
        adminPassword,
        locations,
        specimenTypes,
        units,
        storageTypes,
        strains
      } = initSchema.parse(body)

      // Double check initialization status to prevent overwrites
      const userCount = await database.select({ count: sql<number>`count(*)` }).from(users).get()
      if ((userCount?.count || 0) > 0) {
        return c.json({ error: 'System already initialized' }, 400)
      }

      // 1. Create Admin User
      const passwordHash = await bcrypt.hash(adminPassword, 10)
      await database.insert(users).values({
        id: 1,
        name: adminName,
        email: adminEmail,
        passwordHash,
        role: 'admin',
        createdAt: new Date().toISOString()
      })

      const now = new Date().toISOString()

      // 2. Storage Types (must be created first for location references)
      if (!storageTypes || storageTypes.length === 0) {
        return c.json({ error: 'At least one storage type is required' }, 400)
      }
      const storageTypesToInsert = storageTypes
      const storageTypeMap = new Map<string, number>() // name -> id mapping
      
      if (storageTypesToInsert.length > 0) {
        // Insert storage types and capture their IDs
        for (const s of storageTypesToInsert) {
          const existing = await database.select().from(storageType).where(eq(storageType.name, s.name)).get()
          if (existing) {
            storageTypeMap.set(s.name, existing.id)
          } else {
            const result = await database.insert(storageType).values({
              name: s.name,
              description: s.description
            }).returning()
            if (result && result.length > 0 && result[0]) {
              storageTypeMap.set(s.name, result[0].id)
            }
          }
        }
      }
      

      // 3. Specimen Types
      if (!specimenTypes || specimenTypes.length === 0) {
        return c.json({ error: 'At least one specimen type is required' }, 400)
      }
      const specimenTypesToInsert = specimenTypes
      
      await database.insert(specimenType).values(specimenTypesToInsert.map(s => ({
        name: s.name,
        created: now,
        lastUpdated: now
      }))).onConflictDoNothing()
      console.log(`✅ Inserted ${specimenTypesToInsert.length} specimen types`)

      // 4. Units
      if (!units || units.length === 0) {
        return c.json({ error: 'At least one unit is required' }, 400)
      }
      const unitsToInsert = units
      if (unitsToInsert.length > 0) {
        await database.insert(unit).values(unitsToInsert.map(u => ({
          name: u.name,
          symbol: u.symbol,
          category: u.category
        }))).onConflictDoNothing()
      }

      // 5. Strains (Optional)
      if (strains && strains.length > 0) {
        for (const s of strains) {
          const existing = await database.select().from(strain).where(eq(strain.name, s.name)).get()
          if (!existing) {
            await database.insert(strain).values({
              name: s.name,
              description: s.description
            }).onConflictDoNothing()
          }
        }
      }

      // 6. Locations (Root) - must resolve storage type IDs
      if (locations && locations.length > 0) {
        const locationValues = locations.map((l, i) => {
          // Create a copy of the location to avoid mutation issues
          const location = { ...l }
          let resolvedStorageTypeId: string | null = null
          if (location.storageTypeId) {
            // Frontend sends storage type name, look it up
            const storageTypeId = storageTypeMap.get(location.storageTypeId)
            if (storageTypeId) {
              resolvedStorageTypeId = String(storageTypeId)
            } else {
              // Fail if storage type not found by name - don't fall back
              throw new Error(`Storage type '${location.storageTypeId}' not found for location '${location.name}'. Please provide a valid storage type name.`)
            }
          } else if (storageTypeMap.size > 0) {
            // Use first storage type as default if none specified
            resolvedStorageTypeId = String(Array.from(storageTypeMap.values())[0])
          } else {
            throw new Error(`No storage types available for location '${location.name}'. At least one storage type must be created.`)
          }
          
          return {
            id: i + 1,
            parentId: null,
            name: location.name,
            storageTypeId: resolvedStorageTypeId,
            description: location.description,
            canContainCollections: false, // Root locations typically don't hold collections directly
            path: location.name, // Root location path is just its name
            created: now,
            lastUpdated: now
          }
        })
        await database.insert(location).values(locationValues).onConflictDoNothing()
      }

      // 7. Seed constraint relationships - container type / unit relationships
      // Get unit IDs for container type / unit relationships
      const itemsUnit = await database.select().from(unit).where(eq(unit.symbol, 'items')).get()
      const spotsUnit = await database.select().from(unit).where(eq(unit.symbol, 'spots')).get()
      const tubesUnit = await database.select().from(unit).where(eq(unit.symbol, 'tubes')).get()
      const ulUnit = await database.select().from(unit).where(eq(unit.symbol, 'µL')).get()
      const mlUnit = await database.select().from(unit).where(eq(unit.symbol, 'mL')).get()
      
      // Validate all required units exist before creating relationships
      const missingUnits: string[] = []
      if (!itemsUnit) missingUnits.push('items')
      if (!spotsUnit) missingUnits.push('spots')
      if (!tubesUnit) missingUnits.push('tubes')
      if (!ulUnit) missingUnits.push('µL')
      if (!mlUnit) missingUnits.push('mL')
      
      if (missingUnits.length > 0) {
        return c.json({ 
          error: `Required units not found: ${missingUnits.join(', ')}. Please ensure all required units are created during setup.` 
        }, 500)
      }
      
      // TypeScript now knows all units are defined after the check above
      // Insert container type / unit relationships
      await database.insert(containerTypeUnit).values([
        { containerType: 'paper', unitId: spotsUnit!.id as number },
        { containerType: 'cryovial_tube', unitId: itemsUnit!.id as number },
        { containerType: 'cryovial_tube', unitId: tubesUnit!.id as number },
        { containerType: 'cryovial_tube', unitId: ulUnit!.id as number },
        { containerType: 'cryovial_tube', unitId: mlUnit!.id as number },
        { containerType: 'micronix_tube', unitId: itemsUnit!.id as number },
        { containerType: 'micronix_tube', unitId: ulUnit!.id as number },
        { containerType: 'micronix_tube', unitId: mlUnit!.id as number },
        { containerType: 'static_well', unitId: spotsUnit!.id as number }
      ]).onConflictDoNothing()

      // 8. Create specimen type / container type relationships
      const allSpecimenTypes = await database.select().from(specimenType).all()
      const specimenTypeMap = new Map<string, number>()
      allSpecimenTypes.forEach(st => {
        specimenTypeMap.set(st.name, st.id)
      })
      
      console.log(`📋 Found ${allSpecimenTypes.length} specimen types for container type relationships`)
      
      // Use container types from the provided specimen types
      const relationships: Array<{ specimenTypeId: number; containerType: 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well' }> = []
      
      // Process specimen types that were provided from frontend
      const typesToProcess = specimenTypes
      console.log(`📦 Processing ${typesToProcess.length} specimen types`)
      
      for (const st of typesToProcess) {
        const specimenTypeId = specimenTypeMap.get(st.name)
        const hasContainerTypes = st.containerTypes && st.containerTypes.length > 0
        
        if (specimenTypeId && hasContainerTypes) {
          for (const containerType of st.containerTypes!) {
            relationships.push({
              specimenTypeId,
              containerType: containerType as 'paper' | 'cryovial_tube' | 'micronix_tube' | 'static_well'
            })
          }
          console.log(`   ✅ ${st.name}: ${st.containerTypes!.join(', ')}`)
        } else if (specimenTypeId && !hasContainerTypes) {
          console.log(`   ⚠️ ${st.name}: No container types specified`)
        } else if (!specimenTypeId) {
          console.log(`   ❌ ${st.name}: Specimen type not found in database`)
        }
      }
      
      // Create relationships - fail if this fails (don't silently continue)
      if (relationships.length > 0) {
        await database.insert(specimenTypeContainerType).values(relationships).onConflictDoNothing()
        console.log(`✅ Created ${relationships.length} container type relationships`)
      } else {
        console.warn('⚠️ No container type relationships to create')
        console.warn(`   Processed ${typesToProcess.length} specimen types, but none had containerTypes specified`)
      }

      // 9. Seed default settings
      await setContainerDefaults({
        micronix_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
        cryovial_tube: { totalQuantity: 1.0, remainingQuantity: 1.0, defaultUnitSymbol: 'items' },
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
              'study_id',
              'study_code',
              'study_title',
              'study_lead_person',
              'location_path',
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

      // Comprehensive validation - ensure all critical data was created
      const specimenTypeCount = await database.select({ count: sql<number>`count(*)` }).from(specimenType).get()
      const unitCount = await database.select({ count: sql<number>`count(*)` }).from(unit).get()
      const storageTypeCount = await database.select({ count: sql<number>`count(*)` }).from(storageType).get()
      const locationCount = await database.select({ count: sql<number>`count(*)` }).from(location).get()
      const containerTypeUnitCount = await database.select({ count: sql<number>`count(*)` }).from(containerTypeUnit).get()
      const specimenTypeContainerTypeCount = await database.select({ count: sql<number>`count(*)` }).from(specimenTypeContainerType).get()
      
      const validationErrors: string[] = []
      
      if ((specimenTypeCount?.count || 0) === 0) {
        validationErrors.push('No specimen types were created')
      }
      if ((unitCount?.count || 0) === 0) {
        validationErrors.push('No units were created')
      }
      if (storageTypes && storageTypes.length > 0 && (storageTypeCount?.count || 0) === 0) {
        validationErrors.push('No storage types were created')
      }
      if (locations && locations.length > 0 && (locationCount?.count || 0) === 0) {
        validationErrors.push('No locations were created')
      }
      if ((containerTypeUnitCount?.count || 0) === 0) {
        validationErrors.push('No container type/unit relationships were created')
      }
      if (relationships.length > 0 && (specimenTypeContainerTypeCount?.count || 0) === 0) {
        validationErrors.push('No specimen type/container type relationships were created')
      }
      
      if (validationErrors.length > 0) {
        return c.json({ 
          error: 'Setup validation failed', 
          details: validationErrors.join('; ') 
        }, 500)
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

  return setupRoutes
}
