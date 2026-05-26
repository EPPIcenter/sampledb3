import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { ContainerMoveCsvStep } from '../lib/container-move-csv-types'

export type { ContainerMoveCsvStep, ContainerMoveAtomicMode } from '../lib/container-move-csv-types'

/**
 * URL-synced step state for CSV-based container move wizards (micronix, cryovial).
 */
export function useContainerMoveStep(fileCount: number) {
  const [searchParams, setSearchParams] = useSearchParams()
  const rawStep = (searchParams.get('step') as ContainerMoveCsvStep | null) ?? 'upload'
  const currentStep: ContainerMoveCsvStep =
    rawStep !== 'upload' && fileCount === 0 ? 'upload' : rawStep

  useEffect(() => {
    if (currentStep === 'upload' && rawStep !== 'upload') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        next.set('step', 'upload')
        return next
      })
    }
  }, [currentStep, rawStep, setSearchParams])

  const setStep = (step: ContainerMoveCsvStep) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      next.set('step', step)
      return next
    })
  }

  return { currentStep, setStep }
}
