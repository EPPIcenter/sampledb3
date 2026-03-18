import type { Database } from '../db/client'
import { settings } from '../db/schema'
import { eq, and, isNull } from 'drizzle-orm'

// Type definitions for settings
export interface ContainerDefaults {
  micronix_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  cryovial_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  paper: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  static_well: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
}

export interface PaginationSettings {
  defaultPageSize: number
  maxPageSize: number
}

export interface PasswordRequirements {
  minLength: number
}

export interface SessionSettings {
  maxAgeSeconds: number
}

export interface ExportConfiguration {
  name: string
  columns: string[]
  isDefault?: boolean
}

export interface ExportConfigurations {
  configurations: ExportConfiguration[]
}

export interface ScannerConfiguration {
  id: string
  name: string
  barcodeColumn: string
  positionType: 'single' | 'combined'
  positionColumn?: string
  rowColumn?: string
  columnColumn?: string
  skipRows: number
  isDefault?: boolean
  /** Default: infer plate from CSV filename. `column` uses a repeated header column. */
  plateNameSource?: 'filename' | 'column'
  plateNameColumn?: string
}

export interface ScannerConfigurations {
  configurations: ScannerConfiguration[]
}

export interface TableViewConfiguration {
  name: string
  columns: string[]
  isDefault?: boolean
}

export interface TableViewConfigurations {
  configurations: TableViewConfiguration[]
}

/** Default table view configuration seeded at setup and by seed script. */
export const DEFAULT_TABLE_VIEW_CONFIGURATIONS: TableViewConfigurations = {
  configurations: [
    {
      name: 'Default',
      columns: [
        'position',
        'barcode',
        'subject_name',
        'study_code',
        'specimen_type',
        'collection_date',
        'comment',
        'status',
        'created',
        'last_updated',
      ],
      isDefault: true,
    },
  ],
}

// Cache for settings to avoid repeated queries
// Cache key format: "dbId:key" for system settings, "dbId:key:userId" for user settings
// Using WeakMap to allow garbage collection when database instances are no longer referenced
const settingsCache = new Map<string, any>()

function getCacheKey(db: Database, key: string, userId: number | null): string {
  // Use a simple identifier for the database (could be improved with a unique ID)
  const dbId = (db as any)._id || String(db)
  return userId !== null ? `${dbId}:${key}:${userId}` : `${dbId}:${key}`
}

/**
 * Generic getter for any setting
 * @param db - Database instance
 * @param key - Setting key
 * @param userId - Optional user ID. If provided, gets user-specific setting; if null, gets system setting
 */
export async function getSetting<T>(db: Database, key: string, userId: number | null = null): Promise<T | null> {
  const cacheKey = getCacheKey(db, key, userId)
  
  // Check cache first
  if (settingsCache.has(cacheKey)) {
    return settingsCache.get(cacheKey) as T
  }

  const setting = await db
    .select()
    .from(settings)
    .where(
      userId !== null
        ? and(eq(settings.key, key), eq(settings.userId, userId))
        : and(eq(settings.key, key), isNull(settings.userId))
    )
    .get()

  if (!setting) {
    return null
  }

  const value = setting.value as T
  settingsCache.set(cacheKey, value)
  return value
}

/**
 * Generic setter for any setting
 * @param db - Database instance
 * @param key - Setting key
 * @param value - Setting value
 * @param userId - Optional user ID. If provided, saves as user-specific; if null, saves as system-wide
 */
export async function setSetting<T>(db: Database, key: string, value: T, userId: number | null = null): Promise<void> {
  // SQLite treats NULL as distinct in unique/primary keys, so ON CONFLICT never matches
  // an existing (key, NULL) row. For system-wide settings (userId null), delete any existing
  // row first so we have exactly one, then insert.
  if (userId === null) {
    await db.delete(settings).where(and(eq(settings.key, key), isNull(settings.userId)))
  }

  await db
    .insert(settings)
    .values({
      key,
      userId: userId ?? null,
      value: value as any,
    })
    .onConflictDoUpdate({
      target: [settings.key, settings.userId],
      set: {
        value: value as any,
      },
    })

  // Update cache
  const cacheKey = getCacheKey(db, key, userId)
  settingsCache.set(cacheKey, value)
  
  // Also clear system cache if setting user-specific (to ensure fallback works)
  if (userId !== null) {
    const systemCacheKey = getCacheKey(db, key, null)
    settingsCache.delete(systemCacheKey)
  }
}

