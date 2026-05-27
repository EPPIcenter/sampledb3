import { z } from 'zod'
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

const containerCollectionSchema = z.object({
  type: z.string(),
  id: z.number(),
  name: z.string(),
  position: z.string().optional(),
  barcode: z.string().optional(),
  label: z.string().optional(),
})

const enrichedContainerSchema = z
  .object({
    id: z.number(),
    specimenId: z.number().optional(),
    containerType: z.string(),
    totalQuantity: z.number().nullable().optional(),
    remainingQuantity: z.number().nullable().optional(),
    locationPath: z.string().optional(),
    collection: containerCollectionSchema.nullable().optional(),
  })
  .passthrough()

const containerDetailWireSchema = z
  .object({
    container: enrichedContainerSchema.optional(),
    specimen: z.unknown().nullable().optional(),
    source: z.unknown().nullable().optional(),
  })
  .passthrough()
  .refine(
    (body) => body.container?.id != null || (body as { id?: number }).id != null,
    { message: 'container detail requires container.id (nested or legacy flat)' },
  )

export type ParsedContainerDetailWire = z.infer<typeof containerDetailWireSchema>

export function parseContainerDetailWire(body: unknown): ParsedContainerDetailWire {
  return parseWithSchema(containerDetailWireSchema, body, 'GET /containers/:id')
}

const containersListSchema = z.object({
  containers: z.array(enrichedContainerSchema),
  pagination: paginationMetaSchema.optional(),
})

export type ContainersListResult = {
  containers: EnrichedContainer[]
  pagination?: { page: number; limit: number; total: number; totalPages: number }
}

export function parseContainersList(body: unknown): ContainersListResult {
  const parsed = parseWithSchema(containersListSchema, body, 'GET /containers list')
  return {
    containers: parsed.containers as ContainersListResult['containers'],
    pagination: parsed.pagination,
  }
}
