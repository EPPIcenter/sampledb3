/**
 * Read app chart palette from CSS variables (--app-chart-1 … --app-chart-8).
 * Values are theme-aware (light/dark) so charts adapt automatically.
 */
const CHART_TOKEN_NAMES = [
  '--app-chart-1',
  '--app-chart-2',
  '--app-chart-3',
  '--app-chart-4',
  '--app-chart-5',
  '--app-chart-6',
  '--app-chart-7',
  '--app-chart-8',
] as const

function parseTokenRgb(value: string): string {
  const parts = value.trim().split(/\s+/)
  if (parts.length !== 3) return 'rgb(100, 116, 139)'
  const r = Math.max(0, Math.min(255, parseInt(parts[0] ?? '0', 10) || 0))
  const g = Math.max(0, Math.min(255, parseInt(parts[1] ?? '0', 10) || 0))
  const b = Math.max(0, Math.min(255, parseInt(parts[2] ?? '0', 10) || 0))
  return `rgb(${r}, ${g}, ${b})`
}

export function getAppChartColors(): string[] {
  if (typeof document === 'undefined') {
    return [
      'rgb(20, 184, 166)',
      'rgb(13, 148, 136)',
      'rgb(45, 212, 191)',
      'rgb(94, 234, 212)',
      'rgb(100, 116, 139)',
      'rgb(148, 163, 184)',
      'rgb(203, 213, 225)',
      'rgb(71, 85, 105)',
    ]
  }
  const root = document.documentElement
  const style = getComputedStyle(root)
  return CHART_TOKEN_NAMES.map((name) => {
    const value = style.getPropertyValue(name).trim()
    return value ? parseTokenRgb(value) : 'rgb(100, 116, 139)'
  })
}
