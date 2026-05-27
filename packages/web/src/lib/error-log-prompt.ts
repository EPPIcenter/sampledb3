import type { ErrorLog } from './api/error-logs'

/**
 * Format an error log as a single, well-structured prompt suitable for pasting into an LLM
 * to help diagnose or fix the bug.
 */
export function formatErrorLogForLLM(log: ErrorLog): string {
  const sections: string[] = []

  sections.push(
    'I\'m seeing this error in our app. Please help me fix the bug.\n'
  )

  sections.push('## Error')
  const errorParts = [`Level: ${log.level}`, `Source: ${log.source}`, `Message: ${log.message}`]
  if (log.errorCode) {
    errorParts.push(`Error code: ${log.errorCode}`)
  }
  sections.push(errorParts.join('\n'))

  sections.push('\n## When')
  const whenParts = [`Timestamp: ${log.timestamp}`]
  if (log.url) {
    whenParts.push(`URL: ${log.url}`)
  }
  sections.push(whenParts.join('\n'))

  if (log.stack) {
    sections.push('\n## Stack trace')
    sections.push('```')
    sections.push(log.stack)
    sections.push('```')
  }

  if (log.context && Object.keys(log.context).length > 0) {
    sections.push('\n## Context')
    sections.push('```json')
    sections.push(JSON.stringify(log.context, null, 2))
    sections.push('```')
  }

  if (log.url || log.userAgent) {
    sections.push('\n## Environment')
    const envParts: string[] = []
    if (log.url) envParts.push(`URL: ${log.url}`)
    if (log.userAgent) envParts.push(`User-Agent: ${log.userAgent}`)
    sections.push(envParts.join('\n'))
  }

  sections.push(`\n(Error log ID: ${log.id})`)
  return sections.join('\n')
}
