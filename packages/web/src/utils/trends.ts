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

