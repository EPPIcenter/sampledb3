import { sqliteTable, text, integer, real, check, primaryKey, unique, index } from 'drizzle-orm/sqlite-core'
import { sql, type InferSelectModel } from 'drizzle-orm'

// Type exports for all database tables
export type User = InferSelectModel<typeof users>
export type Session = InferSelectModel<typeof sessions>
export type Tag = InferSelectModel<typeof tag>
export type Unit = InferSelectModel<typeof unit>
export type Study = InferSelectModel<typeof study>
export type StudySubject = InferSelectModel<typeof studySubject>
export type ControlDefinition = InferSelectModel<typeof controlDefinition>
export type ControlBatch = InferSelectModel<typeof controlBatch>
export type Reagent = InferSelectModel<typeof reagent>
export type CellLine = InferSelectModel<typeof cellLine>
export type Plasmid = InferSelectModel<typeof plasmid>
export type Standard = InferSelectModel<typeof standard>
export type SpecimenType = InferSelectModel<typeof specimenType>
export type Specimen = InferSelectModel<typeof specimen>
export type StorageContainer = InferSelectModel<typeof storageContainer>
export type StorageContainerTag = InferSelectModel<typeof storageContainerTag>
export type Location = InferSelectModel<typeof location>
export type MicronixPlate = InferSelectModel<typeof micronixPlate>
export type MicronixTube = InferSelectModel<typeof micronixTube>
export type CryovialBox = InferSelectModel<typeof cryovialBox>
export type CryovialTube = InferSelectModel<typeof cryovialTube>
export type Box = InferSelectModel<typeof box>
export type Bag = InferSelectModel<typeof bag>
export type Sheet = InferSelectModel<typeof sheet>
export type Paper = InferSelectModel<typeof paper>
export type StaticWell = InferSelectModel<typeof staticWell>
export type Strain = InferSelectModel<typeof strain>
export type StorageType = InferSelectModel<typeof storageType>
export type Version = InferSelectModel<typeof version>
export type Settings = InferSelectModel<typeof settings>
export type SpecimenTypeContainerType = InferSelectModel<typeof specimenTypeContainerType>
export type ContainerTypeUnit = InferSelectModel<typeof containerTypeUnit>
export type ContainerDerivation = InferSelectModel<typeof containerDerivation>
export type QpcrExperiment = InferSelectModel<typeof qpcrExperiment>
export type QpcrExperimentWell = InferSelectModel<typeof qpcrExperimentWell>
export type QpcrRun = InferSelectModel<typeof qpcrRun>
export type QpcrWellResult = InferSelectModel<typeof qpcrWellResult>
export type QpcrAmplificationData = InferSelectModel<typeof qpcrAmplificationData>

// Users and authentication
export const users = sqliteTable('users', {
  id: integer('id').primaryKey(),
  email: text('email').notNull().unique(),
  username: text('username').unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull(), // 'admin', 'member', 'viewer'
  createdAt: text('created').notNull().default(sql`current_timestamp`),
  lastLogin: text('last_login'),
  deletedAt: text('deleted_at'), // Soft delete timestamp
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

// Unit table - simplified (conversion and compound unit features removed for now)
export const unit = sqliteTable('unit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  symbol: text('symbol').notNull().unique(),
  name: text('name').notNull(),
  category: text('category').notNull(), // 'volume', 'mass', 'count', 'concentration', 'other'
})

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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  titleIdx: index('study_title_idx').on(table.title),
  shortCodeIdx: index('study_short_code_idx').on(table.shortCode),
}))

export const studySubject = sqliteTable('study_subject', {
  id: integer('id').primaryKey(),
  studyId: integer('study_id').notNull().references(() => study.id),
  name: text('name').notNull(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  studyIdIdx: index('study_subject_study_id_idx').on(table.studyId),
  nameIdx: index('study_subject_name_idx').on(table.name),
}))

// Control Production Hierarchy
export const controlDefinition = sqliteTable('control_definition', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull().unique(),
  controlType: text('control_type').notNull(), // 'blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative'
  properties: text('properties', { mode: 'json' }), // JSON field - stores type-specific data (strains, density, etc.)
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  controlTypeCheck: check('control_type_check', sql`${table.controlType} IN ('blood', 'plasma_positive', 'plasma_negative', 'antibody', 'extraction', 'negative')`)
}))

