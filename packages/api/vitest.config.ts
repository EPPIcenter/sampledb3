import { defineConfig } from 'vitest/config'
import path from 'path'

/**
 * Vitest Configuration
 * 
 * NOTE: Known Issue - Stack Overflow During Cleanup
 * 
 * You may see a "Maximum call stack size exceeded" error after tests complete.
 * This is a known Vitest/tinypool issue with native modules (better-sqlite3).
 * 
 * - All tests pass successfully before the error
 * - Error only occurs during worker cleanup/teardown
 * - This is NON-BLOCKING and can be safely ignored
 * - Do not attempt to "fix" this - it's a Vitest/tinypool bug
 * 
 * See: packages/api/src/__tests__/README.md for more details
 */
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['node_modules', 'dist', '.idea', '.git', '.cache'],
    // Use forks pool for native modules (better-sqlite3)
    // This prevents segmentation faults and worker termination issues
    // Note: This may cause a non-blocking stack overflow during cleanup
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/**/*.d.ts',
        'src/**/*.config.*',
        'src/**/__tests__/**',
        'dist/**',
      ],
      thresholds: {
        statements: 60,
        branches: 60,
        functions: 60,
        lines: 60,
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

