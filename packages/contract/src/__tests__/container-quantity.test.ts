import { describe, it, expect } from 'bun:test'
import { containerQuantityBoundsError, quantityDrawError, quantityUsedError } from '../container-quantity'

describe('containerQuantityBoundsError', () => {
  it('accepts remaining between 0 and total', () => {
    expect(containerQuantityBoundsError({ totalQuantity: 10, remainingQuantity: 0 })).toBeNull()
    expect(containerQuantityBoundsError({ totalQuantity: 10, remainingQuantity: 10 })).toBeNull()
    expect(containerQuantityBoundsError({ totalQuantity: 0, remainingQuantity: 0 })).toBeNull()
  })

  it('accepts unset quantities', () => {
    expect(containerQuantityBoundsError({})).toBeNull()
    expect(containerQuantityBoundsError({ totalQuantity: null, remainingQuantity: 5 })).toBeNull()
  })

  it('rejects a negative total', () => {
    expect(containerQuantityBoundsError({ totalQuantity: -1 })).toBe('Total quantity must be 0 or more (got -1).')
  })

  it('rejects a negative remaining', () => {
    expect(containerQuantityBoundsError({ totalQuantity: 10, remainingQuantity: -5 })).toBe(
      'Remaining quantity must be 0 or more (got -5).',
    )
  })

  it('rejects remaining greater than total', () => {
    expect(containerQuantityBoundsError({ totalQuantity: 10, remainingQuantity: 11 })).toBe(
      'Remaining quantity (11) cannot exceed total quantity (10).',
    )
  })

  it('rejects NaN', () => {
    expect(containerQuantityBoundsError({ remainingQuantity: Number.NaN })).not.toBeNull()
  })

  it('rejects an infinite total', () => {
    expect(containerQuantityBoundsError({ totalQuantity: Infinity })).toBe('Total quantity must be a finite number (got Infinity).')
    expect(containerQuantityBoundsError({ totalQuantity: Infinity, remainingQuantity: 5 })).toBe(
      'Total quantity must be a finite number (got Infinity).',
    )
    expect(containerQuantityBoundsError({ totalQuantity: -Infinity })).toBe('Total quantity must be a finite number (got -Infinity).')
  })

  it('rejects an infinite remaining', () => {
    expect(containerQuantityBoundsError({ remainingQuantity: Infinity })).toBe(
      'Remaining quantity must be a finite number (got Infinity).',
    )
    expect(containerQuantityBoundsError({ totalQuantity: 10, remainingQuantity: Infinity })).toBe(
      'Remaining quantity must be a finite number (got Infinity).',
    )
  })

  it('rejects an infinite total and remaining together', () => {
    expect(containerQuantityBoundsError({ totalQuantity: Infinity, remainingQuantity: Infinity })).toBe(
      'Total quantity must be a finite number (got Infinity).',
    )
  })
})

describe('quantityUsedError', () => {
  it('rejects 0 and negatives', () => {
    expect(quantityUsedError(0)).toBe('Quantity used must be greater than 0 (got 0).')
    expect(quantityUsedError(-100)).toBe('Quantity used must be greater than 0 (got -100).')
  })

  it('accepts a positive quantity', () => {
    expect(quantityUsedError(0.5)).toBeNull()
  })

  it('rejects a quantity that is not finite', () => {
    expect(quantityUsedError(Infinity)).toBe('Quantity used must be a finite number (got Infinity).')
    expect(quantityUsedError(-Infinity)).toBe('Quantity used must be a finite number (got -Infinity).')
    expect(quantityUsedError(Number.NaN)).toBe('Quantity used must be a finite number (got NaN).')
  })
})

describe('quantityDrawError', () => {
  it('accepts drawing up to the remaining quantity', () => {
    expect(quantityDrawError(5, 5)).toBeNull()
    expect(quantityDrawError(1, 5)).toBeNull()
  })

  it('rejects drawing more than remains', () => {
    expect(quantityDrawError(6, 5)).toBe("Quantity used (6) exceeds the Parent container's remaining quantity (5).")
    expect(quantityDrawError(1, 0)).toBe("Quantity used (1) exceeds the Parent container's remaining quantity (0).")
  })

  it('rejects a quantity used of 0 or less before comparing', () => {
    expect(quantityDrawError(-100, 5)).toBe('Quantity used must be greater than 0 (got -100).')
  })

  it('does not bound a Parent container with no remaining quantity', () => {
    expect(quantityDrawError(5, null)).toBeNull()
  })

  it('rejects an infinite quantity used, whatever the Parent container holds', () => {
    expect(quantityDrawError(Infinity, null)).toBe('Quantity used must be a finite number (got Infinity).')
    expect(quantityDrawError(Infinity, 5)).toBe('Quantity used must be a finite number (got Infinity).')
    expect(quantityDrawError(Infinity, Infinity)).toBe('Quantity used must be a finite number (got Infinity).')
  })
})
