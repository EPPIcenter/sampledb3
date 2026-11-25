import type { CallToolResult, ToolAnnotations } from '@modelcontextprotocol/server'
import type { z } from 'zod'
import type { Database } from '../../db/client'

export type McpEffectiveRole = 'viewer' | 'member'

export type McpToolAccess = 'read' | 'write'

export interface McpConnectionContext {
  db: Database
  connection: {
    id: string
    clientId: string
    clientName: string
  }
  user: {
    id: number
    email: string
    username: string | null
    name: string
    role: 'admin' | 'member' | 'viewer'
  }
  effectiveRole: McpEffectiveRole
  canWrite: boolean
  instance: {
    name: string
    version: string
    buildId: string
  }
}

export interface McpToolDefinition<
  TInput extends z.ZodTypeAny | undefined = z.ZodTypeAny | undefined,
> {
  name: string
  title?: string
  description: string
  /** Every MCP tool must explicitly declare whether it reads or writes. */
  access: McpToolAccess
  inputSchema?: TInput
  outputSchema?: z.ZodTypeAny
  annotations?: ToolAnnotations
  _meta?: Record<string, unknown>
  handler: (
    args: TInput extends z.ZodTypeAny ? z.infer<TInput> : Record<string, never>,
    ctx: McpConnectionContext,
  ) => Promise<CallToolResult> | CallToolResult
}

/**
 * Helper to define a type-safe MCP tool with explicit read/write access declaration.
 */
export function defineMcpTool<
  TInput extends z.ZodTypeAny | undefined = undefined,
>(definition: McpToolDefinition<TInput>): McpToolDefinition<TInput> {
  return definition
}
