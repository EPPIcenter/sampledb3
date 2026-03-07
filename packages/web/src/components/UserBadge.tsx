import { useUser } from '../contexts/UserContext'

interface UserBadgeProps {
  action?: 'creating' | 'updating'
  className?: string
}

export default function UserBadge({ action = 'creating', className = '' }: UserBadgeProps) {
  const { user } = useUser()

  if (!user) {
    return null
  }

  return (
    <div className={`flex items-center gap-2 px-3 py-2 bg-app-accent-muted border border-app-accent/50 rounded-md ${className}`}>
      <div className="w-6 h-6 rounded-full bg-app-accent-muted0 flex items-center justify-center text-white text-xs font-medium">
        {user.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-app-accent-hover">
          {action === 'creating' ? 'Creating as' : 'Updating as'}: {user.name}
        </div>
        <div className="text-xs text-app-accent-hover truncate">{user.email}</div>
      </div>
    </div>
  )
}
