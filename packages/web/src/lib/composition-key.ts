/**
 * Strain with optional percentage for composition key derivation.
 * Used to group control definitions by parasite composition (same strains + percentages = same composition).
 */
export interface StrainWithPercentage {
  id: number
  percentage?: number
}

/**
 * Derive a stable key from strain IDs and percentages for grouping by composition.
 * Same composition (same strain IDs and percentages) always yields the same key regardless of order.
 * Sorts by strain id and formats as "id:percentage,id:percentage,...".
 */
export function getCompositionKey(strains: StrainWithPercentage[]): string {
  if (strains.length === 0) return ''
  const sorted = [...strains].sort((a, b) => a.id - b.id)
  return sorted
    .map((s) => `${s.id}:${s.percentage ?? 0}`)
    .join(',')
}
