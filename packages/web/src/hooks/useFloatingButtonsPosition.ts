import { useEffect, useState } from 'react'

/**
 * Hook to determine if floating action buttons should be positioned at the top
 * instead of the bottom. This happens when:
 * 1. User has scrolled near the bottom of the page
 * 2. There are interactable elements in the bottom-right corner that would be covered
 */
export function useFloatingButtonsPosition() {
  const [shouldBeAtTop, setShouldBeAtTop] = useState(false)

  useEffect(() => {
    const checkPosition = () => {
      // Check if we're near the bottom of the page
      const windowHeight = window.innerHeight
      const documentHeight = document.documentElement.scrollHeight
      const scrollTop = window.scrollY || document.documentElement.scrollTop
      const scrollBottom = scrollTop + windowHeight
      
      // Consider "near bottom" if within 200px of the bottom
      const isNearBottom = documentHeight - scrollBottom < 200

      if (!isNearBottom) {
        setShouldBeAtTop(false)
        return
      }

      // Check if there are interactable elements in the bottom-right corner
      // The buttons are positioned at bottom-6 right-6 (24px from edges)
      // Each button is approximately 50px tall, so we check a 100px tall area
      const buttonArea = {
        right: 24, // right-6 = 1.5rem = 24px
        bottom: 24, // bottom-6 = 1.5rem = 24px
        width: 200, // Approximate width of buttons + some margin
        height: 120, // Height of both buttons + gap
      }

      // Get all interactable elements in the viewport
      const interactableSelectors = [
        'button',
        'a[href]',
        'input:not([type="hidden"])',
        'textarea',
        'select',
        '[role="button"]',
        '[tabindex]:not([tabindex="-1"])',
        '[onclick]',
      ]

      const allInteractables = document.querySelectorAll(
        interactableSelectors.join(', ')
      )

      let hasOverlappingElement = false

      for (const element of allInteractables) {
        const rect = element.getBoundingClientRect()
        
        // Skip if element is not visible
        if (rect.width === 0 || rect.height === 0) continue
        
        // Skip if element is the floating buttons themselves
        if (element.closest('[data-floating-buttons="true"]')) {
          continue
        }

        // Check if element overlaps with the button area
        const elementRight = rect.right
        const elementBottom = rect.bottom
        const buttonAreaLeft = window.innerWidth - buttonArea.right - buttonArea.width
        const buttonAreaTop = window.innerHeight - buttonArea.bottom - buttonArea.height

        const overlaps =
          elementRight > buttonAreaLeft &&
          rect.left < window.innerWidth - buttonArea.right &&
          elementBottom > buttonAreaTop &&
          rect.top < window.innerHeight - buttonArea.bottom

        if (overlaps) {
          hasOverlappingElement = true
          break
        }
      }

      setShouldBeAtTop(isNearBottom && hasOverlappingElement)
    }

    // Check on mount and scroll
    checkPosition()
    window.addEventListener('scroll', checkPosition, { passive: true })
    window.addEventListener('resize', checkPosition, { passive: true })

    // Also check when DOM changes (for dynamically added elements)
    const observer = new MutationObserver(checkPosition)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style'],
    })

    return () => {
      window.removeEventListener('scroll', checkPosition)
      window.removeEventListener('resize', checkPosition)
      observer.disconnect()
    }
  }, [])

  return shouldBeAtTop
}

