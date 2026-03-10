import type { CSSProperties } from 'react'

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

const TOOLTIP_TOKEN_NAMES = {
  card: '--app-card',
  text: '--app-text',
  border: '--app-border',
} as const

export interface AppTooltipStyles {
  contentStyle: CSSProperties
  labelStyle: CSSProperties
}

const AXIS_TOKEN_NAMES = { text: '--app-text', border: '--app-border' } as const

export interface AppAxisColors {
  text: string
  border: string
}

/** Theme-aware colors for chart axes, grid lines, and labels (e.g. StudyTimeline). */
export function getAppAxisColors(): AppAxisColors {
  if (typeof document === 'undefined') {
    return { text: 'rgb(30, 41, 59)', border: 'rgb(226, 232, 240)' }
  }
  const root = document.documentElement
  const style = getComputedStyle(root)
  const text = style.getPropertyValue(AXIS_TOKEN_NAMES.text).trim()
  const border = style.getPropertyValue(AXIS_TOKEN_NAMES.border).trim()
  return {
    text: text ? parseTokenRgb(text) : 'rgb(30, 41, 59)',
    border: border ? parseTokenRgb(border) : 'rgb(226, 232, 240)',
  }
}

/** Theme-aware styles for Recharts (and other) chart tooltips. */
export function getAppTooltipStyles(): AppTooltipStyles {
  if (typeof document === 'undefined') {
    return {
      contentStyle: {
        margin: 0,
        padding: 10,
        backgroundColor: 'rgb(255, 255, 255)',
        border: '1px solid rgb(226, 232, 240)',
        borderRadius: 6,
        color: 'rgb(30, 41, 59)',
        whiteSpace: 'nowrap' as const,
      },
      labelStyle: { color: 'rgb(30, 41, 59)' },
    }
  }
  const root = document.documentElement
  const style = getComputedStyle(root)
  const card = style.getPropertyValue(TOOLTIP_TOKEN_NAMES.card).trim()
  const text = style.getPropertyValue(TOOLTIP_TOKEN_NAMES.text).trim()
  const border = style.getPropertyValue(TOOLTIP_TOKEN_NAMES.border).trim()
  const bg = card ? `rgb(${card})` : 'rgb(255, 255, 255)'
  const textColor = text ? `rgb(${text})` : 'rgb(30, 41, 59)'
  const borderColor = border ? `rgb(${border})` : 'rgb(226, 232, 240)'
  return {
    contentStyle: {
      margin: 0,
      padding: 10,
      backgroundColor: bg,
      border: `1px solid ${borderColor}`,
      borderRadius: 6,
      color: textColor,
      whiteSpace: 'nowrap',
    },
    labelStyle: { color: textColor },
  }
}
