import { api } from './client'
import { parseSettingsEnvelope } from './parse-response'
import type { Unit } from './types'
// Settings interfaces
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

export interface AllSettings {
  container_defaults: ContainerDefaults | null
  pagination_settings: PaginationSettings | null
  password_requirements: PasswordRequirements | null
  session_settings: SessionSettings | null
  export_configurations: ExportConfigurations | null
  scanner_configurations: ScannerConfigurations | null
  table_view_configurations: TableViewConfigurations | null
}

// Settings value discriminated union
export type SettingValue =
  | { type: 'container_defaults'; value: ContainerDefaults }
  | { type: 'pagination_settings'; value: PaginationSettings }
  | { type: 'password_requirements'; value: PasswordRequirements }
  | { type: 'session_settings'; value: SessionSettings }
  | { type: 'export_configurations'; value: ExportConfigurations }
  | { type: 'scanner_configurations'; value: ScannerConfigurations }
  | { type: 'table_view_configurations'; value: TableViewConfigurations }

// Helper type to extract setting value by key
/** How to resolve export/scanner settings on GET /settings/:key (default: effective = merged for current user). */
export type SettingsValueScope = 'effective' | 'shared' | 'personal'

export type SettingValueByKey<T extends string> =
  T extends 'container_defaults' ? ContainerDefaults :
  T extends 'pagination_settings' ? PaginationSettings :
  T extends 'password_requirements' ? PasswordRequirements :
  T extends 'session_settings' ? SessionSettings :
  T extends 'export_configurations' ? ExportConfigurations :
  T extends 'scanner_configurations' ? ScannerConfigurations :
  T extends 'table_view_configurations' ? TableViewConfigurations :
  never

export const settingsApi = {
  getAll: () => api.get<AllSettings>('/settings'),
  get: <T extends keyof AllSettings>(key: T) =>
    api.get<{ key: T; value: AllSettings[T] }>(`/settings/${key}`),
  /** Unwrapped value from GET /settings/:key. Prefer this over assuming a direct body shape. */
  getValue: async <T extends keyof AllSettings>(
    key: T,
    options?: { scope?: SettingsValueScope },
  ): Promise<AllSettings[T]> => {
    const scope = options?.scope
    const query = scope && scope !== 'effective' ? `?scope=${scope}` : ''
    const body = await api.get<unknown>(`/settings/${key}${query}`)
    return parseSettingsEnvelope<AllSettings[T]>(body, key, `GET /settings/${key}`).value
  },
  /** Unwrapped value from PUT /settings/:key. Prefer this over typing the body as the setting value directly. */
  putValue: async <T extends keyof AllSettings>(
    key: T,
    value: AllSettings[T],
    userId?: number | null,
  ): Promise<AllSettings[T]> => {
    const body = await api.put<unknown>(`/settings/${key}`, { ...value, userId })
    return parseSettingsEnvelope<AllSettings[T]>(body, key, `PUT /settings/${key}`).value
  },
  /** Alias for {@link settingsApi.putValue} — same unwrapped return type. */
  update: async <T extends keyof AllSettings>(
    key: T,
    value: AllSettings[T],
    userId?: number | null,
  ): Promise<AllSettings[T]> => settingsApi.putValue(key, value, userId),
  resetUserSetting: (key: string) =>
    api.delete<{ success: boolean; message: string }>(`/settings/${key}/user`),
  getContainerTypeUnits: (containerType: string) =>
    api.get<{ units: Unit[] }>(`/settings/container-types/${containerType}/units`),
  addContainerTypeUnit: (containerType: string, unitId: number) =>
    api.post<{ success: boolean; unitId: number }>(`/settings/container-types/${containerType}/units`, { unitId }),
  removeContainerTypeUnit: (containerType: string, unitId: number) =>
    api.delete<{ success: boolean }>(`/settings/container-types/${containerType}/units/${unitId}`),
  getUnitsByContainerType: (containerType: string) =>
    api.get<{ units: Unit[] }>(`/settings/units/container-types/${containerType}`),
}

export const exportConfigurationsApi = {
  update: (configs: ExportConfigurations, userId?: number | null) =>
    settingsApi.putValue('export_configurations', configs, userId),
  createPersonal: (config: ExportConfiguration) => 
    api.post<{ success: boolean; config: ExportConfiguration }>('/settings/export-configurations/personal', config),
  updatePersonal: (configs: ExportConfigurations) => 
    api.put<{ success: boolean; configurations: ExportConfiguration[] }>('/settings/export-configurations/personal', configs),
}

export const tableViewConfigurationsApi = {
  update: (configs: TableViewConfigurations) =>
    settingsApi.putValue('table_view_configurations', configs),
}

export const scannerConfigurationsApi = {
  update: (configs: ScannerConfigurations, userId?: number | null) =>
    settingsApi.putValue('scanner_configurations', configs, userId),
  createPersonal: (config: ScannerConfiguration) => 
    api.post<{ success: boolean; config: ScannerConfiguration }>('/settings/scanner-configurations/personal', config),
  updatePersonal: (configs: ScannerConfigurations) => 
    api.put<{ success: boolean; configurations: ScannerConfiguration[] }>('/settings/scanner-configurations/personal', configs),
}

export const setupApi = {
  status: () => api.get<{ initialized: boolean }>('/setup/status'),
  initialize: (data: {
    adminName: string
    adminEmail: string
    adminPassword: string
    seedData?: boolean
    locations?: Array<{ name: string; storageTypeId?: string; description?: string }>
    specimenTypes?: Array<{ name: string }>
    units?: Array<{ name: string; symbol: string; category: string }>
    storageTypes?: Array<{ name: string; description?: string }>
    strains?: Array<{ name: string; description?: string }>
  }) => api.post<{ success: boolean; message: string }>('/setup/initialize', data),
}
