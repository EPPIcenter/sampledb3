import { type Location } from './api'

/**
 * Location tree structure built from parent-child relationships.
 * Maps parent ID to array of child locations.
 */
export type LocationTree = Map<number | null, Location[]>

/**
 * Build a location tree from a list of locations.
 * Groups locations by their parent_id.
 */
export function buildLocationTree(locations: Location[]): LocationTree {
  const tree = new Map<number | null, Location[]>()
  
  // Group by parent_id
  for (const loc of locations) {
    const parentId = loc.parentId ?? null
    if (!tree.has(parentId)) {
      tree.set(parentId, [])
    }
    tree.get(parentId)!.push(loc)
  }
  
  // Sort locations within each parent group by name
  for (const [parentId, locs] of tree.entries()) {
    locs.sort((a, b) => a.name.localeCompare(b.name))
  }
  
  return tree
}

/**
 * Get the display label for a location.
 * Uses the location name.
 */
export function getLocationLabel(location: Location): string {
  return location.name
}

/**
 * Filter a location tree by search term.
 * Searches in name, path, and description.
 * Includes all ancestors of matching locations up to the root.
 */
export function filterLocationTree(
  tree: LocationTree,
  searchTerm: string
): LocationTree {
  if (!searchTerm.trim()) return tree

  const term = searchTerm.toLowerCase()
  const allLocations = Array.from(tree.values()).flat()
  const locationMap = new Map(allLocations.map(loc => [loc.id, loc]))
  const matchingLocations = new Set<number>()
  
  // First pass: find all matching locations
  for (const [parentId, locs] of tree.entries()) {
    const matching = locs.filter((loc) => {
      const fields = [
        loc.name,
        loc.path,
        loc.description,
      ]
      return fields.some((f) => f && f.toLowerCase().includes(term))
    })
    
    if (matching.length > 0) {
      matching.forEach(loc => matchingLocations.add(loc.id))
    }
  }
  
  // Second pass: recursively include all ancestors of matching locations
  const locationsToInclude = new Set<number>(matchingLocations)
  let changed = true
  
  while (changed) {
    changed = false
    const newLocations = new Set<number>()
    
    for (const locId of locationsToInclude) {
      const loc = locationMap.get(locId)
      if (loc && loc.parentId !== null) {
        // Include parent if not already included
        const parent = locationMap.get(loc.parentId)
        if (parent && !locationsToInclude.has(parent.id)) {
          newLocations.add(parent.id)
          changed = true
        }
      }
    }
    
    newLocations.forEach(id => locationsToInclude.add(id))
  }
  
  // Third pass: build filtered tree with all matching locations and their ancestors
  const filtered = new Map<number | null, Location[]>()
  for (const locId of locationsToInclude) {
    const loc = locationMap.get(locId)
    if (loc) {
      const parentId = loc.parentId ?? null
      if (!filtered.has(parentId)) {
        filtered.set(parentId, [])
      }
      if (!filtered.get(parentId)!.some(l => l.id === loc.id)) {
        filtered.get(parentId)!.push(loc)
      }
    }
  }
  
  // Sort locations within each parent group by name
  for (const [parentId, locs] of filtered.entries()) {
    locs.sort((a, b) => a.name.localeCompare(b.name))
  }
  
  return filtered
}

/**
 * Get all root locations (locations with no parent)
 */
export function getRootLocations(locations: Location[]): Location[] {
  return locations.filter(loc => loc.parentId === null)
}

/**
 * Get all children of a location
 */
export function getLocationChildren(locations: Location[], parentId: number | null): Location[] {
  return locations.filter(loc => loc.parentId === parentId)
}

/**
 * Get all ancestors of a location (walking up the parent chain)
 */
export function getLocationAncestors(locations: Location[], locationId: number): Location[] {
  const ancestors: Location[] = []
  const locationMap = new Map(locations.map(loc => [loc.id, loc]))
  
  let current = locationMap.get(locationId)
  while (current?.parentId !== null && current?.parentId !== undefined) {
    const parent = locationMap.get(current.parentId)
    if (parent) {
      ancestors.unshift(parent) // Add to beginning to maintain order
      current = parent
    } else {
      break
    }
  }
  
  return ancestors
}

/**
 * Get all descendants of a location (walking down the child chain)
 */
export function getLocationDescendants(locations: Location[], locationId: number): Location[] {
  const descendants: Location[] = []
  const locationMap = new Map(locations.map(loc => [loc.id, loc]))
  
  function collectChildren(parentId: number) {
    for (const loc of locations) {
      if (loc.parentId === parentId) {
        descendants.push(loc)
        collectChildren(loc.id)
      }
    }
  }
  
  collectChildren(locationId)
  return descendants
}
