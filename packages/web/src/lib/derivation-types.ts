export const DERIVATION_TYPES = [
  { value: 'dna_extraction', label: 'DNA Extraction' },
  { value: 'dilution', label: 'Dilution' },
  { value: 'aliquot', label: 'Distribution' },
  { value: 'other', label: 'Other' },
] as const

/** Human-readable label for a stored derivation_type value. */
export function formatDerivationType(type: string): string {
  const known = DERIVATION_TYPES.find((entry) => entry.value === type)
  if (known) return known.label
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
