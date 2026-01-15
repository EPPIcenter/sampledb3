import { Hono } from 'hono'
import { z } from 'zod'
import { db } from '../db/client'
import { unit, containerTypeUnit } from '../db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import {
  getContainerDefaults,
  setContainerDefaults,
  getPaginationSettings,
  setPaginationSettings,
  getPasswordRequirements,
  setPasswordRequirements,
  getSessionSettings,
  setSessionSettings,
  getExportConfigurations,
  setExportConfigurations,
  getScannerConfigurations,
  setScannerConfigurations,
  clearSettingsCache,
  type ContainerDefaults,
  type PaginationSettings,
  type PasswordRequirements,
  type SessionSettings,
  type ExportConfigurations,
  type ScannerConfigurations,
} from '../lib/settings'

const settings = new Hono()

// Authentication bypassed for now - login system not fully implemented

// GET /api/settings - Get all settings
settings.get('/', async (c) => {
  try {
    const [containerDefaults, paginationSettings, passwordRequirements, sessionSettings, exportConfigurations, scannerConfigurations] = await Promise.all([
      getContainerDefaults(),
      getPaginationSettings(),
      getPasswordRequirements(),
      getSessionSettings(),
      getExportConfigurations(),
      getScannerConfigurations(),
    ])

    return c.json({
      container_defaults: containerDefaults,
      pagination_settings: paginationSettings,
      password_requirements: passwordRequirements,
      session_settings: sessionSettings,
      export_configurations: exportConfigurations,
      scanner_configurations: scannerConfigurations,
    })
  } catch (error: unknown) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/settings/units - Get all available units
settings.get('/units', async (c) => {
  try {
    const units = await db
      .select({
        id: unit.id,
        symbol: unit.symbol,
        name: unit.name,
        category: unit.category,
      })
      .from(unit)
      .orderBy(unit.symbol)
    
    return c.json(units)
  } catch (error: unknown) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// GET /api/settings/:key - Get specific setting
settings.get('/:key', async (c) => {
  try {
    const key = c.req.param('key')

    let value: unknown = null
    switch (key) {
      case 'container_defaults':
        value = await getContainerDefaults()
        break
      case 'pagination_settings':
        value = await getPaginationSettings()
        break
      case 'password_requirements':
        value = await getPasswordRequirements()
        break
      case 'session_settings':
        value = await getSessionSettings()
        break
      case 'export_configurations':
        value = await getExportConfigurations()
        break
      case 'scanner_configurations':
        value = await getScannerConfigurations()
        break
      default:
        return c.json({ error: 'Invalid setting key' }, 400)
    }

    if (value === null) {
      return c.json({ error: 'Setting not found' }, 404)
    }

    return c.json({ key, value })
  } catch (error: unknown) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

// Validation schemas
const containerDefaultsSchema = z.object({
  micronix_tube: z.object({
    totalQuantity: z.number().positive(),
    remainingQuantity: z.number().positive(),
    defaultUnitSymbol: z.string().min(1),
  }),
  cryovial_tube: z.object({
    totalQuantity: z.number().positive(),
    remainingQuantity: z.number().positive(),
    defaultUnitSymbol: z.string().min(1),
  }),
  paper: z.object({
    totalQuantity: z.number().positive(),
    remainingQuantity: z.number().positive(),
    defaultUnitSymbol: z.string().min(1),
  }),
  static_well: z.object({
    totalQuantity: z.number().positive(),
    remainingQuantity: z.number().positive(),
    defaultUnitSymbol: z.string().min(1),
  }),
})

const paginationSettingsSchema = z.object({
  defaultPageSize: z.number().int().positive(),
  maxPageSize: z.number().int().positive(),
}).refine((data) => data.defaultPageSize <= data.maxPageSize, {
  message: 'defaultPageSize must be less than or equal to maxPageSize',
})

const passwordRequirementsSchema = z.object({
  minLength: z.number().int().min(1),
})

const sessionSettingsSchema = z.object({
  maxAgeSeconds: z.number().int().positive(),
})

const exportConfigurationsSchema = z.object({
  configurations: z.array(z.object({
    name: z.string().min(1),
    columns: z.array(z.string()).min(1),
    isDefault: z.boolean().optional(),
  })),
})

const scannerConfigurationsSchema = z.object({
  configurations: z.array(z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    barcodeColumn: z.string().min(1),
    positionType: z.enum(['single', 'combined']),
    positionColumn: z.string().optional(),
    rowColumn: z.string().optional(),
    columnColumn: z.string().optional(),
    skipRows: z.number().int().nonnegative(),
    isDefault: z.boolean().optional(),
  }).refine((data) => {
    if (data.positionType === 'single') {
      return !!data.positionColumn
    } else {
      return !!data.rowColumn && !!data.columnColumn
    }
  }, {
    message: 'Position column is required for single type, row and column columns are required for combined type',
  })),
})

// PUT /api/settings/:key - Update a specific setting
settings.put('/:key', async (c) => {
  try {
    const key = c.req.param('key')
    const body = await c.req.json()

    switch (key) {
      case 'container_defaults': {
        const validated = containerDefaultsSchema.parse(body)
        
        // Validate that all defaultUnitSymbol values exist in the unit table
        const unitSymbols = [
          validated.micronix_tube.defaultUnitSymbol,
          validated.cryovial_tube.defaultUnitSymbol,
          validated.paper.defaultUnitSymbol,
          validated.static_well.defaultUnitSymbol,
        ]
        
        const existingUnits = await db
          .select({ symbol: unit.symbol })
          .from(unit)
          .where(inArray(unit.symbol, unitSymbols))
        
        const existingSymbols = new Set(existingUnits.map(u => u.symbol))
        const invalidSymbols = unitSymbols.filter(symbol => !existingSymbols.has(symbol))
        
        if (invalidSymbols.length > 0) {
          return c.json({ 
            error: `Unit symbol(s) not found in database: ${invalidSymbols.join(', ')}. Please create these units first.` 
          }, 400)
        }
        
        await setContainerDefaults(validated as ContainerDefaults)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      case 'pagination_settings': {
        const validated = paginationSettingsSchema.parse(body)
        await setPaginationSettings(validated as PaginationSettings)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      case 'password_requirements': {
        const validated = passwordRequirementsSchema.parse(body)
        await setPasswordRequirements(validated as PasswordRequirements)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      case 'session_settings': {
        const validated = sessionSettingsSchema.parse(body)
        await setSessionSettings(validated as SessionSettings)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      case 'export_configurations': {
        const validated = exportConfigurationsSchema.parse(body)
        await setExportConfigurations(validated as ExportConfigurations)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      case 'scanner_configurations': {
        const validated = scannerConfigurationsSchema.parse(body)
        await setScannerConfigurations(validated as ScannerConfigurations)
        clearSettingsCache()
        return c.json({ key, value: validated })
      }
      default:
        return c.json({ error: 'Invalid setting key' }, 400)
    }
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validation error', 
        details: error.issues.map(issue => ({
          path: issue.path.join('.'),
          message: issue.message
        }))
      }, 400)
    }
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return c.json({ error: 'Internal server error', details: errorMessage }, 500)
  }
})

// Container Type / Unit Relationship Endpoints

const containerTypeSchema = z.enum(['paper', 'cryovial_tube', 'micronix_tube', 'static_well'])

// GET /api/settings/container-types/:containerType/units - Get allowed units for a container type
settings.get('/container-types/:containerType/units', async (c) => {
  try {
    const containerType = c.req.param('containerType')
    
    if (!containerTypeSchema.safeParse(containerType).success) {
      return c.json({ error: 'Invalid container type' }, 400)
    }

    const relationships = await db
      .select({
        id: unit.id,
        symbol: unit.symbol,
        name: unit.name,
        category: unit.category,
      })
      .from(containerTypeUnit)
      .innerJoin(unit, eq(containerTypeUnit.unitId, unit.id))
      .where(eq(containerTypeUnit.containerType, containerType as any))

    return c.json({ units: relationships })
  } catch (error) {
    console.error('Error fetching units:', error)
    return c.json({ error: 'Failed to fetch units' }, 500)
  }
})

// POST /api/settings/container-types/:containerType/units - Add allowed unit for a container type
settings.post('/container-types/:containerType/units', async (c) => {
  try {
    const containerType = c.req.param('containerType')
    
    if (!containerTypeSchema.safeParse(containerType).success) {
      return c.json({ error: 'Invalid container type' }, 400)
    }

    const body = await c.req.json()
    const { unitId } = z.object({ unitId: z.number().int().positive() }).parse(body)

    // Verify unit exists
    const unitRecord = await db.select().from(unit).where(eq(unit.id, unitId)).get()
    if (!unitRecord) {
      return c.json({ error: 'Unit not found' }, 404)
    }

    await db.insert(containerTypeUnit).values({
      containerType: containerType as any,
      unitId,
    }).onConflictDoNothing()

    return c.json({ success: true, unitId })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Invalid input', details: error.issues }, 400)
    }
    console.error('Error adding unit:', error)
    return c.json({ error: 'Failed to add unit' }, 500)
  }
})

// DELETE /api/settings/container-types/:containerType/units/:unitId - Remove allowed unit
settings.delete('/container-types/:containerType/units/:unitId', async (c) => {
  try {
    const containerType = c.req.param('containerType')
    const unitId = parseInt(c.req.param('unitId'))
    
    if (!containerTypeSchema.safeParse(containerType).success) {
      return c.json({ error: 'Invalid container type' }, 400)
    }

    if (isNaN(unitId)) {
      return c.json({ error: 'Invalid unit ID' }, 400)
    }

    await db
      .delete(containerTypeUnit)
      .where(
        and(
          eq(containerTypeUnit.containerType, containerType as any),
          eq(containerTypeUnit.unitId, unitId)
        )
      )

    return c.json({ success: true })
  } catch (error) {
    console.error('Error removing unit:', error)
    return c.json({ error: 'Failed to remove unit' }, 500)
  }
})

// GET /api/settings/units/container-types/:containerType - Get all units allowed for a container type (alias for above)
settings.get('/units/container-types/:containerType', async (c) => {
  try {
    const containerType = c.req.param('containerType')
    
    if (!containerTypeSchema.safeParse(containerType).success) {
      return c.json({ error: 'Invalid container type' }, 400)
    }

    const relationships = await db
      .select({
        id: unit.id,
        symbol: unit.symbol,
        name: unit.name,
        category: unit.category,
      })
      .from(containerTypeUnit)
      .innerJoin(unit, eq(containerTypeUnit.unitId, unit.id))
      .where(eq(containerTypeUnit.containerType, containerType as any))

    return c.json({ units: relationships })
  } catch (error) {
    console.error('Error fetching units:', error)
    return c.json({ error: 'Failed to fetch units' }, 500)
  }
})

export default settings

