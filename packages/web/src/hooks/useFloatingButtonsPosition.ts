/**
 * Hook to determine if floating action buttons should be positioned at the top
 * instead of the bottom. 
 * 
 * NOTE: This hook is now deprecated. Buttons use a hover-expand system instead
 * of moving positions. This hook is kept for backwards compatibility but always
 * returns false (buttons always at bottom).
 */
export function useFloatingButtonsPosition() {
  // Buttons now use hover-expand system, so they always stay at bottom
  return false
}

