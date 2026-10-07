import type { ContainerWriteInput } from '@sampledb/contract'
import type { Specimen } from '../../db/schema'

/** A container to register: the unified write shape plus optional unit and quantity overrides. */
export type RegistrationContainer = ContainerWriteInput & {
  unitId?: number
  totalQuantity?: number
  remainingQuantity?: number
}

/** Where the specimen's material came from, already resolved to a record id. */
export type RegistrationSource = { subjectId: number } | { controlBatchId: number }

/**
 * One collection event and its containers. Name the Source, specimen type, and date to find or
 * create the Specimen, or name an existing Specimen to add containers (aliquots) to it.
 */
export type RegistrationEntry =
  | {
      source: RegistrationSource
      specimenTypeId: number
      /** Optional; validated and normalized to YYYY-MM-DD. */
      collectionDate?: string
      containers: RegistrationContainer[]
    }
  | {
      specimenId: number
      containers: RegistrationContainer[]
    }

export type RegistrationOptions = {
  userId?: number
}

/** Keyed to the input: entries[entryIndex].containers[containerIndex]. */
export type RegistrationError = {
  entryIndex: number
  containerIndex?: number
  field?: string
  message: string
}

export type RegisteredEntry = {
  specimen: Specimen
  /** True when the Specimen existed before this entry, in the database or from an earlier entry. */
  reused: boolean
  containerIds: number[]
}

export type RegisteredCollectionType = 'micronix_plate' | 'cryovial_box' | 'box' | 'bag' | 'sheet'

export type CreatedCollection = {
  type: RegisteredCollectionType
  id: number
  name: string
}

export type RegistrationResult = {
  entries: RegisteredEntry[]
  collectionsCreated: CreatedCollection[]
}

/**
 * A write refused with every problem found, keyed however the caller keys its input.
 * Status 400: the input has problems, all listed. Status 409: a write hit a database constraint
 * the plan did not foresee (for example a concurrent registration).
 */
export class RefusedWithErrors<E extends { message: string }> extends Error {
  constructor(
    readonly status: 400 | 409,
    readonly errors: E[],
  ) {
    super(errors[0]?.message ?? 'Request refused')
    this.name = new.target.name
  }
}

/** Registration refused; errors are keyed to the registration's entries. */
export class SpecimenRegistrationError extends RefusedWithErrors<RegistrationError> {}
