import { z } from 'zod'
import { eq, inArray } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { controlDefinition, strain } from '../../db/schema'

export const strainCompositionEntrySchema = z.object({
  strainId: z.number().int(),
  percentage: z.number().min(0).max(100),
})

export const strainCompositionSchema = z.array(strainCompositionEntrySchema)

export type StrainCompositionEntry = z.infer<typeof strainCompositionEntrySchema>

export type ResolvedStrain = {
  id: number
  name: string
  percentage: number
}

export type CompositionCriteria = {
  strains: StrainCompositionEntry[]
  targetDensity?: number
  targetDensityUnitId?: number
}

export type CompositionMatchOptions = {
  /** optional = check-unique style; required = create/find style */
  densityMode?: 'optional' | 'required'
}

const PERCENTAGE_TOLERANCE = 0.01

export function parseStoredProperties(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>
    } catch {
      return null
    }
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>
  }
  return null
}

export function normalizeStoredStrains(strains: unknown): Array<{ id: number; percentage?: number }> {
  if (!Array.isArray(strains)) return []
  return strains.map((s) => {
    if (typeof s === 'object' && s !== null && 'id' in s) {
      const entry = s as { id: number; percentage?: number }
      return { id: entry.id, percentage: entry.percentage }
    }
    return { id: s as number }
  })
}

/** Compare requested strain ids + percentages against stored properties JSON. */
export function strainCompositionMatches(
  requested: StrainCompositionEntry[],
  storedStrains: unknown,
): boolean {
  if (requested.length === 0) {
    return normalizeStoredStrains(storedStrains).length === 0
  }

  const stored = normalizeStoredStrains(storedStrains)
  if (stored.length !== requested.length) return false

  const sortedRequestedIds = requested.map((s) => s.strainId).sort((a, b) => a - b)
  const sortedStoredIds = stored.map((s) => s.id).sort((a, b) => a - b)
  if (!sortedRequestedIds.every((id, idx) => id === sortedStoredIds[idx])) return false

  const requestedPct = new Map(requested.map((s) => [s.strainId, s.percentage]))
  const storedPct = new Map(stored.map((s) => [s.id, s.percentage]))

  return sortedRequestedIds.every((id) => {
    const pct = requestedPct.get(id)
    const defPct = storedPct.get(id)
    return (
      pct !== undefined &&
      defPct !== undefined &&
      typeof defPct === 'number' &&
      Math.abs(pct - defPct) < PERCENTAGE_TOLERANCE
    )
  })
}

/** Match target density and unit id between criteria and stored properties. */
export function targetDensityMatches(
  stored: Record<string, unknown>,
  criteria: Pick<CompositionCriteria, 'targetDensity' | 'targetDensityUnitId'>,
  mode: CompositionMatchOptions['densityMode'] = 'required',
): boolean {
  const storedDensity = stored.targetDensity as number | undefined | null
  const storedUnitId = stored.targetDensityUnitId as number | undefined | null

  if (mode === 'required') {
    if (storedDensity !== criteria.targetDensity) return false
  } else if (criteria.targetDensity !== undefined) {
    if (storedDensity !== criteria.targetDensity) return false
  } else if (storedDensity !== undefined && storedDensity !== null) {
    return false
  }

  if (criteria.targetDensityUnitId !== undefined) {
    if (storedUnitId !== criteria.targetDensityUnitId) return false
  } else if (storedUnitId !== undefined && storedUnitId !== null) {
    return false
  }

  return true
}

export function definitionCompositionMatches(
  storedProps: unknown,
  criteria: CompositionCriteria,
  options?: CompositionMatchOptions,
): boolean {
  const props = parseStoredProperties(storedProps)
  if (!props) return false
  const densityMode = options?.densityMode ?? 'required'
  if (!targetDensityMatches(props, criteria, densityMode)) return false
  return strainCompositionMatches(criteria.strains, props.strains)
}

export function findMatchingDefinitionInList<T extends { properties: unknown }>(
  definitions: T[],
  criteria: CompositionCriteria,
  options?: CompositionMatchOptions,
): { definition: T; properties: Record<string, unknown> } | null {
  for (const definition of definitions) {
    const properties = parseStoredProperties(definition.properties)
    if (!properties) continue
    if (
      targetDensityMatches(properties, criteria, options?.densityMode ?? 'required') &&
      strainCompositionMatches(criteria.strains, properties.strains)
    ) {
      return { definition, properties }
    }
  }
  return null
}

export async function resolveStrainComposition(
  database: Database,
  strains: StrainCompositionEntry[],
): Promise<
  | { ok: true; strainsWithNames: ResolvedStrain[]; strainNameMap: Map<number, { name: string }> }
  | { ok: false; error: string }
> {
  if (strains.length === 0) {
    return { ok: false, error: 'At least one strain is required' }
  }

  const strainIds = strains.map((s) => s.strainId)
  const strainRecords = await database.select().from(strain).where(inArray(strain.id, strainIds))
  const strainNameMap = new Map(strainRecords.map((s) => [s.id, { name: s.name }]))
  const missingStrains = strainIds.filter((id) => !strainNameMap.has(id))
  if (missingStrains.length > 0) {
    return { ok: false, error: `Invalid strain IDs: ${missingStrains.join(', ')}` }
  }

  const strainsWithNames = strains.map((s) => ({
    id: s.strainId,
    name: strainNameMap.get(s.strainId)!.name,
    percentage: s.percentage,
  }))

  return { ok: true, strainsWithNames, strainNameMap }
}

export async function findBloodControlDefinitionByComposition(
  database: Database,
  criteria: CompositionCriteria,
  options?: CompositionMatchOptions,
): Promise<(typeof controlDefinition.$inferSelect) | null> {
  const definitions = await database
    .select()
    .from(controlDefinition)
    .where(eq(controlDefinition.controlType, 'blood'))

  for (const definition of definitions) {
    if (definitionCompositionMatches(definition.properties, criteria, options)) {
      return definition
    }
  }
  return null
}

export function buildBloodControlPropertiesPayload(
  strainsWithNames: ResolvedStrain[],
  targetDensity: number,
  targetDensityUnitId?: number,
  unitSymbol?: string,
): Record<string, unknown> {
  const props: Record<string, unknown> = {
    strains: strainsWithNames,
    targetDensity,
  }
  if (targetDensityUnitId !== undefined) {
    props.targetDensityUnitId = targetDensityUnitId
    if (unitSymbol) {
      props.targetDensityUnitSymbol = unitSymbol
    }
  }
  return props
}
