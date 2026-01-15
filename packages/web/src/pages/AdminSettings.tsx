import Settings from './Settings'

/**
 * Admin Settings page - wraps the existing Settings page
 * Admin-only access is enforced by AdminGuard in routes
 */
export default function AdminSettings() {
  return <Settings />
}