/**
 * Get user setting with fallback to system default
 * @param db - Database instance
 * @param key - Setting key
 * @param userId - User ID
 * @returns User-specific setting if exists, otherwise system default
 */
export async function getUserSettingWithFallback<T>(db: Database, key: string, userId: number): Promise<T | null> {
  // Try user-specific setting first
  const userSetting = await getSetting<T>(db, key, userId)
  if (userSetting !== null) {
    return userSetting
  }
  
  // Fallback to system default
  return getSetting<T>(db, key, null)
}

/**
 * Delete a user-specific setting (to reset to system default)
 * @param db - Database instance
 * @param key - Setting key
 * @param userId - User ID
 */
export async function deleteUserSetting(db: Database, key: string, userId: number): Promise<void> {
  await db
    .delete(settings)
    .where(and(eq(settings.key, key), eq(settings.userId, userId)))
  
  // Clear cache
  const cacheKey = getCacheKey(db, key, userId)
  settingsCache.delete(cacheKey)
}

/**
 * Get container defaults
 * @param db - Database instance
 */
export async function getContainerDefaults(db: Database): Promise<ContainerDefaults | null> {
  return getSetting<ContainerDefaults>(db, 'container_defaults')
}

/**
 * Set container defaults
 * @param db - Database instance
 */
export async function setContainerDefaults(db: Database, defaults: ContainerDefaults): Promise<void> {
  return setSetting(db, 'container_defaults', defaults)
}

/**
 * Get pagination settings (supports user-specific with system fallback)
 * @param db - Database instance
 */
export async function getPaginationSettings(db: Database, userId?: number | null): Promise<PaginationSettings | null> {
  if (userId !== undefined && userId !== null) {
    return getUserSettingWithFallback<PaginationSettings>(db, 'pagination_settings', userId)
  }
  return getSetting<PaginationSettings>(db, 'pagination_settings', null)
}

/**
 * Set pagination settings
 * @param db - Database instance
 * @param config - Pagination settings
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setPaginationSettings(db: Database, config: PaginationSettings, userId?: number | null): Promise<void> {
  return setSetting(db, 'pagination_settings', config, userId ?? null)
}

/**
 * Get password requirements
 * @param db - Database instance
 */
export async function getPasswordRequirements(db: Database): Promise<PasswordRequirements | null> {
  return getSetting<PasswordRequirements>(db, 'password_requirements')
}

/**
 * Set password requirements
 * @param db - Database instance
 */
export async function setPasswordRequirements(db: Database, requirements: PasswordRequirements): Promise<void> {
  return setSetting(db, 'password_requirements', requirements)
}

/**
 * Get session settings
 * @param db - Database instance
 */
export async function getSessionSettings(db: Database): Promise<SessionSettings | null> {
  return getSetting<SessionSettings>(db, 'session_settings')
}

/**
 * Set session settings
 * @param db - Database instance
 */
export async function setSessionSettings(db: Database, config: SessionSettings): Promise<void> {
  return setSetting(db, 'session_settings', config)
}

/**
 * Get export configurations (merged: system shared + user personal)
 * @param db - Database instance
 * @param userId - Optional user ID. If provided, returns merged configs (shared + personal)
 */
export async function getExportConfigurations(db: Database, userId?: number | null): Promise<ExportConfigurations | null> {
  const systemConfigs = await getSetting<ExportConfigurations>(db, 'export_configurations', null)
  
  if (userId !== undefined && userId !== null) {
    const userConfigs = await getSetting<ExportConfigurations>(db, 'export_configurations', userId)
    
    // Merge: system configs + user personal configs
    if (systemConfigs && userConfigs) {
      // Check if user has a personal default
      const hasPersonalDefault = userConfigs.configurations.some(c => c.isDefault === true)
      
      // Merge configs: shared first, then personal
      const mergedConfigs = [
        // Remove default flag from shared configs if user has a personal default
        ...systemConfigs.configurations.map(c => ({
          ...c,
          isDefault: hasPersonalDefault ? false : c.isDefault,
        })),
        ...userConfigs.configurations,
      ]
      
      return {
        configurations: mergedConfigs,
      }
    } else if (userConfigs) {
      return userConfigs
    }
  }
  
  return systemConfigs
}

/**
 * Get only system-wide shared export configurations
 * @param db - Database instance
 */
