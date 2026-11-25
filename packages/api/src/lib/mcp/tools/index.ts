import type { McpServer, ToolAnnotations } from '@modelcontextprotocol/server'
import type { McpConnectionContext, McpToolDefinition } from '../types'
import { whoamiTool } from './whoami'

/**
 * Default tools registered on the SampleDB MCP endpoint.
 * Later tickets add lookup, export, import, and location tools here.
 */
export function getDefaultMcpTools(): readonly McpToolDefinition[] {
  return [whoamiTool]
}

/**
 * Register every allowed tool on a per-request McpServer.
 * Writing tools are registered only when ctx.canWrite is true (member or admin user, capped at member).
 */
export function registerMcpToolsForConnection(
  server: McpServer,
  tools: readonly McpToolDefinition[],
  ctx: McpConnectionContext,
): void {
  for (const tool of tools) {
    if (tool.access === 'write' && !ctx.canWrite) {
      continue
    }

    const annotations: ToolAnnotations | undefined =
      tool.access === 'read'
        ? { readOnlyHint: true, ...tool.annotations }
        : tool.annotations

    const baseConfig = {
      ...(tool.title !== undefined ? { title: tool.title } : {}),
      description: tool.description,
      ...(tool.outputSchema !== undefined ? { outputSchema: tool.outputSchema } : {}),
      ...(annotations !== undefined ? { annotations } : {}),
      ...(tool._meta !== undefined ? { _meta: tool._meta } : {}),
    }

    if (tool.inputSchema !== undefined) {
      server.registerTool(
        tool.name,
        {
          ...baseConfig,
          inputSchema: tool.inputSchema,
        },
        async (args) => {
          if (tool.access === 'write' && !ctx.canWrite) {
            return {
              content: [{ type: 'text', text: 'Forbidden: writing tools require member access.' }],
              isError: true,
            }
          }
          return tool.handler(args, ctx)
        },
      )
    } else {
      server.registerTool(tool.name, baseConfig, async () => {
        if (tool.access === 'write' && !ctx.canWrite) {
          return {
            content: [{ type: 'text', text: 'Forbidden: writing tools require member access.' }],
            isError: true,
          }
        }
        return tool.handler({} as Record<string, never>, ctx)
      })
    }
  }
}
