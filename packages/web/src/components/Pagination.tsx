interface PaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalItems?: number
  itemsPerPage?: number
}

export default function Pagination({
  currentPage,
  totalPages,
  onPageChange,
  totalItems,
  itemsPerPage,
}: PaginationProps) {
  if (totalPages <= 1) return null

  const startItem = ((currentPage - 1) * (itemsPerPage || 10)) + 1
  const endItem = Math.min(currentPage * (itemsPerPage || 10), totalItems || 0)

  return (
    <div className="flex items-center justify-between px-6 py-4 border-t border-app-border">
      <div className="flex items-center">
        <p className="text-sm text-app-text-muted">
          Showing <span className="font-medium text-app-text">{startItem}</span> to{' '}
          <span className="font-medium text-app-text">{endItem}</span> of{' '}
          <span className="font-medium text-app-text">{totalItems || 0}</span> results
        </p>
      </div>
      <div className="flex items-center space-x-2">
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="px-4 py-2 border border-app-border rounded-lg text-sm font-medium text-app-text hover:bg-app-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Previous
        </button>
        <span className="text-sm text-app-text-muted">
          Page <span className="font-medium text-app-text">{currentPage}</span> of{' '}
          <span className="font-medium text-app-text">{totalPages}</span>
        </span>
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="px-4 py-2 border border-app-border rounded-lg text-sm font-medium text-app-text hover:bg-app-surface disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Next
        </button>
      </div>
    </div>
  )
}
