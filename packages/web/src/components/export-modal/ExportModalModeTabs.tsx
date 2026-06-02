type UploadMode = 'manual' | 'csv'

interface ExportModalModeTabsProps {
  uploadMode: UploadMode
  onSwitchMode: (mode: UploadMode) => void
}

export default function ExportModalModeTabs({ uploadMode, onSwitchMode }: ExportModalModeTabsProps) {
  return (
    <div className="mb-6 border-b border-app-border">
      <nav className="-mb-px flex space-x-8">
        <button
          onClick={() => onSwitchMode('manual')}
          className={`py-4 px-1 border-b-2 font-medium text-sm ${
            uploadMode === 'manual'
              ? 'border-app-accent text-app-accent'
              : 'border-transparent text-app-text-muted hover:text-app-text hover:border-app-border'
          }`}
        >
          Manual Selection
        </button>
        <button
          onClick={() => onSwitchMode('csv')}
          className={`py-4 px-1 border-b-2 font-medium text-sm ${
            uploadMode === 'csv'
              ? 'border-app-accent text-app-accent'
              : 'border-transparent text-app-text-muted hover:text-app-text hover:border-app-border'
          }`}
        >
          CSV Upload
        </button>
      </nav>
    </div>
  )
}
