import { Hono } from 'hono'
import type { Database } from '../db/client'
import {
  controlDefinition,
  controlBatch,
  unit,
} from '../db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { z } from 'zod'
import { parseControlProperties } from '../lib/control-properties'
import { validateControlBatchName, generateUniqueBatchName } from '../lib/validation'
import { generateControlDefinitionName, generateUniqueControlDefinitionName } from '../lib/control-name-generation'
import { handleRouteError } from '../lib/error-handler'
import type { BloodControlProperties } from '../types/properties'
import { createAuthMiddleware, createMemberMiddleware } from '../middleware/auth'
import { utcNow } from '../lib/datetime'
import { requireParam } from '../lib/common-validators'
import { deleteBloodControlBatch, deleteSpecimenFromBatch } from '../lib/controls/batch-delete'
import { createBloodControlBatch } from '../lib/controls/batch-create'
import { validateControlBatchCsv } from '../lib/controls/batch-csv-validate'
import {
  createBloodControlBatchSchema,
  createBatchWithSpecimensSchema,
  addSpecimensToBatchSchema,
  validateControlBatchCsvSchema,
} from '../lib/controls/batch-schemas'
import {
  createBatchWithSpecimens,
  addSpecimensToBatch,
} from '../lib/controls/batch-with-specimens'
import { getBloodControlBatchSummary } from '../lib/controls/batch-summary'
import { getBloodControlDefinitionSummary } from '../lib/controls/definition-summary'
import {
  getBloodControlBatch,
  getBloodControlDefinition,
  listBatchesForBloodControlDefinition,
  listBloodControlBatches,
  listBloodControlDefinitions,
} from '../lib/controls/control-read'
import {
  strainCompositionEntrySchema,
  resolveStrainComposition,
  findBloodControlDefinitionByComposition,
  findMatchingDefinitionInList,
  buildBloodControlPropertiesPayload,
} from '../lib/controls/strain-composition'

/**
 * Create controls routes with database injection
 * @param database - Database instance (required)
 */
