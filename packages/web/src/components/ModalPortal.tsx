import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Renders children into document.body so modal overlays are not clipped by
 * ancestors with overflow (e.g. main with overflow-auto). Use as the root
 * wrapper for any modal that uses fixed inset-0.
 */
export default function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null
  return createPortal(children, document.body)
}
