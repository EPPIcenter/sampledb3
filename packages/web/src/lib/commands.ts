/**
 * Command registry for the command palette
 */

export interface Command {
  id: string
  label: string
  category: string
  keywords: string[] // for fuzzy search
  action: () => void
  context?: string[] // routes where this command is available (empty = all routes)
  icon?: string
  description?: string
}

export type CommandCategory = 
  | 'Navigation' 
  | 'Create' 
  | 'Actions' 
  | 'Settings'
  | 'Export'
  | 'Bulk Operations'

/**
 * Simple fuzzy match function
 */
export function fuzzyMatch(query: string, text: string): boolean {
  const lowerQuery = query.toLowerCase()
  const lowerText = text.toLowerCase()
  
  // Exact match
  if (lowerText.includes(lowerQuery)) return true
  
  // Character sequence match (e.g., "gd" matches "Go to Dashboard")
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
export function filterCommands(
  commands: Command[],
  query: string,
  currentPath: string
): Command[] {
  const lowerQuery = query.toLowerCase().trim()
  
  if (!lowerQuery) {
    // Show all commands available in current context
    return commands.filter(cmd => {
      if (!cmd.context || cmd.context.length === 0) return true
      return cmd.context.some(ctx => currentPath.startsWith(ctx))
    })
  }
  
  return commands
    .filter(cmd => {
      // Check context
      if (cmd.context && cmd.context.length > 0) {
        const inContext = cmd.context.some(ctx => currentPath.startsWith(ctx))
        if (!inContext) return false
      }
      
      // Check if query matches label, keywords, or description
      const matchesLabel = fuzzyMatch(lowerQuery, cmd.label)
      const matchesKeywords = cmd.keywords.some(kw => fuzzyMatch(lowerQuery, kw))
      const matchesDescription = cmd.description ? fuzzyMatch(lowerQuery, cmd.description) : false
      
      return matchesLabel || matchesKeywords || matchesDescription
    })
    .sort((a, b) => {
      // Prioritize exact label matches
      const aLabelMatch = a.label.toLowerCase().startsWith(lowerQuery)
      const bLabelMatch = b.label.toLowerCase().startsWith(lowerQuery)
      if (aLabelMatch && !bLabelMatch) return -1
      if (!aLabelMatch && bLabelMatch) return 1
      
      // Then prioritize label matches over keyword matches
      const aLabelContains = a.label.toLowerCase().includes(lowerQuery)
      const bLabelContains = b.label.toLowerCase().includes(lowerQuery)
      if (aLabelContains && !bLabelContains) return -1
      if (!aLabelContains && bLabelContains) return 1
      
      return 0
    })
}

/**
 * Group commands by category
 */
export function groupCommandsByCategory(commands: Command[]): Record<string, Command[]> {
  return commands.reduce((acc, cmd) => {
    if (!acc[cmd.category]) {
      acc[cmd.category] = []
    }
    acc[cmd.category].push(cmd)
    return acc
  }, {} as Record<string, Command[]>)
}

