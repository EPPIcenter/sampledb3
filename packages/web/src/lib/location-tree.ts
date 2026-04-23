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

const PATH_DELIMITER_RE = /\s*>\s*|\s*\/\s*/

/**
 * When the query has two or more path segments (separated by `>` or `/`),
 * return those segments. Otherwise the caller should use global flat search.
 */
export function parseLocationPathSegments(raw: string): string[] | null {
  const t = raw.trim()
  if (!t) return null
  const parts = t
    .split(PATH_DELIMITER_RE)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
  if (parts.length < 2) return null
  return parts
}

/** Splits a display name into alnum tokens so "5" can match "Shelf 5" but not "15". */
function nameTokens(name: string): string[] {
  return name.split(/[^a-zA-Z0-9]+/).filter(Boolean)
}

function isAllDigitSegment(seg: string): boolean {
  return /^\d+$/.test(seg.trim())
}

/**
 * Non-final path segments: substring match for text; digit-only segments match
 * only as a full token (or exact name) so "5" does not match the "5" in "15".
 */
function segmentMatchNonFinalName(name: string, seg: string): boolean {
  const s = seg.toLowerCase().trim()
  if (!s) return false
  const n = name.toLowerCase()
  if (isAllDigitSegment(s)) {
    if (n === s) return true
    return nameTokens(name).some((t) => t.toLowerCase() === s)
  }
  return n.includes(s)
}

function filterChildrenLastSegment(children: Location[], seg: string): Location[] {
  const s = seg.toLowerCase().trim()
  if (isAllDigitSegment(s)) {
    const exact = children.filter((c) => c.name.toLowerCase() === s)
    if (exact.length > 0) return exact
    const byToken = children.filter((c) =>
      nameTokens(c.name).some((t) => t.toLowerCase() === s)
    )
    if (byToken.length > 0) return byToken
    return children.filter((c) => c.name.toLowerCase().startsWith(s))
  }
  const byPrefix = children.filter((c) => c.name.toLowerCase().startsWith(s))
  if (byPrefix.length > 0) return byPrefix
  return children.filter((c) => c.name.toLowerCase().includes(s))
}

function collectDescendantIdsFromTree(tree: LocationTree, parentId: number): number[] {
  const out: number[] = []
  const visit = (pid: number) => {
    for (const c of tree.get(pid) ?? []) {
      out.push(c.id)
      visit(c.id)
    }
  }
  visit(parentId)
  return out
}

/**
 * String to pass to highlight / mark matching text: last path segment in path
 * mode, or the full trimmed query in flat search.
 */
export function getLocationSearchHighlightQuery(raw: string): string {
  const t = raw.trim()
  if (!t) return ''
  const segs = parseLocationPathSegments(t)
  if (segs) return segs[segs.length - 1]! ?? t
  return t
}

function addAncestorsAndBuildFiltered(
  locationMap: Map<number, Location>,
  seedIds: Set<number>
): LocationTree {
  const locationsToInclude = new Set<number>(seedIds)
  let changed = true
  while (changed) {
    changed = false
    const newLocations: number[] = []
    for (const locId of locationsToInclude) {
      const loc = locationMap.get(locId)
      if (loc?.parentId != null && !locationsToInclude.has(loc.parentId)) {
        const parent = locationMap.get(loc.parentId)
        if (parent) {
          newLocations.push(parent.id)
          changed = true
        }
      }
    }
    for (const id of newLocations) locationsToInclude.add(id)
  }
  return buildPrunedSubTreeFromIds(locationMap, locationsToInclude)
}

function buildPrunedSubTreeFromIds(
  locationMap: Map<number, Location>,
  keepIds: Set<number>
): LocationTree {
  const filtered = new Map<number | null, Location[]>()
  for (const locId of keepIds) {
    const loc = locationMap.get(locId)
    if (loc) {
      const parentId = loc.parentId ?? null
      if (!filtered.has(parentId)) filtered.set(parentId, [])
      if (!filtered.get(parentId)!.some((l) => l.id === loc.id)) {
        filtered.get(parentId)!.push(loc)
      }
    }
  }
  for (const locs of filtered.values()) {
    locs.sort((a, b) => a.name.localeCompare(b.name))
  }
  return filtered
}

function filterLocationTreeFlat(
  tree: LocationTree,
  searchTerm: string
): LocationTree {
  if (!searchTerm.trim()) return tree

  const term = searchTerm.toLowerCase()
  const allLocations = Array.from(tree.values()).flat()
  const locationMap = new Map(allLocations.map((loc) => [loc.id, loc]))
  const matchingLocations = new Set<number>()

  for (const [, locs] of tree.entries()) {
    const matching = locs.filter((loc) => {
      const fields = [loc.name, loc.path, loc.description]
      return fields.some((f) => f && f.toLowerCase().includes(term))
    })
    for (const loc of matching) {
      matchingLocations.add(loc.id)
    }
  }

  return addAncestorsAndBuildFiltered(locationMap, matchingLocations)
}

/**
 * Path mode: first segment matches root names, each next segment matches among
 * direct children of the previous level (substring). Final segment uses
 * prefix, then includes fallback, on direct children of the level above.
 */
function filterLocationTreeByPathSegments(
  tree: LocationTree,
  segments: string[]
): LocationTree {
  const n = segments.length
  if (n < 2) return new Map()
  const allLocations = Array.from(tree.values()).flat()
  const locationMap = new Map(allLocations.map((loc) => [loc.id, loc]))
  const roots = tree.get(null) ?? []
  let frontier = roots.filter((loc) => segmentMatchNonFinalName(loc.name, segments[0]!))
  if (frontier.length === 0) {
    return new Map()
  }

  for (let depth = 1; depth < n; depth++) {
    const isLast = depth === n - 1
    const seg = segments[depth]!
    const next: Location[] = []
    for (const f of frontier) {
      const children = tree.get(f.id) ?? []
      if (isLast) {
        next.push(...filterChildrenLastSegment(children, seg))
      } else {
        for (const kid of children) {
          if (segmentMatchNonFinalName(kid.name, seg)) {
            next.push(kid)
          }
        }
      }
    }
    if (next.length === 0) {
      return new Map()
    }
    frontier = next
  }

  const seedIds = new Set<number>()
  for (const loc of frontier) {
    seedIds.add(loc.id)
    for (const did of collectDescendantIdsFromTree(tree, loc.id)) {
      seedIds.add(did)
    }
  }

  return addAncestorsAndBuildFiltered(locationMap, seedIds)
}

/**
 * Filter a location tree by search term.
 * Searches in name, path, and description (global substring), unless the query
 * uses two+ path segments separated by `>` or `/` — then Walks the hierarchy
 * and matches the last level with prefix (then includes fallback).
 * Includes all ancestors of matching locations up to the root.
 */
export function filterLocationTree(
  tree: LocationTree,
  searchTerm: string
): LocationTree {
  if (!searchTerm.trim()) return tree
  const segments = parseLocationPathSegments(searchTerm)
  if (segments) {
    return filterLocationTreeByPathSegments(tree, segments)
  }
  return filterLocationTreeFlat(tree, searchTerm)
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
