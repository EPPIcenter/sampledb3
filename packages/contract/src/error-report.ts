import { z } from 'zod'

/**
 * Size caps on a frontend error report (POST /api/error-logs). The endpoint accepts reports
 * without login, so the caps bound how much one request can write to `error_logs`.
 */
export const ERROR_REPORT_LIMITS = {
  /** Whole request body, in bytes; the API rejects a larger body with 413. */
  bodyBytes: 64 * 1024,
  message: 2_000,
  stack: 16_000,
  errorCode: 200,
  /** `context` serialized as JSON, in characters. */
  contextJson: 16_000,
} as const

const ERROR_REPORT_LEVELS = ['error', 'warning', 'info'] as const

function jsonLength(value: unknown): number {
  return JSON.stringify(value)?.length ?? 0
}

export const errorReportSchema = z.object({
  message: z.string().max(ERROR_REPORT_LIMITS.message),
  stack: z.string().max(ERROR_REPORT_LIMITS.stack).optional(),
  errorCode: z.string().max(ERROR_REPORT_LIMITS.errorCode).optional(),
  level: z.enum(ERROR_REPORT_LEVELS).default('error'),
  context: z
    .record(z.string(), z.unknown())
    .refine((context) => jsonLength(context) <= ERROR_REPORT_LIMITS.contextJson, {
      message: `context must serialize to at most ${ERROR_REPORT_LIMITS.contextJson} characters of JSON`,
    })
    .optional(),
})

export type ErrorReport = z.input<typeof errorReportSchema>

const TRUNCATION_MARK = '…[truncated]'

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - TRUNCATION_MARK.length) + TRUNCATION_MARK
}

/**
 * Shorten a report so it passes `errorReportSchema`'s caps: long strings are cut, and a context
 * over its cap is replaced by the `keepContextKeys` entries that are strings (each cut to 1,000
 * characters) plus `contextTruncated: true`.
 */
export function fitErrorReportToLimits(report: ErrorReport, keepContextKeys: readonly string[] = []): ErrorReport {
  let context = report.context
  if (context && jsonLength(context) > ERROR_REPORT_LIMITS.contextJson) {
    const kept: Record<string, unknown> = { contextTruncated: true }
    for (const key of keepContextKeys) {
      const value = context[key]
      if (typeof value === 'string') kept[key] = truncate(value, 1_000)
    }
    context = kept
  }
  return {
    ...report,
    message: truncate(report.message, ERROR_REPORT_LIMITS.message),
    ...(report.stack !== undefined && { stack: truncate(report.stack, ERROR_REPORT_LIMITS.stack) }),
    ...(report.errorCode !== undefined && { errorCode: truncate(report.errorCode, ERROR_REPORT_LIMITS.errorCode) }),
    ...(context !== undefined && { context }),
  }
}
