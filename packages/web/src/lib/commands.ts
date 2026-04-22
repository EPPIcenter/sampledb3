/**
 * Command registry for the command palette
 */

export type RouteMatchSpec = { path: string; match: 'exact' | 'prefix' }

export type CommandContext =
  | { kind: 'always' }
  | { kind: 'routes'; routes: RouteMatchSpec[] }
  | { kind: 'predicate'; test: (pathname: string) => boolean }

export type CommandCategory =
  | 'Suggested'
  | 'Create'
  | 'Actions'
  | 'Export'
  | 'Bulk Operations'
  | 'Navigation'
  | 'Settings'
  | 'Admin'

/**
 * Palette section order: action-first — contextual/app actions before export;
 * browse (navigation) before heavy bulk moves; personalization and admin last.
 */
export const CATEGORY_ORDER: CommandCategory[] = [
  'Suggested',
  'Create',
  'Actions',
  'Export',
  'Navigation',
  'Bulk Operations',
  'Settings',
  'Admin',
]

export interface Command {
  id: string
  label: string
  category: CommandCategory
  keywords: string[]
  action: () => void
  context?: CommandContext
  icon?: string
  description?: string
  /** Display-only shortcut hint (e.g. "⌘K") */
  shortcut?: string
  /** When true, hidden until the user types a search query */
  hideFromEmptyList?: boolean
  /** Higher sorts first within the same relevance bucket */
  priority?: number
}

/**
 * Match a single route pattern against the current pathname.
 * Prefix `/` only matches the home route exactly (not every path).
 */
export function pathMatchesRoute(pathname: string, routePath: string, match: 'exact' | 'prefix'): boolean {
  if (match === 'exact') {
    return pathname === routePath
  }
  if (routePath === '/') {
    return pathname === '/'
  }
  return pathname === routePath || pathname.startsWith(`${routePath}/`)
}

export function commandContextMatches(pathname: string, ctx: CommandContext | undefined): boolean {
  if (ctx === undefined) return true
  if (ctx.kind === 'always') return true
  if (ctx.kind === 'predicate') return ctx.test(pathname)
  return ctx.routes.some((r) => pathMatchesRoute(pathname, r.path, r.match))
}

/**
 * Simple fuzzy match function
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()

  // Exact match
  if (lowerText.includes(lowerQuery)) return true

  // Character sequence match (e.g. "gd" matches "Go to Dashboard")
  let queryIndex = 0
  for (let i = 0; i < lowerText.length && queryIndex < lowerQuery.length; i++) {
    if (lowerText[i] === lowerQuery[queryIndex]) {
      queryIndex++
    }
  }
  return queryIndex === lowerQuery.length
}

/**
 * Filter commands based on query and current route
 */
export function filterCommands(commands: Command[], query: string, currentPath: string): Command[] {
  const lowerQuery = query.toLowerCase().trim()

  if (!lowerQuery) {
    return commands.filter((cmd) => {
      if (cmd.hideFromEmptyList) return false
      return commandContextMatches(currentPath, cmd.context)
    })
  }

  return commands
    .filter((cmd) => {
      if (!commandContextMatches(currentPath, cmd.context)) return false

      const matchesLabel = fuzzyMatch(lowerQuery, cmd.label)
      const matchesKeywords = cmd.keywords.some((kw) => fuzzyMatch(lowerQuery, kw))
      const matchesDescription = cmd.description ? fuzzyMatch(lowerQuery, cmd.description) : false

      return matchesLabel || matchesKeywords || matchesDescription
    })
    .sort((a, b) => {
      const pa = a.priority ?? 0
      const pb = b.priority ?? 0
      if (pa !== pb) return pb - pa

      const aLabelMatch = a.label.toLowerCase().startsWith(lowerQuery)
      const bLabelMatch = b.label.toLowerCase().startsWith(lowerQuery)
      if (aLabelMatch && !bLabelMatch) return -1
      if (!aLabelMatch && bLabelMatch) return 1

      const aLabelContains = a.label.toLowerCase().includes(lowerQuery)
      const bLabelContains = b.label.toLowerCase().includes(lowerQuery)
      if (aLabelContains && !bLabelContains) return -1
      if (!aLabelContains && bLabelContains) return 1

      return 0
    })
}

/**
 * Group commands by category (unordered map)
 */
export function groupCommandsByCategory(commands: Command[]): Partial<Record<string, Command[]>> {
  return commands.reduce(
    (acc, cmd) => {
      const bucket = acc[cmd.category] ?? []
      bucket.push(cmd)
      acc[cmd.category] = bucket
      return acc
    },
    {} as Partial<Record<string, Command[]>>
  )
}

/**
 * Ordered category sections for rendering; skips empty categories.
 */
export function getOrderedCategorySections(commands: Command[]): { category: string; commands: Command[] }[] {
  const grouped = groupCommandsByCategory(commands)
  const out: { category: string; commands: Command[] }[] = []
  for (const cat of CATEGORY_ORDER) {
    const list = grouped[cat]
    if (list !== undefined && list.length > 0) {
      out.push({ category: cat, commands: list })
    }
  }
  for (const [cat, list] of Object.entries(grouped)) {
    if (list && !CATEGORY_ORDER.includes(cat as CommandCategory) && list.length > 0) {
      out.push({ category: cat, commands: list })
    }
  }
  return out
}
