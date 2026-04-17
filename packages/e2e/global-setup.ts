import { ensureInitialized } from './helpers/e2e-seed';

/**
 * Runs after webServer reports the frontend URL ready; ensures the API behind
 * the Vite proxy is accepting traffic, then seeds an empty DB via /api/setup/initialize.
 */
export default async function globalSetup(): Promise<void> {
  const baseURL = 'http://localhost:5173';

  const deadline = Date.now() + 120_000;
  let apiReady = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseURL}/api`);
      if (res.ok) {
        apiReady = true;
        break;
      }
    } catch {
      // Proxy or API not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!apiReady) {
    throw new Error(`API at ${baseURL}/api did not become ready in time`);
  }

  await ensureInitialized(baseURL);
}
