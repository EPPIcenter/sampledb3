/**
 * Credentials and setup payload for E2E runs. Seeded via POST /api/setup/initialize
 * when the DB has no users (see global-setup.ts).
 */
export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'E2ETestPass1!';

/** Minimal valid body for packages/api/src/routes/setup.ts initialize handler */
export function getInitializePayload(): Record<string, unknown> {
  return {
    adminName: 'E2E Admin',
    adminEmail: E2E_ADMIN_EMAIL,
    adminPassword: E2E_ADMIN_PASSWORD,
    storageTypes: [{ name: 'Freezer -20°C', description: 'E2E storage' }],
    specimenTypes: [{ name: 'Whole Blood', containerTypes: ['paper', 'cryovial_tube'] }],
    units: [
      { name: 'Generic items', symbol: 'items', category: 'count' },
      { name: 'DBS spots', symbol: 'spots', category: 'count' },
      { name: 'Cryovial tubes', symbol: 'tubes', category: 'count' },
      { name: 'Microliter', symbol: 'µL', category: 'volume' },
      { name: 'Milliliter', symbol: 'mL', category: 'volume' },
    ],
    locations: [{ name: 'E2E Root Lab', storageTypeId: 'Freezer -20°C' }],
  };
}

/**
 * Ensures the app has completed first-time setup (admin user exists).
 * Safe to call when already initialized (no-op).
 */
export async function ensureInitialized(baseURL: string): Promise<void> {
  const statusRes = await fetch(`${baseURL}/api/setup/status`);
  if (!statusRes.ok) {
    throw new Error(`GET /api/setup/status failed: ${statusRes.status}`);
  }
  const status = (await statusRes.json()) as { initialized?: boolean };
  if (status.initialized) return;

  const initRes = await fetch(`${baseURL}/api/setup/initialize`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(getInitializePayload()),
  });

  if (initRes.ok) return;

  const body = await initRes.text();
  if (initRes.status === 400 && body.includes('already initialized')) return;

  throw new Error(`POST /api/setup/initialize failed: ${initRes.status} ${body}`);
}
