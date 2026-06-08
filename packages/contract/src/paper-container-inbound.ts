import type { z } from 'zod'

/** Fields that may appear on paper container write payloads across API and import paths. */
export type PaperInboundWriteFields = {
  containerType?: string
  type?: string
  barcode?: string | null
  containerBarcode?: string | null
  position?: string | null
}

export const PAPER_USE_SUBLABEL_NOT_BARCODE =
  'Paper containers use sublabel for spot identifiers, not barcode'

export const PAPER_USE_SUBLABEL_NOT_CONTAINER_BARCODE =
  'Paper containers use sublabel, not containerBarcode'

export const PAPER_USE_SUBLABEL_NOT_POSITION = 'Paper containers use sublabel, not position'

export const PAPER_DERIVATION_USE_SUBLABEL_NOT_CONTAINER_BARCODE =
  'Paper derivations use sublabel, not container_barcode'

export const PAPER_DERIVATION_USE_SUBLABEL_NOT_POSITION = 'Paper derivations use sublabel, not position'

function isPaperInboundType(fields: PaperInboundWriteFields): boolean {
  return fields.containerType === 'paper' || fields.type === 'paper'
}

function hasText(value: string | null | undefined): boolean {
  return value != null && value.trim() !== ''
}

/** Reject tube identity/placement field names on paper container writes. */
export function refinePaperContainerInboundWrite(
  fields: PaperInboundWriteFields,
  ctx: z.RefinementCtx,
): void {
  if (!isPaperInboundType(fields)) {
    return
  }
  if (hasText(fields.barcode)) {
    ctx.addIssue({
      code: 'custom',
      message: PAPER_USE_SUBLABEL_NOT_BARCODE,
      path: ['barcode'],
    })
  }
  if (hasText(fields.containerBarcode)) {
    ctx.addIssue({
      code: 'custom',
      message: PAPER_USE_SUBLABEL_NOT_CONTAINER_BARCODE,
      path: ['containerBarcode'],
    })
  }
  if (hasText(fields.position)) {
    ctx.addIssue({
      code: 'custom',
      message: PAPER_USE_SUBLABEL_NOT_POSITION,
      path: ['position'],
    })
  }
}