export const controlBatch = sqliteTable('control_batch', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  controlDefinitionId: integer('control_definition_id').notNull().references(() => controlDefinition.id),
  name: text('name').notNull().unique(),
  productionDate: text('production_date'), // DATE as text
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  controlDefinitionIdIdx: index('control_batch_control_definition_id_idx').on(table.controlDefinitionId),
}))

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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  specimenSubjectXorControl: check('specimen_subject_xor_control', sql`
    (${table.studySubjectId} IS NOT NULL AND ${table.controlBatchId} IS NULL) OR
    (${table.studySubjectId} IS NULL AND ${table.controlBatchId} IS NOT NULL)
  `),
  studySubjectIdIdx: index('specimen_study_subject_id_idx').on(table.studySubjectId),
  controlBatchIdIdx: index('specimen_control_batch_id_idx').on(table.controlBatchId),
  collectionDateIdx: index('specimen_collection_date_idx').on(table.collectionDate),
  specimenTypeIdIdx: index('specimen_specimen_type_id_idx').on(table.specimenTypeId),
}))

export const storageContainer = sqliteTable('storage_container', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  specimenId: integer('specimen_id').notNull().references(() => specimen.id),
  comment: text('comment'),
  totalQuantity: real('total_quantity').default(1.0),
  remainingQuantity: real('remaining_quantity').default(1.0),
  unitId: integer('unit_id').notNull().references(() => unit.id),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  specimenIdIdx: index('storage_container_specimen_id_idx').on(table.specimenId),
}))

export const storageContainerTag = sqliteTable('storage_container_tag', {
  storageContainerId: integer('storage_container_id').notNull().references(() => storageContainer.id),
  tagId: integer('tag_id').notNull().references(() => tag.id),
}, (t) => ({
  pk: primaryKey(t.storageContainerId, t.tagId),
}))

// Locations (hierarchical parent-child structure)
// Only root locations (parent_id IS NULL) have storage_type_id
// Using type assertion to handle circular reference
const locationTable = sqliteTable('location', {
  id: integer('id').primaryKey(),
  parentId: integer('parent_id').references((): any => locationTable),
  name: text('name').notNull(),
  storageTypeId: text('storage_type_id'), // Only required for root locations (parent_id IS NULL)
  description: text('description'),
  canContainCollections: integer('can_contain_collections', { mode: 'boolean' }).notNull().default(false),
  path: text('path'), // Materialized path for performance
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  parentNameUnique: unique().on(table.parentId, table.name),
  parentIdIdx: index('idx_location_parent_id').on(table.parentId),
  pathIdx: index('idx_location_path').on(table.path),
  storageTypeConstraint: check('storage_type_constraint', sql`(${table.parentId} IS NULL AND ${table.storageTypeId} IS NOT NULL) OR (${table.parentId} IS NOT NULL AND ${table.storageTypeId} IS NULL)`),
}))

export const location = locationTable

// Container collections
export const micronixPlate = sqliteTable('micronix_plate', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  barcode: text('barcode').unique(),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  locationIdIdx: index('micronix_plate_location_id_idx').on(table.locationId),
}))

export const micronixTube = sqliteTable('micronix_tube', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  collectionId: integer('collection_id').notNull().references(() => micronixPlate.id),
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
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  locationIdIdx: index('cryovial_box_location_id_idx').on(table.locationId),
}))

export const cryovialTube = sqliteTable('cryovial_tube', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  collectionId: integer('collection_id').notNull().references(() => cryovialBox.id),
  barcode: text('barcode'),
  position: text('position'),
})

export const box = sqliteTable('box', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
})

export const bag = sqliteTable('bag', {
  id: integer('id').primaryKey(),
  locationId: integer('location_id').notNull().references(() => location.id),
  name: text('name').notNull().unique(),
  created: text('created').notNull(),
  lastUpdated: text('last_updated').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  locationIdIdx: index('bag_location_id_idx').on(table.locationId),
}))

export const sheet = sqliteTable('sheet', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name').notNull(),
  boxId: integer('box_id').references(() => box.id),
  bagId: integer('bag_id').references(() => bag.id),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (t) => ({
  sheetParentCheck: check('sheet_parent_check', sql`
    (${t.boxId} IS NOT NULL AND ${t.bagId} IS NULL) OR
    (${t.boxId} IS NULL AND ${t.bagId} IS NOT NULL) OR
    (${t.boxId} IS NULL AND ${t.bagId} IS NULL)
  `),
  unq: unique().on(t.name, t.boxId, t.bagId)
}))

