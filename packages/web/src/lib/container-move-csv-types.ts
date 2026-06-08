/** Shared types for CSV-based container move wizards (micronix, cryovial). */

export type ContainerMoveCsvStep = 'upload' | 'create_plates' | 'resolve' | 'execute'
export type ContainerMoveAtomicMode = 'all_or_nothing' | 'best_effort'

export interface ContainerMoveValidationError {
  row: number
  error: string
}

export interface ContainerMoveCsvRow {
  [key: string]: string
}

export interface ContainerMoveContainerInfo {
  containerId: number
  containerType: string
  currentCollectionId: number | null
  currentCollectionName: string | null
  currentCollectionType: string | null
  currentPosition: string | null
  barcode?: string | null
}

export interface ContainerMoveFileResult {
  success: boolean
  moved: number
  errors?: ContainerMoveValidationError[]
  fileResults?: Array<{
    filename: string
    destinationPlate?: string
    destinationBox?: string
    moved: number
    errors?: ContainerMoveValidationError[]
  }>
}
