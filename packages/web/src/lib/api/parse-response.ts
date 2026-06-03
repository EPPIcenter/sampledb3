import { z } from 'zod'
import {
  parseContainerDetailWire as parseContainerDetailWireSchema,
  parseContainersListWire,
  type ContainerDetailWire,
} from '@sampledb/contract/wire'
import type { EnrichedContainer } from './containers'

/** Thrown when a response body does not match the expected API contract. */
export class ApiContractError extends Error {
  readonly issues: z.ZodIssue[]

  constructor(message: string, issues: z.ZodIssue[] = []) {
    super(message)
    this.name = 'ApiContractError'
    this.issues = issues
  }
}

function formatIssues(issues: z.ZodIssue[]): string {
  return issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`).join('; ')
}

export function parseWithSchema<T>(schema: z.ZodType<T>, body: unknown, label: string): T {
  const result = schema.safeParse(body)
  if (!result.success) {
    throw new ApiContractError(`Invalid ${label}: ${formatIssues(result.error.issues)}`, result.error.issues)
  }
  return result.data
}

const paginationMetaSchema = z.object({
  page: z.number(),
  limit: z.number(),
  total: z.number(),
  totalPages: z.number(),
})

/** Zod 4 treats missing keys with `z.unknown()` as optional — require `data` explicitly. */
const apiResponseSchema = z
  .object({
    data: z.unknown(),
    meta: z
      .object({
        pagination: paginationMetaSchema.optional(),
        filters: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
  })
  .strict()
  .refine((o) => 'data' in o, { message: 'ApiResponse requires a data field' })

/** Validate CRUD list envelope `{ data, meta? }` and return `data`. */
export function parseApiResponseData<T>(body: unknown, label = 'ApiResponse'): T {
  const parsed = parseWithSchema(apiResponseSchema, body, label)
  return parsed.data as T
}

const settingsEnvelopeSchema = z.object({
  key: z.string(),
  value: z.unknown().nullable(),
  userId: z.number().nullable().optional(),
})

export function parseSettingsEnvelope<T>(
  body: unknown,
  expectedKey: string,
  label = 'settings envelope',
): { key: string; value: T; userId?: number | null } {
  const parsed = parseWithSchema(settingsEnvelopeSchema, body, label)
  if (parsed.key !== expectedKey) {
    throw new ApiContractError(`Invalid ${label}: expected key "${expectedKey}", received "${parsed.key}"`)
  }
  return { key: parsed.key, value: parsed.value as T, userId: parsed.userId }
}

export type ParsedContainerDetailWire = ContainerDetailWire

export function parseContainerDetailWire(body: unknown): ParsedContainerDetailWire {
  try {
    return parseContainerDetailWireSchema(body)
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiContractError(`Invalid GET /containers/:id: ${formatIssues(error.issues)}`, error.issues)
    }
    throw error
  }
}

export type ContainersListResult = {
  containers: EnrichedContainer[]
  pagination?: { page: number; limit: number; total: number; totalPages: number }
}

export function parseContainersList(body: unknown): ContainersListResult {
  try {
    const parsed = parseContainersListWire(body)
    return {
      containers: parsed.containers as ContainersListResult['containers'],
      pagination: parsed.pagination,
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ApiContractError(`Invalid GET /containers list: ${formatIssues(error.issues)}`, error.issues)
    }
    throw error
  }
}
