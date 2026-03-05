import { describe, it, expect } from 'vitest'
import { formatErrorLogForLLM } from '../error-log-prompt'
import type { ErrorLog } from '../api'

describe('formatErrorLogForLLM', () => {
  it('includes intro asking for help fixing the bug', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'frontend',
      level: 'error',
      message: 'Something broke',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toMatch(/help.*fix|fix.*bug|diagnose/i)
  })

  it('includes message, level, source, and timestamp in structured sections', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'frontend',
      level: 'error',
      message: 'TypeError: Cannot read property "x" of undefined',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('TypeError: Cannot read property "x" of undefined')
    expect(out).toContain('error')
    expect(out).toContain('frontend')
    expect(out).toContain('2025-03-05')
  })

  it('includes stack trace in a code block when present', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'frontend',
      level: 'error',
      message: 'Oops',
      stack: 'Error: Oops\n    at foo (bar.ts:10:5)',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('bar.ts:10:5')
    expect(out).toMatch(/```[\s\S]*stack|stack[\s\S]*```/i)
  })

  it('includes context as structured data when present', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'frontend',
      level: 'error',
      message: 'Failed',
      context: { type: 'windowError', filename: 'app.js', lineno: 42 },
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('windowError')
    expect(out).toContain('app.js')
    expect(out).toContain('42')
  })

  it('includes url and userAgent in environment when present', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'frontend',
      level: 'error',
      message: 'Failed',
      url: 'https://app.example.com/page',
      userAgent: 'Mozilla/5.0',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('https://app.example.com/page')
    expect(out).toContain('Mozilla/5.0')
  })

  it('includes errorCode when present', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'backend',
      level: 'error',
      message: 'Database error',
      errorCode: 'ERR_DB_CONSTRAINT',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('ERR_DB_CONSTRAINT')
  })

  it('produces valid output for minimal log with only required fields', () => {
    const log: ErrorLog = {
      id: 1,
      timestamp: '2025-03-05T12:00:00Z',
      source: 'backend',
      level: 'warning',
      message: 'Minimal message',
      resolved: false,
    }
    const out = formatErrorLogForLLM(log)
    expect(out).toContain('Minimal message')
    expect(out).toContain('warning')
    expect(out).toContain('backend')
    expect(out.length).toBeGreaterThan(50)
  })
})
