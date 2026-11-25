import { describe, it, expect, afterEach } from 'vitest'
import { getAppAxisColors, getAppChartColors, getAppTooltipStyles } from '../chart-colors'

describe('chart colors', () => {
  let style: HTMLStyleElement | null = null

  afterEach(() => {
    style?.remove()
    style = null
    delete document.documentElement.dataset.theme
  })

  it('reads the tokens of the requested theme, not the theme the document shows yet', () => {
    style = document.createElement('style')
    style.textContent = `
      :root, [data-theme="light"] { --app-text: 10 20 30; --app-border: 40 50 60; --app-card: 1 1 1; --app-chart-1: 7 8 9; }
      [data-theme="dark"] { --app-text: 200 210 220; --app-border: 90 90 90; --app-card: 2 2 2; --app-chart-1: 4 5 6; }
    `
    document.head.appendChild(style)
    document.documentElement.dataset.theme = 'light'

    expect(getAppAxisColors('dark')).toEqual({ text: 'rgb(200, 210, 220)', border: 'rgb(90, 90, 90)' })
    expect(getAppChartColors('dark')[0]).toBe('rgb(4, 5, 6)')
    expect(getAppTooltipStyles('dark').contentStyle.backgroundColor).toBe('rgb(2 2 2)')
    expect(getAppAxisColors('light').text).toBe('rgb(10, 20, 30)')
  })

  it('leaves no probe element behind', () => {
    const before = document.body.childElementCount
    getAppChartColors('light')
    expect(document.body.childElementCount).toBe(before)
  })
})
