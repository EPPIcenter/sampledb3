import { Link } from 'react-router-dom'

interface BreadcrumbItem {
  label: string
  to?: string
}

interface EntityBreadcrumbsProps {
  items: BreadcrumbItem[]
}

// Chevron separator component
function ChevronSeparator() {
  return (
    <span className="mx-2 text-gray-400" aria-hidden="true">
      ›
    </span>
  )
}

// Home icon SVG
function HomeIcon() {
  return (
    <svg
      className="w-4 h-4 inline-block mr-1.5"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
      />
    </svg>
  )
}

export default function EntityBreadcrumbs({ items }: EntityBreadcrumbsProps) {
  return (
    <nav
      className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-2.5 mb-4"
      aria-label="Breadcrumb navigation"
    >
      <ol className="flex items-center space-x-3 text-base" itemScope itemType="https://schema.org/BreadcrumbList">
        <li itemProp="itemListElement" itemScope itemType="https://schema.org/ListItem">
          <Link
            to="/"
            className="flex items-center text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
            itemProp="item"
          >
            <HomeIcon />
            <span itemProp="name">Home</span>
          </Link>
          <meta itemProp="position" content="1" />
        </li>
        {items.map((item, index) => (
          <li
            key={index}
            itemProp="itemListElement"
            itemScope
            itemType="https://schema.org/ListItem"
            className="flex items-center"
          >
            <ChevronSeparator />
            {item.to ? (
              <>
                <Link
                  to={item.to}
                  className="text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 rounded"
                  itemProp="item"
                >
                  <span itemProp="name">{item.label}</span>
                </Link>
                <meta itemProp="position" content={String(index + 2)} />
              </>
            ) : (
              <>
                <span className="text-gray-900 font-medium" itemProp="name" aria-current="page">
                  {item.label}
                </span>
                <meta itemProp="position" content={String(index + 2)} />
              </>
            )}
          </li>
        ))}
      </ol>
    </nav>
  )
}
