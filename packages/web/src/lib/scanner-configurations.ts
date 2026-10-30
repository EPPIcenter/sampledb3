/** The configuration marked default, else the first one; undefined for an empty list. */
export function defaultScannerConfiguration<T extends { isDefault?: boolean }>(configurations: readonly T[]): T | undefined {
  return configurations.find((c) => c.isDefault === true) ?? configurations[0]
}
