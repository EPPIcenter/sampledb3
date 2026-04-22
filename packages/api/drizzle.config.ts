import { defineConfig } from 'drizzle-kit'

// Used when regenerating the initial schema: run `bunx drizzle-kit generate`, then copy
// the generated 0000_*.sql to initial_schema.sql and delete the drizzle/ folder.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './sampledb_dev.sqlite',
  },
})
