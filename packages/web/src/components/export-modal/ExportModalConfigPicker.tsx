import { Link } from 'react-router-dom'
import type { ExportConfigurationWithSource } from '../../hooks/useExportConfigurations'
import { formatExportConfigId } from '../../lib/export-config-selection'

interface ExportModalConfigPickerProps {
  exportConfigurations: ExportConfigurationWithSource[]
  selectedConfigId: string | null
  loadingConfigs: boolean
  focusedConfigIndex: number | null
  onSelectConfig: (configId: string, index: number) => void
  onFocusConfig: (index: number | null) => void
}

export default function ExportModalConfigPicker({
  exportConfigurations,
  selectedConfigId,
  loadingConfigs,
  focusedConfigIndex,
  onSelectConfig,
  onFocusConfig,
}: ExportModalConfigPickerProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-app-text">Export Configuration</label>
        <Link
          to="/settings?category=data-management&section=export-configurations"
          className="text-xs text-app-accent hover:text-app-accent-hover hover:underline flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          Manage in Settings
        </Link>
      </div>
      {loadingConfigs ? (
        <div className="space-y-1.5">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="w-full h-10 app-skeleton-bar rounded border border-app-border animate-pulse"
            />
          ))}
        </div>
      ) : exportConfigurations.length === 0 ? (
        <div className="text-sm p-3 bg-app-surface rounded border border-app-border">
          <p className="text-app-text mb-2">No export configurations available.</p>
          <Link
            to="/settings?category=data-management&section=export-configurations"
            className="text-app-accent hover:text-app-accent-hover hover:underline font-medium inline-flex items-center gap-1"
          >
            Create one in Settings
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      ) : (
        <div
          className="space-y-1.5"
          role="radiogroup"
          aria-label="Export configuration"
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              const currentIndex =
                focusedConfigIndex ??
                exportConfigurations.findIndex(
                  (c) => formatExportConfigId(c.source!, c.name) === selectedConfigId
                )
              let newIndex: number
              if (e.key === 'ArrowDown') {
                newIndex = currentIndex < exportConfigurations.length - 1 ? currentIndex + 1 : 0
              } else {
                newIndex = currentIndex > 0 ? currentIndex - 1 : exportConfigurations.length - 1
              }
              onFocusConfig(newIndex)
              const newConfig = exportConfigurations[newIndex]
              onSelectConfig(formatExportConfigId(newConfig.source!, newConfig.name), newIndex)
              const button = e.currentTarget.children[newIndex] as HTMLElement
              button.focus()
            } else if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              if (focusedConfigIndex !== null) {
                const focusedConfig = exportConfigurations[focusedConfigIndex]
                onSelectConfig(formatExportConfigId(focusedConfig.source!, focusedConfig.name), focusedConfigIndex)
              }
            }
          }}
        >
          {exportConfigurations.map((config, index) => {
            const configId = formatExportConfigId(config.source!, config.name)
            const isSelected = configId === selectedConfigId
            const isFocused = focusedConfigIndex === index
            return (
              <button
                key={configId}
                type="button"
                role="radio"
                aria-checked={isSelected}
                aria-label={`${config.name}, ${config.source === 'personal' ? 'Personal' : 'Shared'} configuration, ${config.columns.length} columns${config.isDefault ? ', Default' : ''}`}
                onClick={() => onSelectConfig(configId, index)}
                onFocus={() => onFocusConfig(index)}
                onBlur={() => {
                  if (configId !== selectedConfigId) onFocusConfig(null)
                }}
                onMouseEnter={() => onFocusConfig(index)}
                onMouseLeave={() => {
                  if (configId !== selectedConfigId) onFocusConfig(null)
                }}
                className={`w-full text-left px-3 py-2 border rounded transition-all focus:outline-none focus:ring-2 focus:ring-app-accent focus:ring-offset-1 ${
                  isSelected
                    ? 'border-app-accent bg-app-accent-muted shadow-sm'
                    : isFocused
                      ? 'border-app-accent/50 bg-app-accent-muted/70'
                      : 'border-app-border hover:border-app-accent/50 hover:bg-app-accent-muted/50'
                }`}
                title={
                  config.columns.length > 0
                    ? `Columns: ${config.columns.slice(0, 5).join(', ')}${config.columns.length > 5 ? `, +${config.columns.length - 5} more` : ''}`
                    : 'No columns'
                }
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-1 min-w-0">
                    <span
                      className={`font-medium text-sm truncate ${isSelected ? 'text-app-accent-hover' : 'text-app-text'}`}
                    >
                      {config.name}
                    </span>
                    {config.isDefault && (
                      <span
                        className="px-1.5 py-0.5 text-[10px] font-medium bg-app-accent-muted text-app-accent-hover rounded flex-shrink-0"
                        aria-label="Default configuration"
                      >
                        Default
                      </span>
                    )}
                    <span
                      className={`px-1.5 py-0.5 text-[10px] font-medium rounded flex-shrink-0 ${
                        config.source === 'personal'
                          ? 'bg-app-accent-muted text-app-accent-hover'
                          : 'bg-app-surface text-app-text-muted'
                      }`}
                      aria-label={config.source === 'personal' ? 'Personal configuration' : 'Shared configuration'}
                    >
                      {config.source === 'personal' ? 'Personal' : 'Shared'}
                    </span>
                    <span
                      className="text-xs text-app-text-muted flex-shrink-0"
                      aria-label={`${config.columns.length} columns`}
                    >
                      {config.columns.length} cols
                    </span>
                  </div>
                  {isSelected && (
                    <svg
                      className="w-4 h-4 text-app-accent-hover flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                      aria-hidden="true"
                    >
                      <path
                        fillRule="evenodd"
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                  )}
                </div>
              </button>
            )
          })}
        </div>
      )}
      <p className="mt-2 text-xs text-app-text-muted">
        Select which columns to include in the export. Configure options in Settings.
      </p>
    </div>
  )
}