export function createControlsRoutes(database: Database): Hono {
  const dbInstance = database
  const controls = new Hono()
  const authMiddleware = createAuthMiddleware(database)
  const memberMiddleware = createMemberMiddleware(database)

  // --- Control Batches ---

// List all control batches
controls.get('/batches', authMiddleware, async (c) => {
  try {
    const result = await listBloodControlBatches(dbInstance)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get batch detail (only for blood control batches)
controls.get('/batches/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

    const result = await getBloodControlBatch(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update batch (rename, change production date, etc.)
controls.patch('/batches/:id', memberMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  try {
    const batchWithDefinition = await dbInstance
      .select({ batch: controlBatch, definition: controlDefinition })
      .from(controlBatch)
      .leftJoin(controlDefinition, eq(controlBatch.controlDefinitionId, controlDefinition.id))
      .where(and(eq(controlBatch.id, id), eq(controlDefinition.controlType, 'blood')))
      .get()

    if (!batchWithDefinition) {
      return c.json({ error: 'Blood control batch not found' }, 404)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).max(255).optional(),
      productionDate: z.string().optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })
    const data = schema.parse(body)

    if (data.name) {
      const validation = await validateControlBatchName(dbInstance, data.name, id)
      if (!validation.valid) {
        return c.json({ error: validation.error, suggestion: validation.suggestion }, 400)
      }
    }

    const user = c.get('user')
    const updates: Record<string, unknown> = {
      lastUpdated: utcNow(),
      updatedBy: user?.id,
    }
    if (data.name !== undefined) updates.name = data.name
    if (data.productionDate !== undefined) updates.productionDate = data.productionDate
    if (data.properties !== undefined) updates.properties = data.properties

    const [updated] = await dbInstance
      .update(controlBatch)
      .set(updates)
      .where(eq(controlBatch.id, id))
      .returning()

    return c.json({ batch: updated })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete batch and all associated data
controls.delete('/batches/:id', memberMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

  try {
    await deleteBloodControlBatch(dbInstance, id)
    return c.json({ message: 'Batch deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get batch summary with enriched specimen data
controls.get('/batches/:id/summary', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid batch ID' }, 400)

    const result = await getBloodControlBatchSummary(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// --- Control Definitions ---// --- Control Definitions ---

// List all control definitions (filtered to blood controls)
controls.get('/', authMiddleware, async (c) => {
  try {
    const result = await listBloodControlDefinitions(dbInstance)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get control definition by ID (filtered to blood controls)
controls.get('/:id', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) {
      return c.json({ error: 'Invalid blood control ID' }, 400)
    }

    const result = await getBloodControlDefinition(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Get control definition summary with composition and batches
controls.get('/:id/summary', authMiddleware, async (c) => {
  const id = parseInt(requireParam(c, 'id'))
  if (isNaN(id)) return c.json({ error: 'Invalid control ID' }, 400)

  try {
    const result = await getBloodControlDefinitionSummary(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Check for duplicate control definition (only checks blood controls)
controls.post('/check-unique', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema).optional(),
    })

    const data = schema.parse(body)
    const existing = await findBloodControlDefinitionByComposition(dbInstance, {
      strains: data.strains ?? [],
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
    }, { densityMode: 'optional' })

    if (existing) {
      return c.json({ exists: true, controlDefinition: existing })
    }
    return c.json({ exists: false })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Suggest name for control definition (preview without creating)
controls.post('/suggest-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const controlType = 'blood'

    const resolved = await resolveStrainComposition(dbInstance, data.strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, controlType))

    const existingMatch = findMatchingDefinitionInList(allDefinitions, {
      strains: data.strains,
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
    })

    const suggestedName = await generateUniqueControlDefinitionName(dbInstance, {
      controlType,
      targetDensity: data.targetDensity,
      targetDensityUnitId: data.targetDensityUnitId,
      strains: strainsWithNames,
    })

    return c.json({
      suggestedName,
      exists: existingMatch !== null,
      existingDefinition: existingMatch?.definition,
    })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Find control definition by composition + density (lookup only; 404 when no match)
controls.post('/definitions/find', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      strains: z.array(strainCompositionEntrySchema),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
    })
    const data = schema.parse(body)
    const { strains, targetDensity, targetDensityUnitId } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainNameMap } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, 'blood'))

    const match = findMatchingDefinitionInList(allDefinitions, {
      strains,
      targetDensity,
      targetDensityUnitId,
    })

    if (match) {
      const parsed = parseControlProperties(match.properties, strainNameMap)
      return c.json({
        control: {
          ...match.definition,
          strains: parsed.strains,
          targetDensity: parsed.targetDensity,
          targetDensityUnitId: parsed.targetDensityUnitId,
          unitSymbol: parsed.unitSymbol,
        },
      })
    }

    return c.json(
      { error: 'No control definition found for this composition and density. Create it first from Blood Controls.' },
      404,
    )
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Bulk create or get control definitions (same composition, multiple densities)
controls.post('/definitions/bulk', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      strains: z.array(strainCompositionEntrySchema),
      targetDensities: z.array(z.number()).min(1),
      targetDensityUnitId: z.number().int().optional(),
      names: z.array(z.string()),
    }).refine((d) => d.names.length === d.targetDensities.length, {
      message: 'names length must match targetDensities length',
    })
    const data = schema.parse(body)
    const controlType = 'blood'
    const { strains, targetDensities, targetDensityUnitId } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames, strainNameMap } = resolved

    const allDefinitions = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.controlType, controlType))

    const user = c.get('user')
    const results: Array<ReturnType<typeof parseControlProperties> & { id: number; name: string; controlType: string; properties: unknown; created: string | null; lastUpdated: string | null; createdBy: number | null; updatedBy: number | null }> = []
    const providedNames = data.names

    for (let i = 0; i < targetDensities.length; i++) {
      const targetDensity = targetDensities[i]
      const existing = findMatchingDefinitionInList(allDefinitions, {
        strains,
        targetDensity,
        targetDensityUnitId,
      })
      if (existing) {
        const parsed = parseControlProperties(existing.properties, strainNameMap)
        results.push({
          ...existing.definition,
          strains: parsed.strains,
          targetDensity: parsed.targetDensity,
          targetDensityUnitId: parsed.targetDensityUnitId,
          unitSymbol: parsed.unitSymbol,
        })
        continue
      }

      let unitSymbol: string | undefined
      if (targetDensityUnitId !== undefined) {
        const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
        if (!unitRecord) return c.json({ error: `Invalid unit ID: ${targetDensityUnitId}` }, 400)
        unitSymbol = unitRecord.symbol
      }

      const props = buildBloodControlPropertiesPayload(
        strainsWithNames,
        targetDensity,
        targetDensityUnitId,
        unitSymbol,
      )

      let finalName: string
      const customName = providedNames[i]?.trim()
      if (customName) {
        const existingByName = await dbInstance
          .select({ id: controlDefinition.id })
          .from(controlDefinition)
          .where(eq(controlDefinition.name, customName))
          .get()
        if (existingByName) {
          return c.json({ error: `Control definition name "${customName}" is already in use` }, 400)
        }
        finalName = customName
      } else {
        finalName = await generateUniqueControlDefinitionName(dbInstance, {
          controlType,
          targetDensity,
          targetDensityUnitId,
          strains: strainsWithNames,
        })
      }
      const [newControl] = await dbInstance
        .insert(controlDefinition)
        .values({
          name: finalName,
          controlType,
          properties: props,
          createdBy: user?.id,
          updatedBy: user?.id,
        })
        .returning()
      const parsed = parseControlProperties(newControl.properties, strainNameMap)
      results.push({
        ...newControl,
        strains: parsed.strains,
        targetDensity: parsed.targetDensity,
        targetDensityUnitId: parsed.targetDensityUnitId,
        unitSymbol: parsed.unitSymbol,
      })
    }

    return c.json({ controls: results }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create control definition (defaults to blood)
controls.post('/', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional().default('blood'),
      targetDensity: z.number(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const controlType = 'blood'
    const { strains, targetDensity, targetDensityUnitId, properties, name } = data

    const resolved = await resolveStrainComposition(dbInstance, strains)
    if (!resolved.ok) {
      return c.json({ error: resolved.error }, 400)
    }
    const { strainsWithNames } = resolved

    const duplicate = await findBloodControlDefinitionByComposition(dbInstance, {
      strains,
      targetDensity,
      targetDensityUnitId,
    })
    if (duplicate) {
      return c.json({
        error: 'A control definition with this combination of density and strains already exists',
        existingDefinition: duplicate,
      }, 409)
    }

    const props: Record<string, unknown> = { ...(properties || {}) }
    let unitSymbol: string | undefined
    if (targetDensityUnitId !== undefined) {
      const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
      if (!unitRecord) {
        return c.json({ error: `Invalid unit ID: ${targetDensityUnitId}` }, 400)
      }
      unitSymbol = unitRecord.symbol
    }
    Object.assign(
      props,
      buildBloodControlPropertiesPayload(strainsWithNames, targetDensity, targetDensityUnitId, unitSymbol),
    )

    let finalName = name
    if (!finalName || finalName.trim() === '') {
      finalName = await generateUniqueControlDefinitionName(dbInstance, {
        controlType,
        targetDensity,
        targetDensityUnitId,
        strains: strainsWithNames,
      })
    } else {
      const existingByName = await dbInstance
        .select()
        .from(controlDefinition)
        .where(eq(controlDefinition.name, finalName))
        .get()
      if (existingByName) {
        return c.json({ error: 'A control definition with this name already exists' }, 409)
      }
    }

    const user = c.get('user')
    const result = await dbInstance
      .insert(controlDefinition)
      .values({
        name: finalName,
        controlType,
        properties: Object.keys(props).length > 0 ? props : null,
        createdBy: user?.id,
        updatedBy: user?.id,
      })
      .returning()

    const newControl = result[0]
    if (!newControl) {
      throw new Error('Insert did not return control definition row')
    }
    return c.json({ control: newControl }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Update control definition (only blood controls)
controls.patch('/:id', memberMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

    // Get existing control to merge properties (filtered to blood controls)
    const existing = await dbInstance
      .select()
      .from(controlDefinition)
      .where(and(
        eq(controlDefinition.id, id),
        eq(controlDefinition.controlType, 'blood')
      ))
      .get()
    
    if (!existing) {
      return c.json({ error: 'Blood control definition not found' }, 404)
    }

    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1).optional(),
      controlType: z.enum(['blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative']).optional(),
      targetDensity: z.number().optional(),
      targetDensityUnitId: z.number().int().optional(),
      strains: z.array(strainCompositionEntrySchema).optional(),
      properties: z.record(z.string(), z.any()).optional(),
    })

    const data = schema.parse(body)
    const { strains, targetDensity, targetDensityUnitId, properties, ...baseData } = data

    const existingProps = (existing.properties as Record<string, unknown>) || {}
    const newProps: Record<string, unknown> = { ...existingProps, ...(properties || {}) }

    if (strains !== undefined) {
      if (strains.length > 0) {
        const resolved = await resolveStrainComposition(dbInstance, strains)
        if (!resolved.ok) {
          return c.json({ error: resolved.error }, 400)
        }
        newProps.strains = resolved.strainsWithNames
      } else {
        delete newProps.strains
      }
    }
    if (targetDensity !== undefined) {
      newProps.targetDensity = targetDensity
    }
    if (targetDensityUnitId !== undefined) {
      newProps.targetDensityUnitId = targetDensityUnitId
      const unitRecord = await dbInstance.select().from(unit).where(eq(unit.id, targetDensityUnitId)).get()
      if (unitRecord) {
        newProps.targetDensityUnitSymbol = unitRecord.symbol
      }
    }

    // Update control definition
    const user = c.get('user')
    const [updatedControl] = await dbInstance
      .update(controlDefinition)
      .set({
        ...baseData,
        properties: Object.keys(newProps).length > 0 ? newProps : null,
        lastUpdated: sql`current_timestamp`,
        updatedBy: user?.id,
      })
      .where(eq(controlDefinition.id, id))
      .returning()

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime invariant per avoid-masking-bugs: update must return row
    if (!updatedControl) {
      return c.json({ error: 'Blood control definition not found' }, 404)
    }
    return c.json({ control: updatedControl })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// List batches for a definition (filtered to blood controls)
controls.get('/:id/batches', authMiddleware, async (c) => {
  try {
    const id = parseInt(requireParam(c, 'id'))
    if (isNaN(id)) return c.json({ error: 'Invalid blood control ID' }, 400)

    const result = await listBatchesForBloodControlDefinition(dbInstance, id)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate batch name
controls.post('/batches/validate-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      name: z.string().min(1),
      excludeId: z.number().optional(),
    })
    
    const data = schema.parse(body)
    const validation = await validateControlBatchName(database, data.name, data.excludeId)
    
    return c.json(validation)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Generate suggested batch name
controls.post('/batches/suggest-name', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const schema = z.object({
      definitionId: z.number(),
      productionDate: z.string().optional(),
    })
    
    const data = schema.parse(body)
    
    // Get definition
    const definition = await dbInstance
      .select()
      .from(controlDefinition)
      .where(eq(controlDefinition.id, data.definitionId))
      .get()
    
    if (!definition) {
      return c.json({ error: 'Control definition not found' }, 404)
    }
    
    const suggestedName = await generateUniqueBatchName(dbInstance, definition.name, data.productionDate)
    
    return c.json({ name: suggestedName })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create a new batch (only for blood controls)
controls.post('/:id/batches', memberMiddleware, async (c) => {
  const definitionId = parseInt(requireParam(c, 'id'))
  if (isNaN(definitionId)) return c.json({ error: 'Invalid blood control ID' }, 400)

  try {
    const body = await c.req.json()
    const data = createBloodControlBatchSchema.parse(body)
    const user = c.get('user')
    const batch = await createBloodControlBatch(dbInstance, definitionId, data, user?.id)
    return c.json({ batch }, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Create batch with specimens
controls.post('/batches/create-with-specimens', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const data = createBatchWithSpecimensSchema.parse(body)
    const result = await createBatchWithSpecimens(dbInstance, data)
    return c.json(result, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Add specimens to existing batch
controls.post('/batches/:id/specimens/bulk', memberMiddleware, async (c) => {
  try {
    const batchId = parseInt(requireParam(c, 'id'))
    if (isNaN(batchId)) return c.json({ error: 'Invalid batch ID' }, 400)

    const body = await c.req.json()
    const data = addSpecimensToBatchSchema.parse(body)
    const result = await addSpecimensToBatch(dbInstance, batchId, data)
    return c.json(result, 201)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Delete a single specimen from a batch
controls.delete('/batches/:batchId/specimens/:specimenId', memberMiddleware, async (c) => {
  const batchId = parseInt(requireParam(c, 'batchId'))
  const specimenId = parseInt(requireParam(c, 'specimenId'))
  if (isNaN(batchId) || isNaN(specimenId)) return c.json({ error: 'Invalid ID' }, 400)

  try {
    await deleteSpecimenFromBatch(dbInstance, batchId, specimenId)
    return c.json({ message: 'Specimen deleted successfully' })
  } catch (error) {
    return handleRouteError(error, c)
  }
})

// Validate CSV
controls.post('/batches/validate-csv', memberMiddleware, async (c) => {
  try {
    const body = await c.req.json()
    const { csvText } = validateControlBatchCsvSchema.parse(body)
    const result = await validateControlBatchCsv(dbInstance, csvText)
    return c.json(result)
  } catch (error) {
    return handleRouteError(error, c)
  }
})

  return controls
}
