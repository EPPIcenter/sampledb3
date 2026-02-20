import { describe, it, expect } from 'vitest'
import { isTypingInInput, shouldBlockBrowserShortcuts } from '../useHotkey'

describe('useHotkey', () => {
  describe('isTypingInInput', () => {
    it('returns false when document.activeElement is null or body', () => {
      Object.defineProperty(document, 'activeElement', {
        value: null,
        configurable: true,
      })
      expect(isTypingInInput()).toBe(false)

      const body = document.createElement('body')
      Object.defineProperty(document, 'activeElement', {
        value: body,
        configurable: true,
      })
      expect(isTypingInInput()).toBe(false)
    })

    it('returns false when activeElement is document (no tagName, e.g. nothing focused)', () => {
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', {
        value: document,
        configurable: true,
      })
      expect(isTypingInInput()).toBe(false)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })

    it('returns true when activeElement is input (mocked)', () => {
      const input = document.createElement('input')
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: input, configurable: true })
      expect(isTypingInInput()).toBe(true)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })

    it('returns true when activeElement is textarea (mocked)', () => {
      const textarea = document.createElement('textarea')
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: textarea, configurable: true })
      expect(isTypingInInput()).toBe(true)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })

    it('returns true when activeElement is contenteditable (mocked)', () => {
      const div = document.createElement('div')
      div.setAttribute('contenteditable', 'true')
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: div, configurable: true })
      expect(isTypingInInput()).toBe(true)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })

    it('returns false when activeElement is a button (mocked)', () => {
      const button = document.createElement('button')
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: button, configurable: true })
      expect(isTypingInInput()).toBe(false)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })
  })

  describe('shouldBlockBrowserShortcuts', () => {
    it('returns false when user is typing in input (mocked)', () => {
      const input = document.createElement('input')
      const orig = Object.getOwnPropertyDescriptor(document, 'activeElement')
      Object.defineProperty(document, 'activeElement', { value: input, configurable: true })
      expect(shouldBlockBrowserShortcuts()).toBe(false)
      if (orig) Object.defineProperty(document, 'activeElement', orig)
    })

    it('returns true when focus is not in input', () => {
      const div = document.createElement('div')
      document.body.appendChild(div)
      div.focus()
      expect(shouldBlockBrowserShortcuts()).toBe(true)
      document.body.removeChild(div)
    })
  })
})
