import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const appBuildId = process.env.VITE_APP_BUILD_ID || process.env.APP_BUILD_ID || 'local-dev'

// Run tests west of UTC so a calendar date parsed as UTC midnight shows the day before and
// fails, wherever CI runs. Test workers inherit this.
process.env.TZ = 'America/Los_Angeles'

export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
  },
  plugins: [react()],
  test: {
    testTimeout: 5_000,
    hookTimeout: 5_000,
    teardownTimeout: 3_000,
    pool: 'forks',
    maxWorkers: 4,
    minWorkers: 1,
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/*.config.*',
        'src/**/__tests__/**',
        'src/main.tsx',
        'src/**/*.css',
        'src/lib/api/**',
        'dist/**',
      ],
      // A floor, not the target. Targets: Coverage in the root README.md.
      thresholds: {
        statements: 35,
        branches: 26,
        functions: 28,
        lines: 35,
      },
      reportOnFailure: true,
    },
  },
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },
})

