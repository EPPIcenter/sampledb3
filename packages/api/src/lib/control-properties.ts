/**
 * Parse and normalize blood control definition properties JSON.
 */
import type { BloodControlProperties, ParsedControlProperties } from '../types/properties'

export function parseControlProperties(
  properties: unknown,
  strainMap?: Map<number, { name: string }>
): ParsedControlProperties {
  if (!properties) {
    return { strains: [], targetDensity: undefined, unitSymbol: undefined, targetDensityUnitId: undefined }
  }

  let props: BloodControlProperties
  try {
    const parsed = typeof properties === 'string' ? JSON.parse(properties) : properties
    props = parsed as BloodControlProperties
  } catch {
    throw new Error('Invalid control properties JSON')
  }

  const strains = (props.strains ?? []).map((s: number | { id: number; name?: string; percentage?: number }) => {
    if (typeof s === 'number') {
      return { id: s, name: strainMap?.get(s)?.name ?? `Strain ${s}` }
    }
    return { id: s.id, name: s.name ?? `Strain ${s.id}`, percentage: s.percentage }
  })

  const targetDensity =
    props.targetDensity !== undefined
      ? typeof props.targetDensity === 'string'
        ? parseFloat(props.targetDensity)
        : props.targetDensity
      : undefined

  const unit = props.targetDensityUnit
  const hasUnitSymbol =
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for parsed JSON (type omits null)
    unit !== null && typeof unit === 'object' && 'symbol' in (unit as Record<string, unknown>)
  const unitSymbol = hasUnitSymbol
    ? (unit as { symbol: string }).symbol
    : props.targetDensityUnitSymbol ??
      (typeof props.targetDensityUnit === 'string' ? props.targetDensityUnit : undefined)

  const targetDensityUnitId =
    props.targetDensityUnitId !== undefined
      ? typeof props.targetDensityUnitId === 'string'
        ? parseInt(props.targetDensityUnitId, 10)
        : props.targetDensityUnitId
      : undefined

  return {
    strains,
    targetDensity,
    unitSymbol,
    targetDensityUnitId,
  }
}
