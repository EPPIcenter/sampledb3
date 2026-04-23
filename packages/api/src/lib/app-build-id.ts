const DEFAULT = 'local-dev'

/**
 * Single deployment / build id for the API + static web (same in Docker: APP_BUILD_ID).
 * Used by GET /api/app-version and the web client's drift detection.
 */
export function getAppBuildId(): string {
  const v = process.env.APP_BUILD_ID?.trim()
  return v && v.length > 0 ? v : DEFAULT
}
