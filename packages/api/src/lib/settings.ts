import { db } from '../db/client'
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
}

export interface ScannerConfigurations {
  configurations: ScannerConfiguration[]
}

// Cache for settings to avoid repeated queries
// Cache key format: "key" for system settings, "key:userId" for user settings
const settingsCache = new Map<string, any>()

/**
 * Generic getter for any setting
 * @param key - Setting key
 * @param userId - Optional user ID. If provided, gets user-specific setting; if null, gets system setting
 */
export async function getSetting<T>(key: string, userId: number | null = null): Promise<T | null> {
  const cacheKey = userId !== null ? `${key}:${userId}` : key
  
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
 * @param key - Setting key
 * @param value - Setting value
 * @param userId - Optional user ID. If provided, saves as user-specific; if null, saves as system-wide
 */
export async function setSetting<T>(key: string, value: T, userId: number | null = null): Promise<void> {
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
  const cacheKey = userId !== null ? `${key}:${userId}` : key
  settingsCache.set(cacheKey, value)
  
  // Also clear system cache if setting user-specific (to ensure fallback works)
  if (userId !== null) {
    settingsCache.delete(key)
  }
}

/**
 * Get user setting with fallback to system default
 * @param key - Setting key
 * @param userId - User ID
 * @returns User-specific setting if exists, otherwise system default
 */
export async function getUserSettingWithFallback<T>(key: string, userId: number): Promise<T | null> {
  // Try user-specific setting first
  const userSetting = await getSetting<T>(key, userId)
  if (userSetting !== null) {
    return userSetting
  }
  
  // Fallback to system default
  return getSetting<T>(key, null)
}

/**
 * Delete a user-specific setting (to reset to system default)
 * @param key - Setting key
 * @param userId - User ID
 */
export async function deleteUserSetting(key: string, userId: number): Promise<void> {
  await db
    .delete(settings)
    .where(and(eq(settings.key, key), eq(settings.userId, userId)))
  
  // Clear cache
  settingsCache.delete(`${key}:${userId}`)
}

/**
 * Get container defaults
 */
export async function getContainerDefaults(): Promise<ContainerDefaults | null> {
  return getSetting<ContainerDefaults>('container_defaults')
}

/**
 * Set container defaults
 */
export async function setContainerDefaults(defaults: ContainerDefaults): Promise<void> {
  return setSetting('container_defaults', defaults)
}

/**
 * Get pagination settings (supports user-specific with system fallback)
 */
export async function getPaginationSettings(userId?: number | null): Promise<PaginationSettings | null> {
  if (userId !== undefined && userId !== null) {
    return getUserSettingWithFallback<PaginationSettings>('pagination_settings', userId)
  }
  return getSetting<PaginationSettings>('pagination_settings', null)
}

/**
 * Set pagination settings
 * @param config - Pagination settings
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setPaginationSettings(config: PaginationSettings, userId?: number | null): Promise<void> {
  return setSetting('pagination_settings', config, userId ?? null)
}

/**
 * Get password requirements
 */
export async function getPasswordRequirements(): Promise<PasswordRequirements | null> {
  return getSetting<PasswordRequirements>('password_requirements')
}

/**
 * Set password requirements
 */
export async function setPasswordRequirements(requirements: PasswordRequirements): Promise<void> {
  return setSetting('password_requirements', requirements)
}

/**
 * Get session settings
 */
export async function getSessionSettings(): Promise<SessionSettings | null> {
  return getSetting<SessionSettings>('session_settings')
}

/**
 * Set session settings
 */
export async function setSessionSettings(config: SessionSettings): Promise<void> {
  return setSetting('session_settings', config)
}

/**
 * Get export configurations (merged: system shared + user personal)
 * @param userId - Optional user ID. If provided, returns merged configs (shared + personal)
 */
export async function getExportConfigurations(userId?: number | null): Promise<ExportConfigurations | null> {
  const systemConfigs = await getSetting<ExportConfigurations>('export_configurations', null)
  
  if (userId !== undefined && userId !== null) {
    const userConfigs = await getSetting<ExportConfigurations>('export_configurations', userId)
    
    // Merge: system configs + user personal configs
    if (systemConfigs && userConfigs) {
      return {
        configurations: [
          ...systemConfigs.configurations,
          ...userConfigs.configurations,
        ],
      }
    } else if (userConfigs) {
      return userConfigs
    }
  }
  
  return systemConfigs
}

/**
 * Get only system-wide shared export configurations
 */
export async function getSharedExportConfigurations(): Promise<ExportConfigurations | null> {
  return getSetting<ExportConfigurations>('export_configurations', null)
}

/**
 * Get only user-specific personal export configurations
 */
export async function getPersonalExportConfigurations(userId: number): Promise<ExportConfigurations | null> {
  return getSetting<ExportConfigurations>('export_configurations', userId)
}

/**
 * Set export configurations
 * @param configs - Export configurations
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setExportConfigurations(configs: ExportConfigurations, userId?: number | null): Promise<void> {
  return setSetting('export_configurations', configs, userId ?? null)
}

/**
 * Get default export configuration
 * Checks for a configuration marked as default in export_configurations
 * Returns null if no default configuration exists
 */
export async function getDefaultExportConfiguration(): Promise<{ columns: string[] } | null> {
  const exportConfigs = await getExportConfigurations()
  if (exportConfigs && exportConfigs.configurations) {
    const defaultConfig = exportConfigs.configurations.find(c => c.isDefault === true)
    if (defaultConfig) {
      return { columns: defaultConfig.columns }
    }
  }
  
  return null
}

/**
 * Get export configuration by name
 */
export async function getExportConfigurationByName(name: string): Promise<{ columns: string[] } | null> {
  const exportConfigs = await getExportConfigurations()
  if (exportConfigs && exportConfigs.configurations) {
    const config = exportConfigs.configurations.find(c => c.name === name)
    if (config) {
      return { columns: config.columns }
    }
  }
  return null
}

/**
 * Get scanner configurations (merged: system shared + user personal)
 * @param userId - Optional user ID. If provided, returns merged configs (shared + personal)
 */
export async function getScannerConfigurations(userId?: number | null): Promise<ScannerConfigurations | null> {
  const systemConfigs = await getSetting<ScannerConfigurations>('scanner_configurations', null)
  
  // Initialize system defaults if none exist
  if (!systemConfigs || !systemConfigs.configurations || systemConfigs.configurations.length === 0) {
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
    await setScannerConfigurations(defaults, null)
    const initialized = await getSetting<ScannerConfigurations>('scanner_configurations', null)
    
    if (userId !== undefined && userId !== null) {
      const userConfigs = await getSetting<ScannerConfigurations>('scanner_configurations', userId)
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
  
  if (userId !== undefined && userId !== null) {
    const userConfigs = await getSetting<ScannerConfigurations>('scanner_configurations', userId)
    
    // Merge: system configs + user personal configs
    if (systemConfigs && userConfigs) {
      return {
        configurations: [
          ...systemConfigs.configurations,
          ...userConfigs.configurations,
        ],
      }
    } else if (userConfigs) {
      return userConfigs
    }
  }
  
  return systemConfigs
}

/**
 * Get only system-wide shared scanner configurations
 */
export async function getSharedScannerConfigurations(): Promise<ScannerConfigurations | null> {
  return getSetting<ScannerConfigurations>('scanner_configurations', null)
}

/**
 * Get only user-specific personal scanner configurations
 */
export async function getPersonalScannerConfigurations(userId: number): Promise<ScannerConfigurations | null> {
  return getSetting<ScannerConfigurations>('scanner_configurations', userId)
}

/**
 * Set scanner configurations
 * @param configs - Scanner configurations
 * @param userId - Optional user ID. If provided, saves as user-specific; if null/undefined, saves as system-wide
 */
export async function setScannerConfigurations(configs: ScannerConfigurations, userId?: number | null): Promise<void> {
  return setSetting('scanner_configurations', configs, userId ?? null)
}

/**
 * Get default scanner configuration
 * Checks for a configuration marked as default in scanner_configurations
 * Returns null if no default configuration exists
 */
export async function getDefaultScannerConfiguration(): Promise<ScannerConfiguration | null> {
  const scannerConfigs = await getScannerConfigurations()
  if (scannerConfigs && scannerConfigs.configurations) {
    const defaultConfig = scannerConfigs.configurations.find(c => c.isDefault === true)
    if (defaultConfig) {
      return defaultConfig
    }
  }
  
  return null
}

/**
 * Get scanner configuration by id
 */
export async function getScannerConfigurationById(id: string): Promise<ScannerConfiguration | null> {
  const scannerConfigs = await getScannerConfigurations()
  if (scannerConfigs && scannerConfigs.configurations) {
    const config = scannerConfigs.configurations.find(c => c.id === id)
    if (config) {
      return config
    }
  }
  return null
}

/**
 * Clear the settings cache
 * @param key - Optional key to clear specific setting cache
 * @param userId - Optional user ID to clear user-specific cache
 */
export function clearSettingsCache(key?: string, userId?: number | null): void {
  if (key) {
    if (userId !== undefined && userId !== null) {
      settingsCache.delete(`${key}:${userId}`)
    } else {
      settingsCache.delete(key)
      // Also clear all user-specific caches for this key
      for (const cacheKey of settingsCache.keys()) {
        if (cacheKey.startsWith(`${key}:`)) {
          settingsCache.delete(cacheKey)
        }
      }
    }
  } else {
    settingsCache.clear()
  }
}

