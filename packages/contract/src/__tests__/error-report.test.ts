import { describe, it, expect } from 'bun:test'
import { ERROR_REPORT_LIMITS, errorReportSchema, fitErrorReportToLimits } from '../error-report'

describe('errorReportSchema', () => {
  it('accepts a report at every cap and rejects one over any cap', () => {
    const atCap = {
      message: 'm'.repeat(ERROR_REPORT_LIMITS.message),
      stack: 's'.repeat(ERROR_REPORT_LIMITS.stack),
      errorCode: 'e'.repeat(ERROR_REPORT_LIMITS.errorCode),
    }
    expect(errorReportSchema.safeParse(atCap).success).toBe(true)
    expect(errorReportSchema.safeParse({ ...atCap, message: atCap.message + 'm' }).success).toBe(false)
    expect(errorReportSchema.safeParse({ ...atCap, stack: atCap.stack + 's' }).success).toBe(false)
    expect(errorReportSchema.safeParse({ ...atCap, errorCode: atCap.errorCode + 'e' }).success).toBe(false)
    expect(
      errorReportSchema.safeParse({ message: 'x', context: { pad: 'c'.repeat(ERROR_REPORT_LIMITS.contextJson) } }).success
    ).toBe(false)
  })
})

describe('fitErrorReportToLimits', () => {
  it('leaves a report within the caps unchanged', () => {
    const report = { message: 'm', stack: 's', level: 'error' as const, context: { a: 1 } }
    expect(fitErrorReportToLimits(report)).toEqual(report)
  })

  it('cuts long strings and replaces an oversized context with the kept keys', () => {
    const fitted = fitErrorReportToLimits(
      {
        message: 'm'.repeat(ERROR_REPORT_LIMITS.message + 10),
        stack: 's'.repeat(ERROR_REPORT_LIMITS.stack + 10),
        errorCode: 'e'.repeat(ERROR_REPORT_LIMITS.errorCode + 10),
        context: { requestId: 'req_1', count: 3, blob: 'b'.repeat(ERROR_REPORT_LIMITS.contextJson) },
      },
      ['requestId', 'count', 'missing']
    )
    expect(errorReportSchema.safeParse(fitted).success).toBe(true)
    expect(fitted.message.endsWith('…[truncated]')).toBe(true)
    expect(fitted.context).toEqual({ contextTruncated: true, requestId: 'req_1' })
  })
})