export const paper = sqliteTable('paper', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  sheetId: integer('sheet_id').notNull().references(() => sheet.id),
  barcode: text('barcode'),
  position: text('position'),
})

export const staticWell = sqliteTable('static_well', {
  id: integer('id').primaryKey().references(() => storageContainer.id),
  collectionId: integer('collection_id').notNull().references(() => micronixPlate.id),
  position: text('position'),
})

// Additional reference tables
export const strain = sqliteTable('strain', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
})

export const storageType = sqliteTable('storage_type', {
  id: integer('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description'),
})

export const version = sqliteTable('version', {
  name: text('name').notNull(),
})

// Application settings (user-configurable defaults)
// userId is NULL for system-wide settings, set for user-specific settings
export const settings = sqliteTable('settings', {
  key: text('key').notNull(),
  userId: integer('user_id').references(() => users.id), // nullable for system settings
  value: text('value', { mode: 'json' }).notNull(),
}, (table) => ({
  pk: primaryKey(table.key, table.userId), // Composite primary key
  // Index for efficient user settings lookup
  userIdIdx: index('settings_user_id_idx').on(table.userId),
}))

// Constraint junction tables
export const specimenTypeContainerType = sqliteTable('specimen_type_container_type', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  specimenTypeId: integer('specimen_type_id').notNull().references(() => specimenType.id, { onDelete: 'cascade' }),
  containerType: text('container_type').notNull(), // 'paper', 'cryovial_tube', 'micronix_tube', 'static_well'
  created: text('created').notNull().default(sql`current_timestamp`),
}, (table) => ({
  uniqueCombination: unique().on(table.specimenTypeId, table.containerType),
  containerTypeCheck: check('container_type_check', sql`${table.containerType} IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')`)
}))

export const containerTypeUnit = sqliteTable('container_type_unit', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  containerType: text('container_type').notNull(), // 'paper', 'cryovial_tube', 'micronix_tube', 'static_well'
  unitId: integer('unit_id').notNull().references(() => unit.id, { onDelete: 'cascade' }),
  created: text('created').notNull().default(sql`current_timestamp`),
}, (table) => ({
  uniqueCombination: unique().on(table.containerType, table.unitId),
  containerTypeCheck: check('container_type_check', sql`${table.containerType} IN ('paper', 'cryovial_tube', 'micronix_tube', 'static_well')`)
}))

// Container derivations: track parent/child relationships between storage containers
export const containerDerivation = sqliteTable('container_derivation', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  parentContainerId: integer('parent_container_id').notNull().references(() => storageContainer.id),
  childContainerId: integer('child_container_id').notNull().references(() => storageContainer.id),
  derivationType: text('derivation_type').notNull(),
  derivationDate: text('derivation_date'),
  operatorId: integer('operator_id').references(() => users.id),
  protocol: text('protocol'),
  notes: text('notes'),
  properties: text('properties', { mode: 'json' }),
  created: text('created').notNull().default(sql`current_timestamp`),
}, (table) => ({
  parentChildCheck: check(
    'container_derivation_parent_child_check',
    sql`${table.parentContainerId} != ${table.childContainerId}`,
  ),
  childUnique: unique('container_derivation_child_unique').on(table.childContainerId),
  parentIdx: index('idx_container_derivation_parent').on(table.parentContainerId),
  childIdx: index('idx_container_derivation_child').on(table.childContainerId),
  typeIdx: index('idx_container_derivation_type').on(table.derivationType),
  dateIdx: index('idx_container_derivation_date').on(table.derivationDate),
}))

// Error logging table
export const errorLogs = sqliteTable('error_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  timestamp: text('timestamp').notNull().default(sql`current_timestamp`),
  source: text('source').notNull(), // 'frontend' | 'backend'
  level: text('level').notNull(), // 'error' | 'warning' | 'info'
  message: text('message').notNull(),
  errorCode: text('error_code'),
  stack: text('stack'),
  context: text('context', { mode: 'json' }), // JSON field for additional context
  userId: integer('user_id'), // Optional user ID if available
  url: text('url'), // Request URL for backend, page URL for frontend
  userAgent: text('user_agent'),
  resolved: integer('resolved', { mode: 'boolean' }).notNull().default(false),
  resolvedAt: text('resolved_at'),
  resolvedBy: integer('resolved_by'), // User ID who resolved it
}, (table) => ({
  timestampIdx: index('error_logs_timestamp_idx').on(table.timestamp),
  sourceIdx: index('error_logs_source_idx').on(table.source),
  levelIdx: index('error_logs_level_idx').on(table.level),
  resolvedIdx: index('error_logs_resolved_idx').on(table.resolved),
}))

