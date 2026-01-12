import { Hono } from 'hono'
import { eq, and, ne, sql, SQL } from 'drizzle-orm'
import { z } from 'zod'
import type { SQLiteTable } from 'drizzle-orm/sqlite-core'
import type { Database } from '../db/client'
import { handleRouteError, NotFoundError, ConflictError, ValidationError } from './error-handler'
import { listResponse, successResponse, createdResponse } from './response-helpers'

export interface CrudRouteConfig<TTable extends SQLiteTable, TCreate, TUpdate = Partial<TCreate>> {
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
  transformList?: (item: any) => any
  
  /**
   * Optional: Transform detail response
   */
  transformDetail?: (item: any) => any
  
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
  onCreateDefaults?: (data: TCreate) => Record<string, any>
  
  /**
   * Optional: Additional fields to set on update
   */
  onUpdateDefaults?: (data: TUpdate) => Record<string, any>
  
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
export function createCrudRoutes<TTable extends SQLiteTable, TCreate, TUpdate = Partial<TCreate>>(
  config: CrudRouteConfig<TTable, TCreate, TUpdate>
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

  // GET / - List all
  routes.get('/', async (c) => {
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
        ? items.map(transformList)
        : items

      return listResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // GET /:id - Get one
  routes.get('/:id', async (c) => {
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

      const transformed = transformDetail ? transformDetail(item) : item
      return successResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // POST / - Create
  routes.post('/', async (c) => {
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
      const insertData: any = { ...data }
      if (onCreateDefaults) {
        Object.assign(insertData, onCreateDefaults(data))
      }

      const result = await database
        .insert(table)
        .values(insertData)
        .returning()

      const transformed = transformDetail ? transformDetail(result[0]) : result[0]
      return createdResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // PUT /:id - Update
  routes.put('/:id', async (c) => {
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
      const updateData: any = { ...data }
      if (onUpdateDefaults) {
        Object.assign(updateData, onUpdateDefaults(data))
      }

      const result = await database
        .update(table)
        .set(updateData)
        .where(eq((table as any).id, id))
        .returning()

      const transformed = transformDetail ? transformDetail(result[0]) : result[0]
      return successResponse(c, transformed)
    } catch (error) {
      return handleRouteError(error, c)
    }
  })

  // DELETE /:id - Delete
  routes.delete('/:id', async (c) => {
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

