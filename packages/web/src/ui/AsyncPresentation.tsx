import type { ReactNode } from 'react'
import type { PresentationStatus } from './async'

export interface AsyncPresentationProps {
  status: PresentationStatus
  loadingFallback: ReactNode
  emptyFallback?: ReactNode
  errorFallback?: ReactNode
  children: ReactNode
}

export function AsyncPresentation({
  status,
  loadingFallback,
  emptyFallback,
  errorFallback,
  children,
}: AsyncPresentationProps) {
  if (status === 'loading') return <>{loadingFallback}</>
  if (status === 'error') return <>{errorFallback}</>
  if (status === 'empty') return <>{emptyFallback}</>
  return <>{children}</>
}
