/** Deep-clone a JSON-serializable value, omitting keys whose values are null or undefined. */
export function toWireJson<T>(value: T): T {
  if (value === null || value === undefined) {
    return value
  }

  if (Array.isArray(value)) {
    return value.map((item) => toWireJson(item)) as T
  }

  if (typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      if (val === null || val === undefined) {
        continue
      }
      result[key] = toWireJson(val)
    }
    return result as T
  }

  return value
}
