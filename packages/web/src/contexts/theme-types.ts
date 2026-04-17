export const THEME_IDS = ['light', 'dark', 'sepia', 'ocean', 'warm-dark', 'high-contrast', 'forest', 'rose'] as const
export type Theme = (typeof THEME_IDS)[number]

export const THEME_LABELS: Record<Theme, string> = {
  light: 'Light',
  dark: 'Dark',
  sepia: 'Sepia',
  ocean: 'Ocean',
  'warm-dark': 'Warm dark',
  'high-contrast': 'High contrast',
  forest: 'Forest',
  rose: 'Rose',
}
