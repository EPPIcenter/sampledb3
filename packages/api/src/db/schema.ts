import { sqliteTable, text, integer, real, check, primaryKey, unique } from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// Users and authentication
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // 'admin', 'member', 'viewer'
  createdAt: text('created').notNull().default(sql`current_timestamp`),
  lastLogin: text('last_login'),
})

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: integer('user_id').notNull().references(() => users.id),
  expiresAt: integer('expires_at').notNull(),
})

// Tags and Units (Standardized System)
export const tag = sqliteTable('tag', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
})

// Unit table with self-references - using type assertion to avoid circular type inference
export const unit: ReturnType<typeof sqliteTable> = sqliteTable('unit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'volume', 'count', 'concentration', etc.
  baseUnitId: integer('base_unit_id').references(() => (unit as any).id),
  conversionToBase: real('conversion_to_base').default(1.0),
  numeratorUnitId: integer('numerator_unit_id').references(() => (unit as any).id),
  denominatorUnitId: integer('denominator_unit_id').references(() => (unit as any).id),
}) as any

// Studies and subjects (existing tables)
export const study = sqliteTable('study', {
  id: integer('id').primaryKey(),
  title: text('title').notNull().unique(),
  description: text('description'),
  shortCode: text('short_code').notNull().unique(),
  isLongitudinal: integer('is_longitudinal', { mode: 'boolean' }).notNull(),
  leadPerson: text('lead_person').notNull(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
})

export const studySubject = sqliteTable('study_subject', {
  id: integer('id').primaryKey(),
  studyId: integer('study_id').notNull().references(() => study.id),
  name: text('name').notNull(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
})

// Control Production Hierarchy
export const controlDefinition = sqliteTable('control_definition', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  controlType: text('control_type').notNull(), // 'blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative'
  compositionId: integer('composition_id').references(() => composition.id),
  targetDensity: real('target_density'),
  targetDensityUnitId: integer('target_density_unit_id').references(() => unit.id),
  properties: text('properties', { mode: 'json' }), // JSON field
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
}, (table) => ({
  controlTypeCheck: check('control_type_check', sql`${table.controlType} IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative')`)
}))

export const controlBatch = sqliteTable('control_batch', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  controlDefinitionId: integer('control_definition_id').notNull().references(() => controlDefinition.id),
  name: text('name').notNull(),
  productionDate: text('production_date'), // DATE as text
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

// Other polymorphic source tables
export const reagent = sqliteTable('reagent', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  reagentType: text('reagent_type').notNull(), // 'antibody', 'primer', etc.
  vendor: text('vendor'),
  catalogNumber: text('catalog_number'),
  lotNumber: text('lot_number'),
  receivedDate: text('received_date'),
  expirationDate: text('expiration_date'),
  storageTemp: text('storage_temp'),
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const cellLine = sqliteTable('cell_line', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  species: text('species').notNull(),
  strain: text('strain'),
  source: text('source'),
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const plasmid = sqliteTable('plasmid', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  backbone: text('backbone'),
  insertName: text('insert_name'),
  insertSizeBp: integer('insert_size_bp'),
  resistance: text('resistance'),
  source: text('source'),
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const standard = sqliteTable('standard', {
  id: integer('id').primaryKey(),
  name: text('name').notNull(),
  standardType: text('standard_type').notNull(),
  manufacturer: text('manufacturer'),
  catalogNumber: text('catalog_number'),
  lotNumber: text('lot_number'),
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

// Specimen types (existing)
export const specimenType = sqliteTable('specimen_type', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
})

// Core specimen table (Refactored for explicit sources)
export const specimen = sqliteTable('specimen', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  studySubjectId: integer('study_subject_id').references(() => studySubject.id),
  controlBatchId: integer('control_batch_id').references(() => controlBatch.id),
  specimenTypeId: integer('specimen_type_id').notNull().references(() => specimenType.id),
  collectionDate: text('collection_date'),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

// States (existing)
export const state = sqliteTable('state', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
})

// Storage containers (Refactored with quantity tracking)
export const storageContainer = sqliteTable('storage_container', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  specimenId: integer('specimen_id').notNull().references(() => specimen.id),
  comment: text('comment'),
  stateId: integer('state_id').notNull().references(() => state.id),
  totalQuantity: real('total_quantity').default(1.0),
  remainingQuantity: real('remaining_quantity').default(1.0),
  unitId: integer('unit_id').notNull().references(() => unit.id),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const storageContainerTag = sqliteTable('storage_container_tag', {
  storageContainerId: integer('storage_container_id').notNull().references(() => storageContainer.id),
  tagId: integer('tag_id').notNull().references(() => tag.id),
}, (t) => ({
  pk: primaryKey(t.storageContainerId, t.tagId),
}))

// Locations (existing)
export const location = sqliteTable('location', {
  id: integer('id').primaryKey(),
  locationRoot: text('location_root').notNull(),
  storageTypeId: text('storage_type_id').notNull(),
  description: text('description'),
  levelI: text('level_I').notNull(),
  levelII: text('level_II').notNull(),
  levelIII: text('level_III'),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

// Container manifests
export const micronixPlate = sqliteTable('micronix_plate', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  barcode: text('barcode').unique(),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const micronixTube = sqliteTable('micronix_tube', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  manifestId: integer('manifest_id').notNull().references(() => micronixPlate.id),
  barcode: text('barcode').notNull().unique(),
  position: text('position'),
})

export const cryovialBox = sqliteTable('cryovial_box', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  barcode: text('barcode').unique(),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
})

export const cryovialTube = sqliteTable('cryovial_tube', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  manifestId: integer('manifest_id').notNull().references(() => cryovialBox.id),
  barcode: text('barcode'),
  position: text('position'),
})

export const box = sqliteTable('box', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
})

export const bag = sqliteTable('bag', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
})

export const sheet = sqliteTable('sheet', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  boxId: integer('box_id').references(() => box.id),
  bagId: integer('bag_id').references(() => bag.id),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
}, (t) => ({
  unq: unique().on(t.name, t.boxId, t.bagId)
}))

export const tube = sqliteTable('tube', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  boxId: integer('box_id').notNull().references(() => box.id),
  boxPosition: text('box_position').notNull(),
  label: text('label').notNull(),
})

export const paper = sqliteTable('paper', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  sheetId: integer('sheet_id').notNull().references(() => sheet.id),
  barcode: text('barcode'),
  position: text('position'),
})

export const staticWell = sqliteTable('static_well', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  manifestId: integer('manifest_id').notNull().references(() => micronixPlate.id),
  position: text('position'),
})

// Additional reference tables
export const strain = sqliteTable('strain', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
})

export const composition = sqliteTable('composition', {
  id: integer('id').primaryKey(),
  index: integer('index'),
  label: text('label').notNull(),
  legacy: integer('legacy').notNull(),
})

export const compositionStrain = sqliteTable('composition_strain', {
  id: integer('id').primaryKey(),
  compositionId: integer('composition_id').notNull().references(() => composition.id),
  strainId: integer('strain_id').notNull().references(() => strain.id),
  percentage: real('percentage').notNull(),
})

export const sampleType = sqliteTable('sample_type', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
  parentId: integer('parent_id'),
})

export const storageType = sqliteTable('storage_type', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
})

export const version = sqliteTable('version', {
  name: text('name').notNull(),
})
