import { useUser } from '../contexts/UserContext'

type Props = {
  onClick: () => void
}

/**
 * Trigger for deleting a Collection with its contents. Admin-only (CONTEXT.md, Roles),
 * so it renders nothing for members and viewers.
 */
export default function CollectionDeleteButton({ onClick }: Props) {
  const { isAdmin } = useUser()
  if (!isAdmin) return null
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 px-3 py-1.5 text-sm rounded border text-app-trend-down border-app-trend-down/50 hover:bg-app-trend-down/10"
    >
      Delete collection…
    </button>
  )
}
