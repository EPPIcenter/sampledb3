/**
 * Copy and verify non-TypeScript files the API reads at runtime from dist/.
 *
 * tsc only emits JavaScript; anything resolved via import.meta.url next to
 * compiled modules must be copied here. Wired into `bun run build`.
 */
import { cpSync, existsSync, mkdirSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const packageRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Directory copies applied after tsc. Add entries when new on-disk runtime assets appear. */
export const RUNTIME_ASSETS = [
  { from: 'src/db/migrations', to: 'dist/db/migrations' },
] as const

export function copyRuntimeAssets(): void {
  for (const { from, to } of RUNTIME_ASSETS) {
    const src = join(packageRoot, from)
    const dest = join(packageRoot, to)

    if (!existsSync(src)) {
      throw new Error(`Runtime asset source missing: ${src}`)
    }

    mkdirSync(dirname(dest), { recursive: true })
    cpSync(src, dest, { recursive: true })
  }
}

export async function verifyDistAssets(): Promise<void> {
  for (const { to } of RUNTIME_ASSETS) {
    const dest = join(packageRoot, to)
    if (!existsSync(dest)) {
      throw new Error(`Runtime asset not copied to dist: ${to}`)
    }
  }

  const srcMigrationsDir = join(packageRoot, 'src/db/migrations')
  const distMigrationsDir = join(packageRoot, 'dist/db/migrations')
  const srcSqlFiles = readdirSync(srcMigrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  const distSqlFiles = readdirSync(distMigrationsDir)
    .filter((name) => name.endsWith('.sql'))
    .sort()

  if (srcSqlFiles.join('\n') !== distSqlFiles.join('\n')) {
    throw new Error(
      `dist/db/migrations is out of sync with src/db/migrations.\n` +
        `  src:  ${srcSqlFiles.join(', ') || '(none)'}\n` +
        `  dist: ${distSqlFiles.join(', ') || '(none)'}`,
    )
  }

  const { listNumberedMigrations } = await import('../dist/db/migration-runner.js')
  const distMigrations = listNumberedMigrations()
  if (distMigrations.length !== srcSqlFiles.length) {
    throw new Error(
      `dist migration resolver found ${distMigrations.length} file(s), expected ${srcSqlFiles.length}`,
    )
  }

  const { resolveInitialSchemaPath } = await import('../dist/db/apply-initial-schema.js')
  const initialSchemaPath = resolveInitialSchemaPath()
  if (!existsSync(initialSchemaPath)) {
    throw new Error(`initial_schema.sql not found at resolved path: ${initialSchemaPath}`)
  }
}

async function main(): Promise<void> {
  const command = process.argv[2] ?? 'all'

  if (command === 'copy') {
    copyRuntimeAssets()
    return
  }

  if (command === 'verify') {
    await verifyDistAssets()
    return
  }

  if (command === 'all') {
    copyRuntimeAssets()
    await verifyDistAssets()
    return
  }

  console.error(`Unknown command: ${command}. Use: copy | verify | all`)
  process.exit(1)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`runtime-assets: ${message}`)
    process.exit(1)
  })
}
