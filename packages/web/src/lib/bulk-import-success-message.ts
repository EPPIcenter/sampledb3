/**
 * User-facing line for the bulk import result panel (per-type counts for combined import).
 */

export type BulkImportCombinedSummary = {
  subjectsCreated: number
  subjectsUpdated: number
  specimensCreated: number
  containersCreated: number
}

export type BulkImportResultForMessage = {
  success: boolean
  /** Count for subjects-only or specimens-only; omitted for combined when using combinedSummary. */
  created?: number
  containersCreated?: number
  combinedSummary?: BulkImportCombinedSummary
  errors?: Array<{ index: number; error: string }>
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** No creates and no subject matches (errors with nothing done). */
function combinedHasNoMeaningfulProgress(s: BulkImportCombinedSummary): boolean {
  return (
    s.subjectsCreated === 0 &&
    s.subjectsUpdated === 0 &&
    s.specimensCreated === 0 &&
    s.containersCreated === 0
  )
}

function formatCreatedPartsList(parts: string[]): string {
  if (parts.length === 0) {
    return ''
  }
  if (parts.length === 1) {
    return `Created: ${parts[0]}.`
  }
  if (parts.length === 2) {
    return `Created: ${parts[0]} and ${parts[1]}.`
  }
  const last = parts[parts.length - 1]
  const head = parts.slice(0, -1)
  return `Created: ${head.join(', ')} and ${last}.`
}

function matchExistingSubjectsLine(s: BulkImportCombinedSummary): string {
  if (s.subjectsUpdated <= 0) {
    return ''
  }
  return s.subjectsUpdated === 1
    ? '1 existing subject was matched.'
    : `${s.subjectsUpdated} existing subjects were matched.`
}

function formatCombinedSummary(s: BulkImportCombinedSummary): string {
  const createdParts: string[] = []
  if (s.subjectsCreated > 0) {
    createdParts.push(
      `${s.subjectsCreated} ${plural(s.subjectsCreated, 'new subject', 'new subjects')}`,
    )
  }
  if (s.specimensCreated > 0) {
    createdParts.push(`${s.specimensCreated} ${plural(s.specimensCreated, 'specimen', 'specimens')}`)
  }
  if (s.containersCreated > 0) {
    createdParts.push(
      `${s.containersCreated} ${plural(s.containersCreated, 'container', 'containers')}`,
    )
  }

  const main = formatCreatedPartsList(createdParts)
  const matched = matchExistingSubjectsLine(s)

  if (createdParts.length > 0) {
    if (!matched) {
      return main
    }
    return `${main} ${matched}`
  }
  if (matched) {
    return `No new subjects, specimens, or containers were created. ${matched}`
  }
  return 'No new records were created.'
}

export function hasBulkImportErrorWithNoProgress(
  r: BulkImportResultForMessage,
  importType: 'subjects' | 'specimens' | 'combined',
): boolean {
  const errs = r.errors
  if (!errs?.length) {
    return false
  }
  if (r.combinedSummary) {
    return combinedHasNoMeaningfulProgress(r.combinedSummary)
  }
  if (importType === 'combined') {
    return (r.created ?? 0) === 0 && (r.containersCreated ?? 0) === 0
  }
  if (importType === 'subjects') {
    return (r.created ?? 0) === 0
  }
  // specimens
  return (r.created ?? 0) === 0 && (r.containersCreated ?? 0) === 0
}

export function formatBulkImportSuccessMessage(
  r: BulkImportResultForMessage,
  importType: 'subjects' | 'specimens' | 'combined',
): string {
  if (hasBulkImportErrorWithNoProgress(r, importType)) {
    return 'No items were created. Please fix the errors below and try again.'
  }

  if (r.combinedSummary) {
    return formatCombinedSummary(r.combinedSummary)
  }

  const created = r.created ?? 0
  const cc = r.containersCreated ?? 0

  if (importType === 'subjects') {
    return `Created: ${created} ${plural(created, 'subject', 'subjects')}.`
  }

  if (importType === 'specimens' && cc > 0) {
    return `Created: ${created} ${plural(created, 'specimen', 'specimens')} and ${cc} ${plural(cc, 'container', 'containers')}.`
  }
  if (importType === 'specimens') {
    return `Created: ${created} ${plural(created, 'specimen', 'specimens')}.`
  }

  return `Created: ${created} ${plural(created, 'item', 'items')}.`
}
