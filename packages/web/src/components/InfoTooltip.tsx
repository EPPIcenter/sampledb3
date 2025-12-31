import { useState, useRef } from 'react'
import {
  useFloating,
  autoUpdate,
  offset,
  flip,
  shift,
  arrow,
  Placement,
} from '@floating-ui/react'

interface InfoTooltipProps {
  text: string
  className?: string
}

export default function InfoTooltip({ text, className = '' }: InfoTooltipProps) {
  const [isVisible, setIsVisible] = useState(false)
  const arrowRef = useRef<HTMLSpanElement>(null)

  const { refs, floatingStyles, placement, middlewareData } = useFloating({
    open: isVisible,
    onOpenChange: setIsVisible,
    placement: 'top' as Placement,
    middleware: [
      offset(8),
      flip({
        fallbackPlacements: ['bottom', 'right', 'left'],
      }),
      shift({
        padding: 8,
      }),
      arrow({
        element: arrowRef,
      }),
    ],
    whileElementsMounted: autoUpdate,
  })

  const arrowStyle = {
    position: 'absolute' as const,
    ...(middlewareData.arrow && {
      left: middlewareData.arrow.x != null ? `${middlewareData.arrow.x}px` : undefined,
      top: middlewareData.arrow.y != null ? `${middlewareData.arrow.y}px` : undefined,
    }),
  }

  // Determine arrow direction based on placement
  const getArrowBorderClass = () => {
    if (placement.startsWith('top')) {
      return 'border-t-gray-200'
    } else if (placement.startsWith('bottom')) {
      return 'border-b-gray-200'
    } else if (placement.startsWith('left')) {
      return 'border-l-gray-200'
    } else {
      return 'border-r-gray-200'
    }
  }

  return (
    <span className={`relative inline-block ${className}`}>
      <span
        ref={refs.setReference}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 cursor-help"
        onMouseEnter={() => setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
        onFocus={() => setIsVisible(true)}
        onBlur={() => setIsVisible(false)}
        role="tooltip"
        aria-label="Information"
        tabIndex={0}
      >
        <svg
          className="w-3 h-3"
          fill="currentColor"
          viewBox="0 0 20 20"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            fillRule="evenodd"
            d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
            clipRule="evenodd"
          />
        </svg>
      </span>
      {isVisible && (
        <span
          ref={refs.setFloating}
          style={{
            ...floatingStyles,
            width: 'max-content',
            maxWidth: '32rem',
            minWidth: '20rem',
          }}
          className="z-50 p-3 text-sm text-gray-700 bg-white border border-gray-200 rounded-lg shadow-lg pointer-events-none block"
        >
          <span
            ref={arrowRef}
            style={arrowStyle}
            className={`w-0 h-0 border-4 border-transparent ${getArrowBorderClass()}`}
          />
          <span className="relative z-10 block">{text}</span>
        </span>
      )}
    </span>
  )
}

