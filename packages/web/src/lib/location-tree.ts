import { type Location } from './api'

/**
 * Simplified location tree structure.
 * Since (locationRoot, levelI, levelII, levelIII) is unique,
 * we can simplify to: root -> levelI -> locations
 */
export type LocationTree = Record<string, Record<string, Location[]>>

/**
 * Build a simplified location tree from a list of locations.
 * Groups by locationRoot, then levelI, with locations as terminal nodes.
 */
export function buildLocationTree(locations: Location[]): LocationTree {
  const tree: LocationTree = {}

  locations.forEach((loc) => {
    const root = loc.locationRoot || '(root)'
    const levelI = loc.levelI || '(none)'

    if (!tree[root]) tree[root] = {}
    if (!tree[root][levelI]) tree[root][levelI] = []
    tree[root][levelI].push(loc)
  })

  // Sort locations within each levelI by levelII, then levelIII
  Object.keys(tree).forEach((root) => {
    Object.keys(tree[root]).forEach((levelI) => {
      tree[root][levelI].sort((a, b) => {
        const a2 = a.levelII || ''
        const b2 = b.levelII || ''
        const levelIICmp = a2.localeCompare(b2)
        if (levelIICmp !== 0) return levelIICmp

        const a3 = a.levelIII || ''
        const b3 = b.levelIII || ''
        return a3.localeCompare(b3)
      })
    })
  })

  return tree
}

/**
 * Get the display label for a location in the hierarchy.
 * Shows levelIII if present, otherwise levelII.
 */
export function getLocationLabel(location: Location): string {
  return location.levelIII || location.levelII || `Location #${location.id}`
}

/**
 * Filter a location tree by search term.
 */
export function filterLocationTree(
  tree: LocationTree,
  searchTerm: string
): LocationTree {
  if (!searchTerm.trim()) return tree

  const term = searchTerm.toLowerCase()
  const result: LocationTree = {}

  Object.entries(tree).forEach(([root, levelIGroup]) => {
    Object.entries(levelIGroup).forEach(([levelI, locs]) => {
      const matchingLocs = locs.filter((loc) => {
        const fields = [
          loc.locationRoot,
          loc.levelI,
          loc.levelII,
          loc.levelIII,
          loc.description,
        ]
        return fields.some((f) => f && f.toLowerCase().includes(term))
      })

      if (matchingLocs.length > 0) {
        if (!result[root]) result[root] = {}
        result[root][levelI] = matchingLocs
      }
    })
  })

  return result
}

