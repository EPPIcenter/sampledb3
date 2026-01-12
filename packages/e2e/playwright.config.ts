import { defineConfig, devices } from '@playwright/test';
import path from 'path';
import dotenv from 'dotenv'; // E2E package doesn't have dotenv yet, need to install it? Yes, added to package.json plan.

// Load environment variables from .env file if it exists, though largely we rely on direct config
dotenv.config();

const API_PORT = 3001;
const WEB_PORT = 5174;
const DATABASE_PATH = path.resolve(__dirname, 'sampledb_e2e.sqlite');

export default defineConfig({
    testDir: './src/tests',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: 'html',
    use: {
        baseURL: `http://localhost:${WEB_PORT}`,
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
    webServer: [
        {
            command: `cd ../api && PORT=${API_PORT} DATABASE_PATH=${DATABASE_PATH} bun --watch src/index.ts`,
            url: `http://localhost:${API_PORT}/health`,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        },
        {
            command: `cd ../web && PORT=${WEB_PORT} API_TARGET=http://localhost:${API_PORT} bun dev --port ${WEB_PORT}`,
            url: `http://localhost:${WEB_PORT}`,
            reuseExistingServer: !process.env.CI,
            stdout: 'pipe',
            stderr: 'pipe',
        }
    ],
});
