import type { Database } from '../../db/client'
import { controlBatch, controlDefinition } from '../../db/schema'
import { eq, and } from 'drizzle-orm'
import { validateControlBatchName, generateUniqueBatchName } from '../validation'
import { NotFoundError, ValidationError } from '../error-handler'
import type { CreateBloodControlBatchInput } from './batch-schemas'

function isUniqueConstraintError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  const err = error as Error & { code?: string }
  return err.message.includes('UNIQUE constraint') || err.code === 'SQLITE_CONSTRAINT_UNIQUE'
}

/** Create an empty blood control batch for a definition. */
export async function createBloodControlBatch(
  database: Database,
  definitionId: number,
  input: CreateBloodControlBatchInput,
  userId?: number,
) {
  const definition = await database
    .select()
    .from(controlDefinition)
    .where(and(eq(controlDefinition.id, definitionId), eq(controlDefinition.controlType, 'blood')))
    .get()

  if (!definition) {
    throw new NotFoundError('Blood control definition', definitionId)
  }

  let batchName: string
  if (input.name) {
    const nameValidation = await validateControlBatchName(database, input.name)
    if (!nameValidation.valid) {
      throw new ValidationError(nameValidation.error || 'Batch name must be unique', {
        suggestion: nameValidation.suggestion,
      })
    }
    batchName = input.name
  } else {
    batchName = await generateUniqueBatchName(database, definition.name, input.productionDate)
  }

  try {
    const [newBatch] = await database
      .insert(controlBatch)
      .values({
        controlDefinitionId: definitionId,
        name: batchName,
        productionDate: input.productionDate || null,
        properties: input.properties ? JSON.stringify(input.properties) : null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()

    if (!newBatch) {
      throw new Error('Insert did not return control batch row')
    }
    return newBatch
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      const suggestion = await generateUniqueBatchName(database, definition.name, input.productionDate).catch(
        () => undefined,
      )
      throw new ValidationError('Batch name already exists', { suggestion })
    }
    throw error
  }
}
