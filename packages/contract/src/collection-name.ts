/**
 * The name a new Collection gets, shared by every path that creates one from an import:
 * Specimen registration's planner, the bulk import wizard, and the Derivations bulk import.
 *
 * A Collection given a name keeps it. One given only a barcode is named after the barcode, so
 * the same barcode yields the same Collection name whichever import creates it, and a later
 * import that names the Collection by that barcode finds it instead of creating a second one.
 */

export type NewCollectionIdentifiers = {
  name?: string | null
  barcode?: string | null
}

/** The new Collection's name, or undefined when it has neither a name nor a barcode. */
export function newCollectionName({ name, barcode }: NewCollectionIdentifiers): string | undefined {
  return name || barcode || undefined
}
