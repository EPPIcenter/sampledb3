import SkeletonCard from './SkeletonCard'

interface SkeletonGridProps {
  count?: number
  columns?: {
    default?: number
    md?: number
    lg?: number
    xl?: number
  }
}

export default function SkeletonGrid({ 
  count = 8, 
  columns = { default: 1, md: 2, lg: 3, xl: 4 } 
}: SkeletonGridProps) {
  // Build grid class string with standard Tailwind classes
  const getGridClass = () => {
    const classes = ['grid', 'gap-4']
    
    // Default columns
    if (columns.default === 1) classes.push('grid-cols-1')
    else if (columns.default === 2) classes.push('grid-cols-2')
    else if (columns.default === 3) classes.push('grid-cols-3')
    else if (columns.default === 4) classes.push('grid-cols-4')
    else if (columns.default === 5) classes.push('grid-cols-5')
    else classes.push('grid-cols-1')
    
    // MD breakpoint
    if (columns.md === 2) classes.push('md:grid-cols-2')
    else if (columns.md === 3) classes.push('md:grid-cols-3')
    else if (columns.md === 4) classes.push('md:grid-cols-4')
    else if (columns.md === 5) classes.push('md:grid-cols-5')
    else if (columns.md) classes.push('md:grid-cols-2')
    
    // LG breakpoint
    if (columns.lg === 2) classes.push('lg:grid-cols-2')
    else if (columns.lg === 3) classes.push('lg:grid-cols-3')
    else if (columns.lg === 4) classes.push('lg:grid-cols-4')
    else if (columns.lg === 5) classes.push('lg:grid-cols-5')
    else if (columns.lg) classes.push('lg:grid-cols-3')
    
    // XL breakpoint
    if (columns.xl === 2) classes.push('xl:grid-cols-2')
    else if (columns.xl === 3) classes.push('xl:grid-cols-3')
    else if (columns.xl === 4) classes.push('xl:grid-cols-4')
    else if (columns.xl === 5) classes.push('xl:grid-cols-5')
    else if (columns.xl) classes.push('xl:grid-cols-4')
    
    return classes.join(' ')
  }

  return (
    <div className={getGridClass()}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}

