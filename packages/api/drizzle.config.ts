import { defineConfig } from 'drizzle-kit'

// Regenerate schema snapshot: `bunx drizzle-kit generate`, merge SQL into initial_schema.sql
// (statement-breakpoint separators), delete drizzle/. Tests and production both use that file.
export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_PATH || './sampledb_dev.sqlite',
  },
})