// qPCR experiments: plate layout + template + results workflow
export const qpcrExperiment = sqliteTable('qpcr_experiment', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  name: text('name'),
  templateFormat: text('template_format').notNull(), // 'biorad' | 'quant_studio'
  status: text('status').notNull(), // 'setup' | 'template_exported' | 'results_uploaded'
  standardLayout: text('standard_layout', { mode: 'json' }), // optional mapping of positions to standard labels / control batch
  plateBarcode: text('plate_barcode'),
  targetName: text('target_name'),
  created: text('created').notNull().default(sql`current_timestamp`),
  lastUpdated: text('last_updated').notNull().default(sql`current_timestamp`),
  createdBy: integer('created_by').references(() => users.id),
  updatedBy: integer('updated_by').references(() => users.id),
}, (table) => ({
  statusIdx: index('qpcr_experiment_status_idx').on(table.status),
}))

export const qpcrExperimentWell = sqliteTable('qpcr_experiment_well', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  qpcrExperimentId: integer('qpcr_experiment_id').notNull().references(() => qpcrExperiment.id, { onDelete: 'cascade' }),
  wellPosition: text('well_position').notNull(), // e.g. A01
  barcode: text('barcode'),
  storageContainerId: integer('storage_container_id').references(() => storageContainer.id),
  specimenId: integer('specimen_id').references(() => specimen.id),
  // Result fields (filled on results upload)
  contentType: text('content_type'), // 'standard' | 'unknown' | 'negative'
  standardDensity: real('standard_density'),
  cq: real('cq'),
  startingQuantity: real('starting_quantity'),
  cqMean: real('cq_mean'),
  rawSampleName: text('raw_sample_name'),
}, (table) => ({
  experimentWellUnique: unique('qpcr_experiment_well_unique').on(table.qpcrExperimentId, table.wellPosition),
  experimentIdx: index('qpcr_experiment_well_experiment_idx').on(table.qpcrExperimentId),
  specimenIdx: index('qpcr_experiment_well_specimen_idx').on(table.specimenId),
}))

// qPCR run: one per uploaded result file
export const qpcrRun = sqliteTable('qpcr_run', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  qpcrExperimentId: integer('qpcr_experiment_id').notNull().references(() => qpcrExperiment.id, { onDelete: 'cascade' }),
  instrumentType: text('instrument_type').notNull(), // 'Biorad_CFX' | 'QuantStudio'
  runStartedAt: text('run_started_at'),
  runEndedAt: text('run_ended_at'),
  experimentName: text('experiment_name'),
  fileName: text('file_name'),
  created: text('created').notNull().default(sql`current_timestamp`),
  slope: real('slope'),
  yIntercept: real('y_intercept'),
  rSquared: real('r_squared'),
  efficiency: real('efficiency'),
}, (table) => ({
  experimentIdx: index('qpcr_run_experiment_idx').on(table.qpcrExperimentId),
}))

// qPCR well result: per-well, per-target result from a run
export const qpcrWellResult = sqliteTable('qpcr_well_result', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  qpcrRunId: integer('qpcr_run_id').notNull().references(() => qpcrRun.id, { onDelete: 'cascade' }),
  wellPosition: text('well_position').notNull(),
  targetName: text('target_name'),
  sampleBarcode: text('sample_barcode'),
  task: text('task'), // STANDARD | NTC | UNKNOWN
  cq: real('cq'),
  quantity: real('quantity'),
  standardQuantity: real('standard_quantity'),
  ampStatus: text('amp_status'),
}, (table) => ({
  runWellTargetUnique: unique('qpcr_well_result_run_well_target_unique').on(table.qpcrRunId, table.wellPosition, table.targetName),
  runIdx: index('qpcr_well_result_run_idx').on(table.qpcrRunId),
}))

// qPCR amplification data: cycle-by-cycle (QuantStudio); optional
export const qpcrAmplificationData = sqliteTable('qpcr_amplification_data', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  qpcrWellResultId: integer('qpcr_well_result_id').notNull().references(() => qpcrWellResult.id, { onDelete: 'cascade' }),
  cycle: integer('cycle').notNull(),
  rn: real('rn'),
  deltaRn: real('delta_rn'),
}, (table) => ({
  wellResultIdx: index('qpcr_amplification_data_well_result_idx').on(table.qpcrWellResultId),
}))
