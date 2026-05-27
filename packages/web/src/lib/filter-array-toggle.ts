/** Values allowed in optional multi-select filter arrays. */
export type FilterArrayValue = number | string

/**
 * Toggle a value in an optional array field on a partial filter/state object.
 * Safe when the field is undefined (treats as empty array).
 */
export function toggleArrayFilterValue<
  T extends Record<string, unknown>,
  K extends keyof T,
>(prev: T, key: K, value: FilterArrayValue): T {
  const current = (prev[key] as FilterArrayValue[] | undefined) ?? []
  const index = current.indexOf(value)
  if (index >= 0) {
    return { ...prev, [key]: current.filter((v) => v !== value) }
  }
  return { ...prev, [key]: [...current, value] }
}

/** Read an optional array filter field as an array (never undefined). */
export function getFilterArrayValue<T extends Record<string, unknown>, K extends keyof T>(
  state: T,
  key: K
): FilterArrayValue[] {
  return (state[key] as FilterArrayValue[] | undefined) ?? []
}