export async function getSharedExportConfigurations(db: Database): Promise<ExportConfigurations | null> {
  return getSetting<ExportConfigurations>(db, 'export_configurations', null)
}

/**
 * Get only user-specific personal export configurations
 * @param db - Database instance
 */
export async function getPersonalExportConfigurations(db: Database, userId: number): Promise<ExportConfigurations | null> {
  return getSetting<ExportConfigurations>(db, 'export_configurations', userId)
}

/**
 * Set export configurations
 * @param db - Database instance
 * @param configs - Export configurations
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setExportConfigurations(db: Database, configs: ExportConfigurations, userId?: number | null): Promise<void> {
  return setSetting(db, 'export_configurations', configs, userId ?? null)
}

/**
 * Get default export configuration
 * Checks for a configuration marked as default in export_configurations
 * Prioritizes personal defaults over shared defaults
 * Returns null if no default configuration exists
 * @param db - Database instance
 * @param userId - Optional user ID. If provided, checks personal configs first, then shared
 */
export async function getDefaultExportConfiguration(db: Database, userId?: number | null): Promise<{ columns: string[] } | null> {
  // First check for personal default if userId is provided
  /* eslint-disable @typescript-eslint/no-unnecessary-condition -- optional params and nullable return types */
  if (userId != null) {
    const userConfigs = await getPersonalExportConfigurations(db, userId)
    if (userConfigs != null && userConfigs.configurations) {
      const personalDefault = userConfigs.configurations.find(c => c.isDefault === true)
      if (personalDefault) {
        return { columns: personalDefault.columns }
      }
    }
  }

  /* eslint-enable @typescript-eslint/no-unnecessary-condition */

  // Fall back to shared default
  const systemConfigs = await getSharedExportConfigurations(db)
  if (systemConfigs && systemConfigs.configurations) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    const sharedDefault = systemConfigs.configurations.find(c => c.isDefault === true)
    if (sharedDefault) {
      return { columns: sharedDefault.columns }
    }
  }
  
  return null
}

/**
 * Get export configuration by name
 * Prioritizes personal configs over shared configs when names collide
 * @param db - Database instance
 * @param name - Configuration name
 * @param userId - Optional user ID. If provided, checks personal configs first, then shared
 */
export async function getExportConfigurationByName(db: Database, name: string, userId?: number | null): Promise<{ columns: string[] } | null> {
  // First check for personal config if userId is provided
  if (userId != null) {
    const userConfigs = await getPersonalExportConfigurations(db, userId)
    // userConfigs can be null per API; eslint thinks it's always truthy
    if (userConfigs != null && userConfigs.configurations) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
      const personalConfig = userConfigs.configurations.find(c => c.name === name)
      if (personalConfig) {
        return { columns: personalConfig.columns }
      }
    }
  }
  
  // Fall back to shared config
  const systemConfigs = await getSharedExportConfigurations(db)
  if (systemConfigs && systemConfigs.configurations) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition
    const sharedConfig = systemConfigs.configurations.find(c => c.name === name)
    if (sharedConfig) {
      return { columns: sharedConfig.columns }
    }
  }
  
  return null
}

/**
 * Get scanner configurations (merged: system shared + user personal)
 * @param db - Database instance
 * @param userId - Optional user ID. If provided, returns merged configs (shared + personal)
 */
export async function getScannerConfigurations(db: Database, userId?: number | null): Promise<ScannerConfigurations | null> {
  const systemConfigs = await getSetting<ScannerConfigurations>(db, 'scanner_configurations', null)
  
  // Initialize system defaults if none exist
  if (!systemConfigs || !systemConfigs.configurations || systemConfigs.configurations.length === 0) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- all checks needed for init
    const defaults: ScannerConfigurations = {
      configurations: [
        {
          id: 'traxcer',
          name: 'Traxcer',
          barcodeColumn: 'Tube ID',
          positionType: 'single',
          positionColumn: 'Position',
          skipRows: 0,
          isDefault: true,
        },
        {
          id: 'visionmate',
          name: 'VisionMate',
          barcodeColumn: 'TubeCode',
          positionType: 'combined',
          rowColumn: 'LocationRow',
          columnColumn: 'LocationColumn',
          skipRows: 0,
        },
        {
          id: 'general',
          name: 'General',
          barcodeColumn: 'Barcode',
          positionType: 'combined',
          rowColumn: 'Row',
          columnColumn: 'Column',
          skipRows: 0,
        },
      ],
    }
    await setScannerConfigurations(db, defaults, null)
    const initialized = await getSetting<ScannerConfigurations>(db, 'scanner_configurations', null)

    if (userId != null) {  
      const userConfigs = await getSetting<ScannerConfigurations>(db, 'scanner_configurations', userId)
      if (initialized && userConfigs) {
        return {
          configurations: [
            ...initialized.configurations,
            ...userConfigs.configurations,
          ],
        }
      }
    }
    return initialized
  }

  if (userId != null) {
    const userConfigs = await getSetting<ScannerConfigurations>(db, 'scanner_configurations', userId)
    // systemConfigs is truthy here (we only skip the init block above when it exists)
    if (userConfigs) {
      return {
        configurations: [
          ...systemConfigs!.configurations,
          ...userConfigs.configurations,
        ],
      }
    }
  }

  return systemConfigs
}

