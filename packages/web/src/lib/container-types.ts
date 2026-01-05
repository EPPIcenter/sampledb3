// Container types available for specimen types
export const CONTAINER_TYPES = [
  { value: 'paper', label: 'Paper (DBS Sheet)' },
  { value: 'cryovial_tube', label: 'Cryovial Tube' },
  { value: 'micronix_tube', label: 'Micronix Tube' },
  { value: 'static_well', label: 'Static Well' },
] as const

export type ContainerType = typeof CONTAINER_TYPES[number]['value']

