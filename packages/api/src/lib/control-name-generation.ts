import { eq, and, like, sql } from 'drizzle-orm'
import { controlDefinition } from '../db/schema'
import type { Database } from '../db/client'

/**
 * Format density value for use in control definition names
 * - >= 1000: Use "K" notation (1K, 10K, 100K, 1.9K)
 * - < 1: Show decimal (0.01, 0.05, 0.1)
 * - >= 1 and < 1000: Show as integer or decimal (1, 10, 100, 1.9)
 * - 0: Use "0"
 */
export function formatDensity(density: number): string {
  if (density === 0) {
    return '0'
  }
  
  if (density >= 1000) {
    // Use "K" notation for thousands
    const thousands = density / 1000
    // If it's a whole number, don't show decimal
    if (thousands % 1 === 0) {
      return `${thousands}K`
    }
    // Otherwise show one decimal place if needed
    return `${thousands.toFixed(1)}K`
  }
  
  if (density < 1) {
    // For small decimals, show up to 2 decimal places, removing trailing zeros
    return density.toString().replace(/\.?0+$/, '')
  }
  
  // For 1-999, show as integer if whole number, otherwise show decimal
  if (density % 1 === 0) {
    return density.toString()
  }
  // Show one decimal place, removing trailing zeros
  return density.toFixed(1).replace(/\.?0+$/, '')
}

/**
 * Get abbreviation for a strain name (first 2-3 characters, uppercase)
 */
function getStrainAbbrev(strainName: string): string {
  // Sanitize: remove spaces and special chars, convert to uppercase
  const sanitized = strainName.replace(/[^a-zA-Z0-9]/g, '').toUpperCase()
  // Use first 2-3 characters, preferring 3 if available
  if (sanitized.length >= 3) {
    return sanitized.substring(0, 3)
  }
  return sanitized.substring(0, 2) || sanitized
}

/**
 * Encode strain composition into a compact string representation
 * Format: {strain1Abbrev}{pct1}-{strain2Abbrev}{pct2}-...
 * Strains are sorted by percentage (descending), then alphabetically by name
 */
export function encodeStrainComposition(
  strains: Array<{ name: string; percentage: number }>
): string {
  if (strains.length === 0) {
    return 'Neg'
  }
  
  // Single strain at 100% - use full strain name
  if (strains.length === 1 && Math.abs(strains[0].percentage - 100) < 0.01) {
    // Sanitize strain name for use in name
    return strains[0].name.replace(/[^a-zA-Z0-9]/g, '-').toUpperCase()
  }
  
  // Multiple strains - use percentage-based abbreviation
  // Sort by percentage (descending), then alphabetically by name
  const sorted = [...strains].sort((a, b) => {
    // First sort by percentage (descending)
    if (Math.abs(a.percentage - b.percentage) > 0.01) {
      return b.percentage - a.percentage
    }
    // If percentages are equal, sort alphabetically by name
    return a.name.localeCompare(b.name)
  })
  
  // Round percentages to integers
  const parts = sorted.map(s => {
    const abbrev = getStrainAbbrev(s.name)
    const pct = Math.round(s.percentage)
    return `${abbrev}${pct}`
  })
  
  return parts.join('-')
}

/**
 * Generate base name for a control definition from its components
 * Must be deterministic - same inputs always produce same name
 */
export function generateControlDefinitionName(data: {
  controlType: string
  targetDensity: number
  targetDensityUnitId?: number
  strains: Array<{ id: number; name: string; percentage: number }>
}): string {
  const { targetDensity, strains } = data
  
  // Format density
  const densityPart = formatDensity(targetDensity)
  
  // Encode strain composition
  const strainPart = encodeStrainComposition(
    strains.map(s => ({ name: s.name, percentage: s.percentage }))
  )
  
  // Combine: {density}_{strainPart}
  return `${densityPart}_${strainPart}`
}

/**
 * Generate a unique control definition name, handling collisions
 * If the generated name already exists, appends increment: {baseName}_2, {baseName}_3, etc.
 */
export async function generateUniqueControlDefinitionName(
  db: Database,
  data: {
    controlType: string
    targetDensity: number
    targetDensityUnitId?: number
    strains: Array<{ id: number; name: string; percentage: number }>
  },
  excludeId?: number
): Promise<string> {
  // Generate base name
  const baseName = generateControlDefinitionName(data)
  
  // Check if base name is available
  let where = eq(controlDefinition.name, baseName) as any
  if (excludeId) {
    where = and(
      eq(controlDefinition.name, baseName),
      sql`${controlDefinition.id} != ${excludeId}`
    ) as any
  }
  
  const existing = await db
    .select({ id: controlDefinition.id })
    .from(controlDefinition)
    .where(where)
    .get()
  
  if (!existing) {
    return baseName
  }
  
  // If base name exists, find all existing names with this base and extract increments
  // Pattern: "BaseName_2", "BaseName_3", etc.
  const escapedBaseName = baseName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`^${escapedBaseName}_(\\d+)$`)
  const likePattern = `${baseName}_%`
  
  let wherePattern = like(controlDefinition.name, likePattern) as any
  if (excludeId) {
    wherePattern = and(
      like(controlDefinition.name, likePattern),
      sql`${controlDefinition.id} != ${excludeId}`
    ) as any
  }
  
  const existingNames = await db
    .select({ name: controlDefinition.name })
    .from(controlDefinition)
    .where(wherePattern)
    .all()
  
  // Extract all increments from existing names
  const increments = existingNames
    .map(row => {
      const match = row.name.match(pattern)
      return match ? parseInt(match[1], 10) : null
    })
    .filter((n): n is number => n !== null)
  
  // Find the next available increment
  if (increments.length === 0) {
    return `${baseName}_2`
  }
  
  const maxIncrement = Math.max(...increments)
  return `${baseName}_${maxIncrement + 1}`
}

