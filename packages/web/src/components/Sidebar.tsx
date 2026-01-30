import { useState, useEffect, useRef, ReactNode } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useUser } from '../contexts/UserContext'

interface NavItem {
  label: string
  to?: string
  /** External URL (opens in new tab). Use instead of `to` for external links. */
  href?: string
  /** Run on click instead of navigating. Use for actions like "Start tutorial". */
  action?: () => void
  icon: ReactNode
  children?: NavItem[]
}

interface NavSection {
  title?: string
  items: NavItem[]
}

interface SidebarProps {
  isMobileOpen?: boolean
  onMobileClose?: () => void
}

export default function Sidebar({ isMobileOpen = false, onMobileClose }: SidebarProps) {
  const location = useLocation()
  const { user, canWrite } = useUser()
  
  // Initialize expanded items - check if any child routes are active
  const getInitialExpandedItems = () => {
    const expanded = new Set<string>()
    const path = location.pathname
    
    // Check if we're on an export route
    if (path === '/export' || path === '/barcode-export') {
      expanded.add('export')
    }
    
    // Check if we're on a move containers route
    if (path.startsWith('/container-move/')) {
      expanded.add('move-containers')
    }
    
    return expanded
  }
  
  const [expandedItems, setExpandedItems] = useState<Set<string>>(getInitialExpandedItems())
  const prevPathRef = useRef(location.pathname)

  // Update expanded items when location changes (adjust during render)
  if (prevPathRef.current !== location.pathname) {
    prevPathRef.current = location.pathname
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (location.pathname === '/export' || location.pathname === '/barcode-export') {
        next.add('export')
      }
      if (location.pathname.startsWith('/container-move/')) {
        next.add('move-containers')
      }
      return next
    })
  }

  const toggleItem = (itemKey: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev)
      if (next.has(itemKey)) {
        next.delete(itemKey)
      } else {
        next.add(itemKey)
      }
      return next
    })
  }

  const isActive = (path?: string) => {
    if (!path) return false
    if (path === '/') {
      return location.pathname === '/'
    }
    return location.pathname.startsWith(path)
  }

  const isItemOrChildActive = (item: NavItem): boolean => {
    if (item.to && isActive(item.to)) return true
    if (item.children) {
      return item.children.some((child) => isItemOrChildActive(child))
    }
    return false
  }

  const sections: NavSection[] = [
    {
      title: 'Overview',
      items: [
        {
          label: 'Dashboard',
          to: '/',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          ),
        },
        {
          label: 'User guide',
          // @ts-expect-error - import.meta.env is provided by Vite
          href: (import.meta.env.VITE_DOCS_URL as string | undefined) ?? '/docs',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Browse Data',
      items: [
        {
          label: 'Studies',
          to: '/studies',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          ),
        },
        {
          label: 'Specimens',
          to: '/specimens',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
            </svg>
          ),
        },
        {
          label: 'Locations',
          to: '/locations',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
        {
          label: 'Blood Controls',
          to: '/blood-controls',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        ...(canWrite ? [{
          label: 'Import',
          to: '/import',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
          ),
        }] : []),
        {
          label: 'Export',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ),
          children: [
            {
              label: 'Multi-Study Export',
              to: '/export',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              ),
            },
            {
              label: 'Micronix Barcode Export',
              to: '/barcode-export',
              icon: (
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
              ),
            },
          ],
        },
        ...(canWrite ? [
          {
            label: 'Move Containers',
            icon: (
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            ),
            children: [
              {
                label: 'Move Micronix Tubes',
                to: '/container-move/micronix',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                ),
              },
              {
                label: 'Move Cryovial Tubes',
                to: '/container-move/cryovial',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                ),
              },
              {
                label: 'Move Papers',
                to: '/container-move/papers',
                icon: (
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                  </svg>
                ),
              },
            ],
          },
          {
            label: 'Move Collections',
            icon: (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            ),
            to: '/collection-move',
          },
        ] : []),
        {
          label: 'Derivations',
          to: '/derivations',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Reports',
      items: [
        {
          label: 'Statistics',
          to: '/statistics',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
      ],
    },
    {
      title: 'Settings',
      items: [
        {
          label: 'My Profile',
          to: '/profile',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          ),
        },
        {
          label: 'Reference Data',
          to: '/reference-data',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
          ),
        },
        {
          label: 'Application Settings',
          to: '/settings',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
      ],
    },
  ]

  // Add admin section if user is admin
  if (user?.role === 'admin') {
    sections.push({
      title: 'Admin',
      items: [
        {
          label: 'Admin Dashboard',
          to: '/admin',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          ),
        },
        {
          label: 'User Management',
          to: '/admin/users',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ),
        },
        {
          label: 'System Settings',
          to: '/admin/settings',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          ),
        },
        {
          label: 'System Statistics',
          to: '/admin/statistics',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          ),
        },
        {
          label: 'Error Logs',
          to: '/admin/error-logs',
          icon: (
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
        },
      ],
    })
  }

  const renderNavItem = (item: NavItem, isSubItem = false, itemKey?: string) => {
    const hasChildren = item.children && item.children.length > 0
    const itemKeyValue = itemKey || item.label.toLowerCase().replace(/\s+/g, '-')
    const isExpanded = expandedItems.has(itemKeyValue)
    const itemActive = isItemOrChildActive(item)
    const childActive = item.to ? isActive(item.to) : false

    if (hasChildren) {
      return (
        <div key={itemKeyValue}>
          <button
            onClick={() => toggleItem(itemKeyValue)}
            className={`
              w-full flex items-center justify-between gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors
              ${itemActive
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
              }
            `}
          >
            <div className="flex items-center gap-2">
              <span className={`${itemActive ? 'text-blue-600' : 'text-gray-500'} flex-shrink-0`}>{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </div>
            <svg
              className={`w-3 h-3 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''} ${itemActive ? 'text-blue-600' : 'text-gray-400'}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {isExpanded && (
            <div className="space-y-0.5 mt-0.5 ml-1">
              {item.children!.map((child) => renderNavItem(child, true, `${itemKeyValue}-${child.label.toLowerCase().replace(/\s+/g, '-')}`))}
            </div>
          )}
        </div>
      )
    }

    if (!item.to && !item.href && !item.action) return null

    const active = childActive

    if (item.action) {
      return (
        <button
          key={itemKeyValue}
          type="button"
          onClick={() => {
            item.action!()
            if (onMobileClose) {
              onMobileClose()
            }
          }}
          className={`
            flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors w-full text-left
            text-gray-700 hover:bg-gray-100 hover:text-gray-900
            ${isSubItem ? 'ml-1' : ''}
          `}
        >
          <span className="text-gray-500 flex-shrink-0">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </button>
      )
    }

    if (item.href) {
      return (
        <a
          key={itemKeyValue}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            if (onMobileClose) {
              onMobileClose()
            }
          }}
          className={`
            flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors
            text-gray-700 hover:bg-gray-100 hover:text-gray-900
            ${isSubItem ? 'ml-1' : ''}
          `}
        >
          <span className="text-gray-500 flex-shrink-0">{item.icon}</span>
          <span className="truncate">{item.label}</span>
        </a>
      )
    }

    return (
      <Link
        key={itemKeyValue}
        to={item.to!}
        onClick={() => {
          if (onMobileClose) {
            onMobileClose()
          }
        }}
        className={`
          flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium transition-colors
          ${active
            ? 'bg-blue-50 text-blue-700'
            : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
          }
          ${isSubItem ? 'ml-1' : ''}
        `}
      >
        <span className={`${active ? 'text-blue-600' : 'text-gray-500'} flex-shrink-0`}>{item.icon}</span>
        <span className="truncate">{item.label}</span>
      </Link>
    )
  }

  const renderSection = (section: NavSection, sectionIndex: number) => {
    return (
      <div key={section.title || `section-${sectionIndex}`} className="mb-3">
        {section.title && (
          <div className="px-2 py-0.5 mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">
            {section.title}
          </div>
        )}
        <div className="space-y-0.5">
          {section.items.map((item) => renderNavItem(item))}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Mobile overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 bg-gray-900/40 backdrop-blur-md z-40 lg:hidden transition-opacity"
          onClick={onMobileClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 h-full bg-white border-r border-gray-200 z-50
          w-52 overflow-y-auto
          transform transition-transform duration-300 ease-in-out
          lg:translate-x-0 lg:z-auto
          ${isMobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between py-3 px-3">
            <Link to="/" className="flex items-center gap-2 text-lg font-bold text-blue-600" onClick={onMobileClose}>
              <img src="/icon.png" alt="SampleDB" className="h-8 w-auto" />
              <span>SampleDB</span>
            </Link>
            <button
              onClick={onMobileClose}
              className="lg:hidden p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 py-2">
            {sections.map((section, index) => renderSection(section, index))}
          </nav>

          {/* EPPIcenter Footer */}
          <div className="px-3 py-3">
            <a
              href="https://eppicenter.ucsf.edu"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center opacity-60 hover:opacity-100 transition-opacity"
              title="EPPIcenter - UCSF"
            >
              <img
                src="/EPPIcenter_trnsprntbkg_notext.png"
                alt="EPPIcenter"
                className="h-6 w-auto"
              />
            </a>
          </div>
        </div>
      </aside>
    </>
  )
}

