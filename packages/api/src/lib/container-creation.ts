import type { Database } from '../db/client'
import type { ContainerWriteInput } from '@sampledb/contract'
import type { DatabaseOrTransaction } from './db-types'
import { registerSpecimens, SpecimenRegistrationError } from './specimen-registration'

export type ContainerType = 'micronix_tube' | 'cryovial_tube' | 'paper' | 'static_well'

export type ContainerQuantity = {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

export function pickContainerQuantity(src: ContainerQuantity): ContainerQuantity | undefined {
  const quantity: ContainerQuantity = {
    ...(src.unitId != null ? { unitId: src.unitId } : {}),
    ...(src.totalQuantity != null ? { totalQuantity: src.totalQuantity } : {}),
    ...(src.remainingQuantity != null ? { remainingQuantity: src.remainingQuantity } : {}),
  }
  return Object.keys(quantity).length > 0 ? quantity : undefined
}

export type CreateContainerForSpecimenOptions = {
  userId?: number
  quantity?: ContainerQuantity
}

/**
 * Add one Container to an existing Specimen through Specimen registration.
 * Callers not yet migrated to registerSpecimens use this; it reports the first problem.
 */
export async function createContainerForSpecimen(
  specimenId: number,
  data: ContainerWriteInput,
  database: DatabaseOrTransaction,
  options?: CreateContainerForSpecimenOptions | number
): Promise<{ success: boolean; containerId?: number; error?: string }> {
  const opts: CreateContainerForSpecimenOptions =
    typeof options === 'number' ? { userId: options } : (options ?? {})
  try {
    const result = await registerSpecimens(
      database as Database,
      [{ specimenId, containers: [{ ...data, ...opts.quantity }] }],
      { userId: opts.userId }
    )
    return { success: true, containerId: result.entries[0]?.containerIds[0] }
  } catch (error) {
    if (error instanceof SpecimenRegistrationError) {
      return { success: false, error: error.message }
    }
    throw error
  }
}
