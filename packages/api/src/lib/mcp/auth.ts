import { createHash } from 'node:crypto'
import { and, eq, isNull, lte, or } from 'drizzle-orm'
import type { Database } from '../../db/client'
import { connectedApps, oauthClients, users } from '../../db/schema'
import { parseStoredTimestamp, toStoredTimestamp } from '../datetime'
import { logWarn } from '../observability'
import type { McpEffectiveRole } from './types'

export const LAST_USED_THROTTLE_MS = 60_000

export interface McpAuthenticatedConnection {
  connection: {
    id: string
    clientId: string
    clientName: string
    lastUsedAt: string | null
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
}

/**
 * SHA-256 hex digest of an OAuth authorization code, access token, or refresh token.
 * Matches session token hashing: raw credentials are never stored in SQLite.
 */
export function hashConnectedAppToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/**
 * Resolve the role in effect for an MCP connection.
 * Read on every request and capped at member so an admin's connection never acts as admin.
 */
export function resolveMcpEffectiveRole(userRole: string): McpEffectiveRole {
  if (userRole === 'admin' || userRole === 'member') {
    return 'member'
  }
  return 'viewer'
}

/**
 * Parse a Bearer token from an Authorization header value, or return null if absent/malformed.
 */
export function extractBearerToken(authorizationHeader: string | undefined): string | null {
  if (!authorizationHeader) return null
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim())
  return match ? match[1] : null
}

/**
 * Validate a Connected app access token against connected_apps and the current users row.
 * Returns null if unknown, expired, revoked, or if the user is soft-deleted or unapproved.
 */
export async function authenticateMcpToken(
  database: Database,
  rawToken: string,
  now: Date = new Date(),
): Promise<McpAuthenticatedConnection | null> {
  const tokenHash = hashConnectedAppToken(rawToken)
  const nowSeconds = Math.floor(now.getTime() / 1000)

  const row = await database
    .select({
      connectionId: connectedApps.id,
      clientId: connectedApps.clientId,
      clientName: oauthClients.name,
      accessTokenExpiresAt: connectedApps.accessTokenExpiresAt,
      lastUsedAt: connectedApps.lastUsedAt,
      revokedAt: connectedApps.revokedAt,
      userId: users.id,
      email: users.email,
      username: users.username,
      name: users.name,
      role: users.role,
      deletedAt: users.deletedAt,
      approvedAt: users.approvedAt,
    })
    .from(connectedApps)
    .innerJoin(oauthClients, eq(connectedApps.clientId, oauthClients.id))
    .innerJoin(users, eq(connectedApps.userId, users.id))
    .where(eq(connectedApps.accessTokenHash, tokenHash))
    .get()

  if (!row) return null
  if (row.revokedAt !== null) return null
  if (row.accessTokenExpiresAt <= nowSeconds) return null
  if (row.deletedAt !== null) return null
  if (row.approvedAt === null) return null

  const userRole =
    row.role === 'admin' || row.role === 'member' || row.role === 'viewer'
      ? row.role
      : 'viewer'
  const effectiveRole = resolveMcpEffectiveRole(userRole)

  return {
    connection: {
      id: row.connectionId,
      clientId: row.clientId,
      clientName: row.clientName,
      lastUsedAt: row.lastUsedAt,
    },
    user: {
      id: row.userId,
      email: row.email,
      username: row.username,
      name: row.name,
      role: userRole,
    },
    effectiveRole,
    canWrite: effectiveRole === 'member',
  }
}

/**
 * Update connected_apps.last_used_at at most once per minute per connection.
 * Uses a single conditional UPDATE outside transaction helpers; losing a write is harmless.
 */
export async function touchConnectedAppLastUsed(
  database: Database,
  connectionId: string,
  previousLastUsedAt: string | null,
  now: Date = new Date(),
): Promise<boolean> {
  if (previousLastUsedAt !== null) {
    const parsed = parseStoredTimestamp(previousLastUsedAt)
    if (parsed !== null && now.getTime() - parsed.getTime() < LAST_USED_THROTTLE_MS) {
      return false
    }
  }

  const nowStamp = toStoredTimestamp(now)
  const cutoffStamp = toStoredTimestamp(new Date(now.getTime() - LAST_USED_THROTTLE_MS))

  try {
    const updated = await database
      .update(connectedApps)
      .set({ lastUsedAt: nowStamp })
      .where(
        and(
          eq(connectedApps.id, connectionId),
          or(
            isNull(connectedApps.lastUsedAt),
            lte(connectedApps.lastUsedAt, cutoffStamp),
          ),
        ),
      )
      .returning({ id: connectedApps.id })

    return updated.length > 0
  } catch (error) {
    logWarn(
      'Failed to update connected app last_used_at',
      { connectedAppId: connectionId },
      error instanceof Error ? error : new Error(String(error)),
    )
    return false
  }
}
