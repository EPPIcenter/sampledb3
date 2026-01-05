import { ReactNode } from 'react'

// Icon configuration - easy to swap out icons here
// 
// OPTION 1: Use with icon libraries (Heroicons, Lucide, etc.)
//   import { BeakerIcon } from '@heroicons/react/24/outline'
//   Then in the config: icon: <BeakerIcon className="w-4 h-4" />
//
// OPTION 2: Use custom SVG paths (current approach)
//   Just update the path data in the createIcon calls below

// Helper to create an SVG icon component from path data
const createIcon = (
  paths: string | string[], 
  className: string = "w-4 h-4", 
  viewBox: string = "0 0 20 20",
  useFillRule: boolean = true
): ReactNode => {
  const pathArray = Array.isArray(paths) ? paths : [paths]
  return (
    <svg className={className} fill="currentColor" viewBox={viewBox}>
      {pathArray.map((path, index) => (
        <path 
          key={index} 
          d={path} 
          {...(useFillRule && { fillRule: "evenodd", clipRule: "evenodd" })}
        />
      ))}
    </svg>
  )
}

// Specimen type icon configuration
// Match patterns are checked in order - first match wins
// To use an icon library, replace the createIcon() calls with your library's components
// Example: icon: <BeakerIcon className="w-4 h-4" />
const SPECIMEN_TYPE_ICONS: Array<{
  pattern: string | RegExp
  icon: ReactNode
}> = [
  {
    pattern: /blood/i,
    icon: createIcon([
      "M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 01-8 0V7a4 4 0 118 0v3zm-4 1a2 2 0 100-4 2 2 0 000 4z",
      "M3 10a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm1 3a1 1 0 100 2h12a1 1 0 100-2H4z"
    ])
  },
  {
    pattern: /plasma/i,
    icon: createIcon("M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z")
  },
  {
    pattern: /urine/i,
    icon: createIcon("M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z")
  },
  // Default fallback - add more patterns above this line
  {
    pattern: /.*/,
    icon: createIcon("M7 2a1 1 0 00-.707 1.707L7 4.414v3.758a1 1 0 01-.293.707l-4 4C.817 14.769 2.156 18 4.828 18h10.343c2.673 0 4.012-3.231 2.122-5.121l-4-4A1 1 0 0113 8.172V4.414l.707-.707A1 1 0 0013 2H7zm2 6.172V4h2v4.172a3 3 0 00.879 2.12l1.027 1.028a4 4 0 00-2.171.102l-.47.156a4 4 0 01-2.53 0l-.563-.187a1.993 1.993 0 00-.114-.035l1.026-1.027A3 3 0 009 8.172z")
  }
]

// Specimen type icons mapping
export function getSpecimenTypeIcon(typeName: string): ReactNode {
  const name = typeName.toLowerCase()
  
  // Find first matching pattern
  for (const { pattern, icon } of SPECIMEN_TYPE_ICONS) {
    if (pattern instanceof RegExp ? pattern.test(name) : name.includes(pattern)) {
      return icon
    }
  }
  
  // Fallback (should never reach here due to /.*/ pattern)
  return SPECIMEN_TYPE_ICONS[SPECIMEN_TYPE_ICONS.length - 1].icon
}

// Container type icon configuration
// Easy to swap out - just update the icon value for each container type
// To use an icon library, replace createIcon() with your library's components
// Example: micronix_tube: <GridIcon className="w-3.5 h-3.5" />
export const CONTAINER_TYPE_ICONS: Record<string, ReactNode> = {
  micronix_tube: createIcon("M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z", "w-3.5 h-3.5"),
  cryovial_tube: createIcon("M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z", "w-3.5 h-3.5"),
  paper: createIcon("M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z", "w-3.5 h-3.5"),
  static_well: createIcon("M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z", "w-3.5 h-3.5"),
  whole_blood_tube: createIcon("M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 01-8 0V7a4 4 0 118 0v3zm-4 1a2 2 0 100-4 2 2 0 000 4z", "w-3.5 h-3.5"),
}

// Container type icons mapping
export function getContainerTypeIcon(containerType: string): ReactNode {
  return CONTAINER_TYPE_ICONS[containerType] || createIcon("M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z", "w-3.5 h-3.5")
}

// Container type display names
export function getContainerTypeName(containerType: string): string {
  const names: Record<string, string> = {
    micronix_tube: 'micronix tube',
    cryovial_tube: 'cryovial tube',
    paper: 'paper',
    static_well: 'static well',
    whole_blood_tube: 'whole blood tube',
  }
  return names[containerType] || containerType
}

// Collection type icon configuration
// Maps collection types (plates, boxes, bags) to appropriate icons
export const COLLECTION_TYPE_ICONS: Record<string, ReactNode> = {
  micronix_plate: createIcon("M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z", "w-4 h-4"),
  cryovial_box: createIcon("M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z", "w-4 h-4"),
  box: createIcon("M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z", "w-4 h-4"),
  bag: createIcon("M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z", "w-4 h-4"),
}

// Collection type icons mapping
export function getCollectionTypeIcon(collectionType: string): ReactNode {
  return COLLECTION_TYPE_ICONS[collectionType] || createIcon("M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z", "w-4 h-4")
}

// Collection type display names
export function getCollectionTypeName(collectionType: string): string {
  const names: Record<string, string> = {
    micronix_plate: 'Micronix Plate',
    cryovial_box: 'Cryovial Box',
    box: 'Box',
    bag: 'Bag',
  }
  return names[collectionType] || collectionType
}

