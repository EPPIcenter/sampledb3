export type { Database, OperationalDatabase } from './open'
export { getMonorepoRoot, openOperationalDatabase } from './open'
export { CURRENT_SCHEMA_VERSION, evolveOperationalSchema, getRecordedSchemaVersion } from './schema-evolution'
