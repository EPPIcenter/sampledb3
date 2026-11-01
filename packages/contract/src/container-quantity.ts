/**
 * Bounds on a Container's quantities, shared by every write path: Container edit, Specimen
 * registration (bulk import, POST /specimens, control batches, a Derivation's Child container),
 * and Derivation (single and CSV) drawing from a Parent container.
 *
 * A Container's remaining quantity stays between 0 and its total. A Derivation draws a quantity
 * used greater than 0 and no more than the Parent container's remaining quantity.
 */

export type ContainerQuantityBounds = {
  totalQuantity?: number | null
  remainingQuantity?: number | null
}

/** Why a Container's total and remaining quantities are out of bounds, or null when they are in bounds. */
export function containerQuantityBoundsError({ totalQuantity, remainingQuantity }: ContainerQuantityBounds): string | null {
  if (totalQuantity != null && !(totalQuantity >= 0)) {
    return `Total quantity must be 0 or more (got ${totalQuantity}).`
  }
  if (remainingQuantity != null && !(remainingQuantity >= 0)) {
    return `Remaining quantity must be 0 or more (got ${remainingQuantity}).`
  }
  if (totalQuantity != null && remainingQuantity != null && remainingQuantity > totalQuantity) {
    return `Remaining quantity (${remainingQuantity}) cannot exceed total quantity (${totalQuantity}).`
  }
  return null
}

/** Why a quantity used is not greater than 0, or null when it is. */
export function quantityUsedError(quantityUsed: number): string | null {
  if (!(quantityUsed > 0)) {
    return `Quantity used must be greater than 0 (got ${quantityUsed}).`
  }
  return null
}

/**
 * Why a Derivation cannot draw `quantityUsed` from a Parent container with `remainingQuantity`
 * left, or null when it can. A Parent container with no recorded remaining quantity is not bounded.
 */
export function quantityDrawError(quantityUsed: number, remainingQuantity: number | null | undefined): string | null {
  const usedError = quantityUsedError(quantityUsed)
  if (usedError) return usedError
  if (remainingQuantity != null && quantityUsed > remainingQuantity) {
    return `Quantity used (${quantityUsed}) exceeds the Parent container's remaining quantity (${remainingQuantity}).`
  }
  return null
}
