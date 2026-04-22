import { authApi } from '../../api'
import type { Command } from '../../commands'
import type { CommandDependencies } from '../command-deps'
import { THEME_IDS, THEME_LABELS, type Theme } from '../../../contexts/ThemeContext'
import { formatHotkey, getModifierKey } from '../../hotkeys'

function modShortcut(key: string): string {
  return formatHotkey(`${getModifierKey()}+${key}`)
}

export function buildSystemCommands(d: CommandDependencies): Command[] {
  const themeCommands: Command[] = THEME_IDS.map((tid: Theme) => ({
    id: `theme-${tid}`,
    label: `Switch to ${THEME_LABELS[tid]} Theme`,
    category: 'Settings' as const,
    keywords: ['theme', 'appearance', tid, THEME_LABELS[tid].toLowerCase()],
    action: () => d.setTheme(tid),
    context: { kind: 'always' as const },
    hideFromEmptyList: true,
  }))

  const cmds: Command[] = [
    ...themeCommands,
    {
      id: 'sign-out',
      label: 'Sign Out',
      category: 'Actions',
      keywords: ['logout', 'sign out', 'log out', 'exit'],
      action: async () => {
        try {
          await authApi.logout()
          await d.refreshUser()
          d.navigate('/login')
        } catch (e) {
          console.error('Sign out failed:', e)
        }
      },
    },
    {
      id: 'copy-url',
      label: 'Copy Current URL',
      category: 'Actions',
      keywords: ['copy', 'url', 'link', 'clipboard'],
      action: () => {
        void navigator.clipboard.writeText(window.location.href)
      },
    },
    {
      id: 'reload-page',
      label: 'Reload Page',
      category: 'Actions',
      keywords: ['reload', 'refresh', 'hard refresh'],
      action: () => {
        window.location.reload()
      },
    },
    {
      id: 'go-back',
      label: 'Go Back',
      category: 'Actions',
      keywords: ['back', 'history'],
      action: () => d.navigate(-1),
    },
    {
      id: 'go-forward',
      label: 'Go Forward',
      category: 'Actions',
      keywords: ['forward', 'history'],
      action: () => d.navigate(1),
    },
    {
      id: 'show-shortcuts',
      label: 'Show Keyboard Shortcuts',
      category: 'Actions',
      keywords: ['shortcuts', 'hotkeys', 'keyboard', 'help'],
      shortcut: '?',
      hideFromEmptyList: true,
      action: () => d.toggleHelpModal(),
    },
    {
      id: 'open-search-modal',
      label: 'Open Search',
      category: 'Actions',
      keywords: ['search', 'find', 'lookup'],
      description: 'Same as the search button',
      shortcut: modShortcut('k'),
      hideFromEmptyList: true,
      action: () => {
        d.openSearchModal()
      },
    },
  ]

  return cmds
}
