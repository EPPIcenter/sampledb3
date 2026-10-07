/**
 * Specimen registration (CONTEXT.md, ADR 0010): record Specimens from a known Source with
 * their Containers and placement, all or nothing. The check is the same write, rolled back,
 * so a registration that passes the check succeeds when written.
 */
import type { Database } from '../../db/client'
import { withRolledBackTransaction, withWriteTransaction } from '../../db/write-transaction'
import { planRegistration } from './plan'
import { writeRegistration } from './write'
import {
  SpecimenRegistrationError,
  type RegistrationEntry,
  type RegistrationError,
  type RegistrationOptions,
  type RegistrationResult,
} from './types'

export * from './types'
export { validateContainerWriteFields } from './container-fields'

/**
 * Register every entry, or nothing. Throws SpecimenRegistrationError listing every problem
 * (400), or the constraint a write hit (409). Inside an open transaction, joins it.
 */
export async function registerSpecimens(
  database: Database,
  entries: RegistrationEntry[],
  options: RegistrationOptions = {},
): Promise<RegistrationResult> {
  return withWriteTransaction(database, async (db) => {
    const { plan, errors } = await planRegistration(db, entries)
    if (errors.length > 0) throw new SpecimenRegistrationError(400, errors)
    return writeRegistration(db, plan, options.userId)
  })
}

/** Run registerSpecimens and roll it back, returning the errors it found (none if it would succeed). */
export async function checkSpecimenRegistration(
  database: Database,
  entries: RegistrationEntry[],
  options: RegistrationOptions = {},
): Promise<RegistrationError[]> {
  return withRolledBackTransaction(database, async (db) => {
    try {
      await registerSpecimens(db, entries, options)
      return []
    } catch (error) {
      if (error instanceof SpecimenRegistrationError) return error.errors
      throw error
    }
  })
}
