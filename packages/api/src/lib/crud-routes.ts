import { Hono } from 'hono'
import { eq, and, ne, sql, SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { InferSelectModel } from 'drizzle-orm'
import type { Database } from '../db/client'
import { handleRouteError, NotFoundError, ConflictError, ValidationError } from './error-handler'
import { listResponse, successResponse, createdResponse } from './response-helpers'
import { createAdminMiddleware, createAuthMiddleware } from '../middleware/auth'

export interface CrudRouteConfig<
  TTable extends SQLiteTable,
  TCreate,
  TUpdate = Partial<TCreate>,
  TSelect = InferSelectModel<TTable>,
  TListOutput = TSelect,
  TDetailOutput = TSelect
> {
  /**
   * The database table
   */
  table: TTable
  
  /**
   * The database instance (required)
   */
  database: Database
  
  /**
   * Entity name for error messages (e.g., "State", "Specimen Type")
   */
  entityName: string
  
  /**
   * Plural entity name for list responses (e.g., "states", "specimenTypes")
   */
  pluralName: string
  
  /**
   * Singular entity name for detail responses (e.g., "state", "specimenType")
   */
  singularName: string
  
  /**
   * Zod schema for creating new entities
   */
  createSchema: z.ZodSchema<TCreate>
  
  /**
   * Zod schema for updating entities
   * If not provided, will use createSchema (caller should make fields optional)
   */
  updateSchema?: z.ZodType<TUpdate>
  
  /**
   * Optional: Transform list response
   */
  transformList?: (item: TSelect) => TListOutput
  
  /**
   * Optional: Transform detail response
   */
  transformDetail?: (item: TSelect) => TDetailOutput
  
  /**
   * Optional: Custom order by clause (defaults to name field)
   */
  orderBy?: any
  
  /**
   * Optional: Check if entity is in use before deletion
   * Returns error message if in use, null if safe to delete
   */
  checkInUse?: (id: number, database: Database) => Promise<string | null>
  
  /**
   * Optional: Additional fields to set on create
   */
  onCreateDefaults?: (data: TCreate) => Record<string, unknown>
  
  /**
   * Optional: Additional fields to set on update
   */
  onUpdateDefaults?: (data: TUpdate) => Record<string, unknown>
  
  /**
   * Optional: Custom validation before create
   */
  validateCreate?: (data: TCreate, database: Database) => Promise<string | null>
  
  /**
   * Optional: Custom validation before update
   */
  validateUpdate?: (id: number, data: TUpdate, database: Database) => Promise<string | null>
}

/**
 * Creates a generic CRUD route handler for reference data tables
 */
export function createCrudRoutes<
  TTable extends SQLiteTable,
  TCreate,
  TUpdate = Partial<TCreate>,
  TSelect = InferSelectModel<TTable>,
  TListOutput = TSelect,
  TDetailOutput = TSelect
>(
  config: CrudRouteConfig<TTable, TCreate, TUpdate, TSelect, TListOutput, TDetailOutput>
): Hono {
  const {
    table,
    database,
    entityName,
    pluralName,
    singularName,
    createSchema,
    updateSchema: providedUpdateSchema,
    transformList,
    transformDetail,
    orderBy,
    checkInUse,
    onCreateDefaults,
    onUpdateDefaults,
    validateCreate,
    validateUpdate,
  } = config
  
  const updateSchema = (providedUpdateSchema || createSchema) as z.ZodType<TUpdate>

  const routes = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const adminMiddleware = createAdminMiddleware(database)

  // GET / - List all
  routes.get('/', authMiddleware, async (c) => {
    try {
      let query = database.select().from(table)
      
      if (orderBy) {
        query = query.orderBy(orderBy) as any
      } else {
        // Default: order by name if it exists
        const nameField = (table as any).name
        if (nameField) {
          query = query.orderBy(nameField) as any
        }
      }
      
      const items = await query
      const transformed = transformList 
        ? items.map(item => transformList(item as TSelect))
        : items

      return listResponse(c, transformed as TListOutput[])
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // GET /:id - Get one
  routes.get('/:id', authMiddleware, async (c) => {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: `Invalid ${entityName} ID` }, 400)
    }

    try {
      const item = await database
        .select()
        .from(table)
        .where(eq((table as any).id, id))
        .get()

      if (!item) {
        throw new NotFoundError(entityName, id)
      }

      const transformed = transformDetail ? transformDetail(item as TSelect) : item
      return successResponse(c, transformed as TDetailOutput)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // POST / - Create (admin only)
  routes.post('/', adminMiddleware, async (c) => {
    try {
      const body = await c.req.json()
      const data = createSchema.parse(body)

      // Custom validation
      if (validateCreate) {
        const validationError = await validateCreate(data, database)
        if (validationError) {
          throw new ValidationError(validationError)
        }
      }

      // Check for duplicate name (if name field exists)
      const nameField = (table as any).name
      if (nameField && (data as any).name) {
        const existing = await database
          .select()
          .from(table)
          .where(eq(nameField, (data as any).name))
          .get()

        if (existing) {
          throw new ConflictError(`${entityName} with this name already exists`)
        }
      }

      // Prepare insert data
      const insertData = { ...data } as Record<string, unknown>
      if (onCreateDefaults) {
        Object.assign(insertData, onCreateDefaults(data))
      }

      // Set created_by from user context if available and table has the field
      const user = c.get('user')
      const createdByField = (table as any).createdBy
      if (user && createdByField) {
        insertData.createdBy = user.id
      }

      const result = await database
        .insert(table)
        .values(insertData as any)
        .returning()

      const transformed = transformDetail ? transformDetail(result[0] as TSelect) : result[0]
      return createdResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // PUT /:id - Update (admin only)
  routes.put('/:id', adminMiddleware, async (c) => {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: `Invalid ${entityName} ID` }, 400)
    }

    try {
      const body = await c.req.json()
      const data = updateSchema.parse(body)

      // Check if entity exists
      const existing = await database
        .select()
        .from(table)
        .where(eq((table as any).id, id))
        .get()

      if (!existing) {
        throw new NotFoundError(entityName, id)
      }

      // Custom validation
      if (validateUpdate) {
        const validationError = await validateUpdate(id, data, database)
        if (validationError) {
          throw new ValidationError(validationError)
        }
      }

      // Check for duplicate name (excluding current entity)
      const nameField = (table as any).name
      if (nameField && (data as any).name) {
        const duplicate = await database
          .select()
          .from(table)
          .where(and(
            eq(nameField, (data as any).name),
            ne((table as any).id, id)
          ))
          .get()

        if (duplicate) {
          throw new ConflictError(`${entityName} with this name already exists`)
        }
      }

      // Prepare update data
      const updateData = { ...data } as Record<string, unknown>
      if (onUpdateDefaults) {
        Object.assign(updateData, onUpdateDefaults(data))
      }

      // Set updated_by from user context if available and table has the field
      const user = c.get('user')
      const updatedByField = (table as any).updatedBy
      if (user && updatedByField) {
        updateData.updatedBy = user.id
      }

      const result = await database
        .update(table)
        .set(updateData as any)
        .where(eq((table as any).id, id))
        .returning()

      const transformed = transformDetail ? transformDetail(result[0] as TSelect) : result[0]
      return successResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // DELETE /:id - Delete (admin only)
  routes.delete('/:id', adminMiddleware, async (c) => {
    const id = parseInt(c.req.param('id'))
    
    if (isNaN(id)) {
      return c.json({ error: `Invalid ${entityName} ID` }, 400)
    }

    try {
      // Check if in use
      if (checkInUse) {
        const inUseError = await checkInUse(id, database)
        if (inUseError) {
          throw new ValidationError(inUseError)
        }
      }

      const result = await database
        .delete(table)
        .where(eq((table as any).id, id))
        .returning()

      if (result.length === 0) {
        throw new NotFoundError(entityName, id)
      }

      return c.json({ message: `${entityName} deleted successfully` })
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  return routes
}

