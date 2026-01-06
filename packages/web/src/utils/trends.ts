/**
 * Calculate trend percentage between two values
 * @param current Current value
 * @param previous Previous value
 * @returns Object with value (percentage change) and positive flag
 */
export function calculateTrend(current: number, previous: number): {
  value: number
  positive: boolean
} | null {
  if (previous === 0) {
    // If previous is 0, we can't calculate a meaningful trend
    if (current === 0) return null
    return { value: 100, positive: true }
  }

  const change = ((current - previous) / previous) * 100
  return {
    value: Math.abs(Math.round(change * 10) / 10), // Round to 1 decimal place
    positive: change >= 0,
  }
}

/**
 * Get date range for previous period
 * @param days Number of days to look back
 * @returns Object with from and to dates in ISO format
 */
export function getPreviousPeriod(days: number): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now)
  to.setDate(to.getDate() - days)
  
  const from = new Date(to)
  from.setDate(from.getDate() - days)

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

/**
 * Get date range for current period
 * @param days Number of days to look back from today
 * @returns Object with from and to dates in ISO format
 */
export function getCurrentPeriod(days: number): { from: string; to: string } {
  const now = new Date()
  const to = new Date(now)
  const from = new Date(now)
  from.setDate(from.getDate() - days)

  return {
    from: from.toISOString().split('T')[0],
    to: to.toISOString().split('T')[0],
  }
}

