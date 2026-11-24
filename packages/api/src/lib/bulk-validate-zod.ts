import type { z } from 'zod'

function formatFieldMessage(pathRest: ReadonlyArray<PropertyKey>, message: string): string {
  const field = pathRest.map(String).join('.')
  return field ? `${field}: ${message}` : message
}

/**
 * Map Zod issues whose paths all point into `body[arrayKey][N]` to row-level validate errors
 * (`{ index: N, message }`). Returns null if any issue is outside row paths (stays a 400).
 */
export function mapIndexedZodRowIssues(
  error: z.ZodError,
  arrayKey: string,
): Array<{ index: number; message: string }> | null {
  if (error.issues.length === 0) return null
  const errors: Array<{ index: number; message: string }> = []
  for (const issue of error.issues) {
    if (issue.path[0] !== arrayKey || typeof issue.path[1] !== 'number') {
      return null
    }
    errors.push({
      index: issue.path[1],
      message: formatFieldMessage(issue.path.slice(2), issue.message),
    })
  }
  return errors
}

function readRowIndex(rawBody: unknown, subjectIndex: number, specimenIndex?: number): number | undefined {
  if (!rawBody || typeof rawBody !== 'object') return undefined
  const subjects = (rawBody as { subjects?: unknown }).subjects
  if (!Array.isArray(subjects)) return undefined
  const subject = subjects[subjectIndex]
  if (!subject || typeof subject !== 'object') return undefined
  const specimens = (subject as { specimens?: unknown }).specimens
  if (!Array.isArray(specimens)) return undefined
  const target = specimenIndex !== undefined ? specimens[specimenIndex] : specimens[0]
  if (!target || typeof target !== 'object') return undefined
  const rowIndex = (target as { rowIndex?: unknown }).rowIndex
  return typeof rowIndex === 'number' && Number.isInteger(rowIndex) ? rowIndex : undefined
}

/**
 * Map Zod issues whose paths all point into `body.subjects[S]` (or `body.subjects[S].specimens[K]`)
 * to bulk-combined validate errors. Returns null if any issue is outside row paths (stays a 400).
 */
export function mapBulkCombinedZodRowIssues(
  error: z.ZodError,
  rawBody: unknown,
): Array<{ subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }> | null {
  if (error.issues.length === 0) return null
  const errors: Array<{ subjectIndex: number; specimenIndex?: number; rowIndex?: number; message: string }> = []
  for (const issue of error.issues) {
    if (issue.path[0] !== 'subjects' || typeof issue.path[1] !== 'number') {
      return null
    }
    const subjectIndex = issue.path[1]
    if (issue.path[2] === 'specimens' && typeof issue.path[3] === 'number') {
      const specimenIndex = issue.path[3]
      const rowIndex = readRowIndex(rawBody, subjectIndex, specimenIndex)
      errors.push({
        subjectIndex,
        specimenIndex,
        ...(rowIndex !== undefined ? { rowIndex } : {}),
        message: formatFieldMessage(issue.path.slice(4), issue.message),
      })
    } else {
      const rowIndex = readRowIndex(rawBody, subjectIndex)
      errors.push({
        subjectIndex,
        ...(rowIndex !== undefined ? { rowIndex } : {}),
        message: formatFieldMessage(issue.path.slice(2), issue.message),
      })
    }
  }
  return errors
}
