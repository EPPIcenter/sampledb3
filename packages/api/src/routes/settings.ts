import { Hono } from 'hono'
import { z } from 'zod'
import type { Database } from '../db/client'
import { unit, containerTypeUnit } from '../db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { createAdminMiddleware, createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { UnauthorizedError, handleRouteError } from '../lib/error-handler'
import { clearDefaultsCache } from '../lib/defaults'
import {
  getContainerDefaults,
  setContainerDefaults,
  getPaginationSettings,
  setPaginationSettings,
  deleteUserSetting,
  getPasswordRequirements,
  setPasswordRequirements,
  getSessionSettings,
  setSessionSettings,
  getExportConfigurations,
  getSharedExportConfigurations,
  getPersonalExportConfigurations,
  setExportConfigurations,
  getScannerConfigurations,
  getSharedScannerConfigurations,
  getPersonalScannerConfigurations,
  setScannerConfigurations,
  getTableViewConfigurations,
  setTableViewConfigurations,
  clearSettingsCache,
  type ContainerDefaults,
  type PaginationSettings,
  type PasswordRequirements,
  type SessionSettings,
  type ExportConfigurations,
  type ScannerConfigurations,
  type TableViewConfigurations,
} from '../lib/settings'

export function createSettingsRoutes(database: Database) {
  const settings = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  // GET /api/settings - Get all settings (user-aware)
  settings.get('/', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id

      const [containerDefaults, paginationSettings, passwordRequirements, sessionSettings, exportConfigurations, scannerConfigurations, tableViewConfigurations] = await Promise.all([
        getContainerDefaults(database),
        getPaginationSettings(database, userId),
        getPasswordRequirements(database),
        getSessionSettings(database),
        getExportConfigurations(database, userId),
        getScannerConfigurations(database, userId),
        getTableViewConfigurations(database),
      ])

    return c.json({
      container_defaults: containerDefaults,
      pagination_settings: paginationSettings,
      password_requirements: passwordRequirements,
      session_settings: sessionSettings,
      export_configurations: exportConfigurations,
      scanner_configurations: scannerConfigurations,
      table_view_configurations: tableViewConfigurations,
    })
  } catch (error: unknown) {
    return c.json({ error: 'Internal server error' }, 500)
  }
})

  // GET /api/settings/units - Get all available units
  settings.get('/units', authMiddleware, async (c) => {
    try {
      const units = await database
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

  // GET /api/settings/:key - Get specific setting (user-aware)
  settings.get('/:key', authMiddleware, async (c) => {
    try {
      const key = c.req.param('key')
      const user = c.get('user')
      const userId = user?.id

      let value: unknown = null
      switch (key) {
        case 'container_defaults':
          value = await getContainerDefaults(database)
          break
        case 'pagination_settings':
          value = await getPaginationSettings(database, userId)
          break
        case 'password_requirements':
          value = await getPasswordRequirements(database)
          break
        case 'session_settings':
          value = await getSessionSettings(database)
          break
        case 'export_configurations':
          value = await getExportConfigurations(database, userId)
          break
        case 'scanner_configurations':
          value = await getScannerConfigurations(database, userId)
          break
        case 'table_view_configurations':
          value = await getTableViewConfigurations(database)
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

const tableViewConfigurationsSchema = z.object({
  configurations: z.array(z.object({
    name: z.string().min(1),
    columns: z.array(z.string()).min(1),
    isDefault: z.boolean().optional(),
  })),
})

  // PUT /api/settings/:key - Update a specific setting
  // Admin users can set system-wide (userId = null) or user-specific settings
  // Non-admin users can only set their own user-specific settings (for allowed keys)
  settings.put('/:key', memberMiddleware, async (c) => {
  try {
    const key = c.req.param('key')
    const body = await c.req.json()
    const user = c.get('user')
    const userId = user?.id
    const isAdmin = user?.role === 'admin'
    
    // Determine if this should be system-wide or user-specific
    // Admins can specify userId in body to set for specific user, or omit for system-wide
    // Non-admins can only set user-specific settings for themselves
    const targetUserId = body.userId !== undefined ? body.userId : (isAdmin ? null : userId)
    const actualBody = { ...body }
    delete actualBody.userId // Remove userId from body before validation

    // Admin-only settings
    const adminOnlyKeys = ['container_defaults', 'password_requirements', 'session_settings', 'table_view_configurations']
    if (adminOnlyKeys.includes(key) && !isAdmin) {
      return c.json({ error: 'Forbidden: Admin access required' }, 403)
    }

    // Non-admins can only set user-specific settings for themselves
    if (!isAdmin && targetUserId !== userId) {
      return c.json({ error: 'Forbidden: Cannot modify settings for other users' }, 403)
    }

    switch (key) {
      case 'container_defaults': {
        const validated = containerDefaultsSchema.parse(actualBody)
        
        // Validate that all defaultUnitSymbol values exist in the unit table
        const unitSymbols = [
          validated.micronix_tube.defaultUnitSymbol,
          validated.cryovial_tube.defaultUnitSymbol,
          validated.paper.defaultUnitSymbol,
          validated.static_well.defaultUnitSymbol,
        ]
        
        const existingUnits = await database
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
        
        await setContainerDefaults(database, validated as ContainerDefaults)
        clearSettingsCache(database, 'container_defaults')
        clearDefaultsCache(database)
        return c.json({ key, value: validated })
      }
      case 'pagination_settings': {
        const validated = paginationSettingsSchema.parse(actualBody)
        await setPaginationSettings(database, validated as PaginationSettings, targetUserId ?? null)
        clearSettingsCache(database, 'pagination_settings', targetUserId)
        return c.json({ key, value: validated, userId: targetUserId })
      }
      case 'password_requirements': {
        const validated = passwordRequirementsSchema.parse(actualBody)
        await setPasswordRequirements(database, validated as PasswordRequirements)
        clearSettingsCache(database, 'password_requirements')
        return c.json({ key, value: validated })
      }
      case 'session_settings': {
        const validated = sessionSettingsSchema.parse(actualBody)
        await setSessionSettings(database, validated as SessionSettings)
        clearSettingsCache(database, 'session_settings')
        return c.json({ key, value: validated })
      }
      case 'export_configurations': {
        const validated = exportConfigurationsSchema.parse(actualBody)
        await setExportConfigurations(database, validated as ExportConfigurations, targetUserId ?? null)
        clearSettingsCache(database, 'export_configurations', targetUserId)
        return c.json({ key, value: validated, userId: targetUserId })
      }
      case 'scanner_configurations': {
        const validated = scannerConfigurationsSchema.parse(actualBody)
        await setScannerConfigurations(database, validated as ScannerConfigurations, targetUserId ?? null)
        clearSettingsCache(database, 'scanner_configurations', targetUserId)
        return c.json({ key, value: validated, userId: targetUserId })
      }
      case 'table_view_configurations': {
        const validated = tableViewConfigurationsSchema.parse(actualBody)
        await setTableViewConfigurations(database, validated as TableViewConfigurations)
        clearSettingsCache(database, 'table_view_configurations')
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

  // DELETE /api/settings/:key/user - Reset user-specific setting to system default
  settings.delete('/:key/user', authMiddleware, async (c) => {
    try {
      const key = c.req.param('key')
      const user = c.get('user')
      const userId = user?.id

      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }

      // Only allow resetting user-specific settings (not system settings)
      const userSpecificKeys = ['pagination_settings']
      if (!userSpecificKeys.includes(key)) {
        return c.json({ error: 'Cannot reset this setting' }, 400)
      }

      await deleteUserSetting(database, key, userId)
      clearSettingsCache(database, key, userId)
    
    return c.json({ success: true, message: 'Setting reset to system default' })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ error: 'Validation error', details: error.issues }, 400)
    }
    return handleRouteError(error, c)
  }
})

// Personal Export/Scanner Configuration Endpoints

  // GET /api/settings/export-configurations/shared - Get system-wide shared export configs
  settings.get('/export-configurations/shared', authMiddleware, async (c) => {
    try {
      const configs = await getSharedExportConfigurations(database)
      return c.json(configs)
    } catch (error: unknown) {
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  // GET /api/settings/export-configurations/personal - Get user's personal export configs
  settings.get('/export-configurations/personal', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }
      const configs = await getPersonalExportConfigurations(database, userId)
      return c.json(configs || { configurations: [] })
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  // POST /api/settings/export-configurations/personal - Create user personal export config
  settings.post('/export-configurations/personal', memberMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }

      const body = await c.req.json()
      const newConfig = exportConfigurationsSchema.shape.configurations.element.parse(body)

      // Get existing personal configs
      const existing = await getPersonalExportConfigurations(database, userId)
      const configs: ExportConfigurations = existing || { configurations: [] }

      // Add new config
      configs.configurations.push(newConfig)
      await setExportConfigurations(database, configs, userId)
      clearSettingsCache(database, 'export_configurations', userId)

    return c.json({ success: true, config: newConfig })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validation error', 
        details: error.issues 
      }, 400)
    }
    return handleRouteError(error, c)
  }
})

  // PUT /api/settings/export-configurations/personal - Update user personal export configs
  settings.put('/export-configurations/personal', memberMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }

      const validated = exportConfigurationsSchema.parse(await c.req.json())
      await setExportConfigurations(database, validated, userId)
      clearSettingsCache(database, 'export_configurations', userId)

    return c.json({ success: true, configurations: validated.configurations })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validation error', 
        details: error.issues 
      }, 400)
    }
    return handleRouteError(error, c)
  }
})

  // GET /api/settings/scanner-configurations/shared - Get system-wide shared scanner configs
  settings.get('/scanner-configurations/shared', authMiddleware, async (c) => {
    try {
      const configs = await getSharedScannerConfigurations(database)
      return c.json(configs)
    } catch (error: unknown) {
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  // GET /api/settings/scanner-configurations/personal - Get user's personal scanner configs
  settings.get('/scanner-configurations/personal', authMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }
      const configs = await getPersonalScannerConfigurations(database, userId)
      return c.json(configs || { configurations: [] })
    } catch (error: unknown) {
      if (error instanceof z.ZodError) {
        return c.json({ error: 'Validation error', details: error.issues }, 400)
      }
      return handleRouteError(error, c)
    }
  })

  // POST /api/settings/scanner-configurations/personal - Create user personal scanner config
  settings.post('/scanner-configurations/personal', memberMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }

      const body = await c.req.json()
      const newConfig = scannerConfigurationsSchema.shape.configurations.element.parse(body)

      // Get existing personal configs
      const existing = await getPersonalScannerConfigurations(database, userId)
      const configs: ScannerConfigurations = existing || { configurations: [] }

      // Add new config
      configs.configurations.push(newConfig)
      await setScannerConfigurations(database, configs, userId)
      clearSettingsCache(database, 'scanner_configurations', userId)

    return c.json({ success: true, config: newConfig })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validation error', 
        details: error.issues 
      }, 400)
    }
    return handleRouteError(error, c)
  }
})

  // PUT /api/settings/scanner-configurations/personal - Update user personal scanner configs
  settings.put('/scanner-configurations/personal', memberMiddleware, async (c) => {
    try {
      const user = c.get('user')
      const userId = user?.id
      if (!userId) {
        throw new UnauthorizedError('User not authenticated')
      }

      const validated = scannerConfigurationsSchema.parse(await c.req.json())
      await setScannerConfigurations(database, validated, userId)
      clearSettingsCache(database, 'scanner_configurations', userId)

    return c.json({ success: true, configurations: validated.configurations })
  } catch (error: unknown) {
    if (error instanceof z.ZodError) {
      return c.json({ 
        error: 'Validation error', 
        details: error.issues 
      }, 400)
    }
    return handleRouteError(error, c)
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

      const relationships = await database
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

  // POST /api/settings/container-types/:containerType/units - Add allowed unit for a container type (admin only)
  settings.post('/container-types/:containerType/units', adminMiddleware, async (c) => {
    try {
      const containerType = c.req.param('containerType')
      
      if (!containerTypeSchema.safeParse(containerType).success) {
        return c.json({ error: 'Invalid container type' }, 400)
      }

      const body = await c.req.json()
      const { unitId } = z.object({ unitId: z.number().int().positive() }).parse(body)

      // Verify unit exists
      const unitRecord = await database.select().from(unit).where(eq(unit.id, unitId)).get()
      if (!unitRecord) {
        return c.json({ error: 'Unit not found' }, 404)
      }

      await database.insert(containerTypeUnit).values({
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

  // DELETE /api/settings/container-types/:containerType/units/:unitId - Remove allowed unit (admin only)
  settings.delete('/container-types/:containerType/units/:unitId', adminMiddleware, async (c) => {
    try {
      const containerType = c.req.param('containerType')
      const unitId = parseInt(c.req.param('unitId'))
      
      if (!containerTypeSchema.safeParse(containerType).success) {
        return c.json({ error: 'Invalid container type' }, 400)
      }

      if (isNaN(unitId)) {
        return c.json({ error: 'Invalid unit ID' }, 400)
      }

      const deleted = await database
        .delete(containerTypeUnit)
        .where(
          and(
            eq(containerTypeUnit.containerType, containerType as any),
            eq(containerTypeUnit.unitId, unitId)
          )
        )
        .returning()

      if (deleted.length === 0) {
        return c.json({ error: 'Unit association not found' }, 404)
      }
      return c.json({ success: true })
    } catch (error) {
      console.error('Error removing unit:', error)
      return c.json({ error: 'Failed to remove unit' }, 500)
    }
  })

  // GET /api/settings/units/container-types/:containerType - Get all units allowed for a container type (alias for above)
  settings.get('/units/container-types/:containerType', authMiddleware, async (c) => {
    try {
      const containerType = c.req.param('containerType')
      
      if (!containerTypeSchema.safeParse(containerType).success) {
        return c.json({ error: 'Invalid container type' }, 400)
      }

      const relationships = await database
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

  return settings
}

