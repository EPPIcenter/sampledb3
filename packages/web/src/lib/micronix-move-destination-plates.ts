export interface NamedPlate {
  name: string
}

export function getMissingDestinationPlateNames(
  selectedNames: Array<string | null | undefined>,
  plates: NamedPlate[],
): string[] {
  const existing = new Set(plates.map((p) => p.name))
  return [...new Set(selectedNames.filter((n): n is string => Boolean(n)))].filter(
    (name) => !existing.has(name),
  )
}

export function isExistingPlateName(name: string, plates: NamedPlate[]): boolean {
  return plates.some((p) => p.name === name)
}

export type PendingDestinationPlateStatus = 'pending' | 'creating' | 'success' | 'error'

export interface PendingDestinationPlate {
  name: string
  locationId: number | null
  barcode: string
  status: PendingDestinationPlateStatus
  error?: string
}

export function buildPendingDestinationPlates(names: string[]): PendingDestinationPlate[] {
  return names.map((name) => ({
    name,
    locationId: null,
    barcode: '',
    status: 'pending',
  }))
}