/**
 * Get only system-wide shared scanner configurations
 * @param db - Database instance
 */
export async function getSharedScannerConfigurations(db: Database): Promise<ScannerConfigurations | null> {
  return getSetting<ScannerConfigurations>(db, 'scanner_configurations', null)
}

/**
 * Get only user-specific personal scanner configurations
 * @param db - Database instance
 */
export async function getPersonalScannerConfigurations(db: Database, userId: number): Promise<ScannerConfigurations | null> {
  return getSetting<ScannerConfigurations>(db, 'scanner_configurations', userId)
}

/**
 * Set scanner configurations
 * @param db - Database instance
 * @param configs - Scanner configurations
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setScannerConfigurations(db: Database, configs: ScannerConfigurations, userId?: number | null): Promise<void> {
  return setSetting(db, 'scanner_configurations', configs, userId ?? undefined)
}

/**
 * Get table view configurations (system-wide only).
 * Lazy-initializes with default when none exist.
 */
export async function getTableViewConfigurations(db: Database): Promise<TableViewConfigurations | null> {
  const configs = await getSetting<TableViewConfigurations>(db, 'table_view_configurations', null)
  if (!configs || !configs.configurations || configs.configurations.length === 0) { // eslint-disable-line @typescript-eslint/no-unnecessary-condition -- all checks needed for init
    await setTableViewConfigurations(db, DEFAULT_TABLE_VIEW_CONFIGURATIONS)
    return getSetting<TableViewConfigurations>(db, 'table_view_configurations', null)
  }
  return configs
}

/**
 * Set table view configurations (system-wide only).
 */
export async function setTableViewConfigurations(db: Database, configs: TableViewConfigurations): Promise<void> {
  return setSetting(db, 'table_view_configurations', configs, null)
}

/**
 * Get default scanner configuration
 * Checks for a configuration marked as default in scanner_configurations
 * Returns null if no default configuration exists
 * @param db - Database instance
 */
export async function getDefaultScannerConfiguration(db: Database): Promise<ScannerConfiguration | null> {
  const scannerConfigs = await getScannerConfigurations(db)
  const defaultConfig = scannerConfigs?.configurations.find(c => c.isDefault === true)
  return defaultConfig ?? null
}

/**
 * Get scanner configuration by id
 * @param db - Database instance
 */
export async function getScannerConfigurationById(db: Database, id: string): Promise<ScannerConfiguration | null> {
  const scannerConfigs = await getScannerConfigurations(db)
  if (!scannerConfigs) return null
  const config = scannerConfigs.configurations.find(c => c.id === id)
  return config ?? null
}

/**
 * Clear the settings cache
 * @param db - Database instance
 * @param key - Optional key to clear specific setting cache
 * @param userId - Optional user ID to clear user-specific cache
 */
export function clearSettingsCache(db?: Database, key?: string, userId?: number | null): void {
  if (db && key) {
    if (userId !== undefined && userId !== null) {
      const cacheKey = getCacheKey(db, key, userId)
      settingsCache.delete(cacheKey)
    } else {
      const cacheKey = getCacheKey(db, key, null)
      settingsCache.delete(cacheKey)
      // Also clear all user-specific caches for this key
      const dbId = (db as any)._id || String(db)
      for (const cacheKey of settingsCache.keys()) {
        if (cacheKey.startsWith(`${dbId}:${key}:`)) {
          settingsCache.delete(cacheKey)
        }
      }
    }
  } else {
    settingsCache.clear()
  }
}

