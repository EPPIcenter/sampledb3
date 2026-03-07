import { Outlet, NavLink } from 'react-router-dom'
import '../styles/admin.css'

const navItems = [
  { to: '/admin/data-integrity', end: true, label: 'Overview' },
  { to: '/admin/data-integrity/empty-collections', end: false, label: 'Empty collections' },
  { to: '/admin/data-integrity/report', end: false, label: 'Integrity report' },
]

export default function AdminDataIntegrityLayout() {
  return (
    <div className="admin-page">
      <div className="relative z-10 container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold" style={{ color: 'rgb(var(--app-text))' }}>
            Data integrity
          </h1>
        </div>

        <nav className="flex flex-wrap gap-2 mb-8 border-b border-[rgb(var(--app-border))] pb-4">
          {navItems.map(({ to, end, label }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-[rgb(var(--app-accent))] text-white'
                    : 'text-[rgb(var(--app-text-muted))] hover:bg-[rgb(var(--app-surface))] hover:text-[rgb(var(--app-text))]'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
        </nav>

        <Outlet />
      </div>
    </div>
  )
}
