import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

const appBuildId = process.env.VITE_APP_BUILD_ID || process.env.APP_BUILD_ID || 'local-dev'

/**
 * Vitest Configuration
 * 
 * NOTE: Known Issue - Stack Overflow During Cleanup
 * 
 * You may see a "Maximum call stack size exceeded" error after tests complete.
 * This is a known Vitest/tinypool issue with worker cleanup.
 * 
 * - All tests pass successfully before the error
 * - Error only occurs during worker cleanup/teardown
 * - This is NON-BLOCKING and can be safely ignored
 * - Do not attempt to "fix" this - it's a Vitest/tinypool bug
 * 
 * See: packages/web/src/__tests__/README.md for more details
 */
export default defineConfig({
  define: {
    'import.meta.env.VITE_APP_BUILD_ID': JSON.stringify(appBuildId),
  },
  plugins: [react()],
  test: {
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
        'src/lib/api.ts',
        'dist/**',
      ],
      // Baseline; raise in steps (e.g. 50 → 65 → 80 → 90) as coverage improves (see test coverage plan). CSS and api.ts are excluded.
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
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})

