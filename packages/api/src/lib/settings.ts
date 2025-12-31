import { db } from '../db/client'
import { settings } from '../db/schema'
import { eq } from 'drizzle-orm'

// Type definitions for settings
export interface ContainerDefaults {
  micronix_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  cryovial_tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
  tube: { totalQuantity: number; remainingQuantity: number; defaultUnitSymbol: string }
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
const settingsCache = new Map<string, any>()

/**
 * Generic getter for any setting
 */
export async function getSetting<T>(key: string): Promise<T | null> {
  // Check cache first
  if (settingsCache.has(key)) {
    return settingsCache.get(key) as T
  }

  const setting = await db
    .select()
    .from(settings)
    .where(eq(settings.key, key))
    .get()

  if (!setting) {
    return null
  }

  const value = setting.value as T
  settingsCache.set(key, value)
  return value
}

/**
 * Generic setter for any setting
 */
export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db
    .insert(settings)
    .values({
      key,
      value: value as any,
    })
    .onConflictDoUpdate({
      target: settings.key,
      set: {
        value: value as any,
      },
    })

  // Update cache
  settingsCache.set(key, value)
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
 * Get pagination settings
 */
export async function getPaginationSettings(): Promise<PaginationSettings | null> {
  return getSetting<PaginationSettings>('pagination_settings')
}

/**
 * Set pagination settings
 */
export async function setPaginationSettings(config: PaginationSettings): Promise<void> {
  return setSetting('pagination_settings', config)
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
 * Get export configurations (multiple named configurations)
 */
export async function getExportConfigurations(): Promise<ExportConfigurations | null> {
  return getSetting<ExportConfigurations>('export_configurations')
}

/**
 * Set export configurations (multiple named configurations)
 */
export async function setExportConfigurations(configs: ExportConfigurations): Promise<void> {
  return setSetting('export_configurations', configs)
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
 * Get scanner configurations (multiple named configurations)
 */
export async function getScannerConfigurations(): Promise<ScannerConfigurations | null> {
  const configs = await getSetting<ScannerConfigurations>('scanner_configurations')
  if (!configs || !configs.configurations || configs.configurations.length === 0) {
    // Initialize with defaults if none exist
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
    await setScannerConfigurations(defaults)
    return defaults
  }
  return configs
}

/**
 * Set scanner configurations (multiple named configurations)
 */
export async function setScannerConfigurations(configs: ScannerConfigurations): Promise<void> {
  return setSetting('scanner_configurations', configs)
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
 */
export function clearSettingsCache(): void {
  settingsCache.clear()
}

