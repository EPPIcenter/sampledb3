/** Length of each window a dashboard trend compares. */
export const TREND_WINDOW_DAYS = 30

/** A `created_from` / `created_to` pair, as calendar dates (YYYY-MM-DD, UTC). */
export type CreatedRange = { created_from: string; created_to?: string }

export type TrendWindows = {
  /** The last 30 days, today included. */
  current: CreatedRange
  /** The 30 days before `current`. */
  previous: CreatedRange
}

function utcDateDaysBefore(now: Date, days: number): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/**
 * The two windows a dashboard trend compares. Created timestamps are stored in UTC, so the
 * windows use UTC calendar dates. Both `created_to` bounds include their whole day.
 */
export function trendWindows(now: Date, days = TREND_WINDOW_DAYS): TrendWindows {
  return {
    current: { created_from: utcDateDaysBefore(now, days - 1) },
    previous: {
      created_from: utcDateDaysBefore(now, 2 * days - 1),
      created_to: utcDateDaysBefore(now, days),
    },
  }
}

/**
 * Percentage change from `previous` to `current`, rounded to one decimal place. Returns null
 * when `previous` is 0: a change from nothing has no meaningful percentage.
 */
export function calculateTrend(current: number, previous: number): {
  value: number
  positive: boolean
} | null {
  if (previous === 0) return null

  const change = ((current - previous) / previous) * 100
  return {
    value: Math.abs(Math.round(change * 10) / 10),
    positive: change >= 0,
  }
}
