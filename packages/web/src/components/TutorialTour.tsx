import { useEffect, useRef, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { driver } from 'driver.js'
import 'driver.js/dist/driver.css'
import { useTutorial } from '../contexts/TutorialContext'
import { useToast } from '../contexts/ToastContext'
import { studiesApi } from '../lib/api'

const ELEMENT_WAIT_MS = 2500
const ELEMENT_POLL_MS = 80

/** Wait for selector to appear in DOM, then return selector or 'body' as fallback. */
function waitForElement(selector: string): Promise<string> {
  return new Promise((resolve) => {
    if (document.querySelector(selector)) {
      resolve(selector)
      return
    }
    const deadline = Date.now() + ELEMENT_WAIT_MS
    const timer = setInterval(() => {
      if (document.querySelector(selector)) {
        clearInterval(timer)
        resolve(selector)
        return
      }
      if (Date.now() >= deadline) {
        clearInterval(timer)
        resolve('body')
      }
    }, ELEMENT_POLL_MS)
  })
}

export default function TutorialTour() {
  const location = useLocation()
  const locationRef = useRef(location)
  locationRef.current = location

  const {
    active,
    currentStep,
    steps,
    tutorialShortCode,
    nextStep,
    prevStep,
    endTutorial,
    setTutorialCompleted,
  } = useTutorial()
  const { error: toastError } = useToast()
  const driverRef = useRef<ReturnType<typeof driver> | null>(null)
  const advancingRef = useRef(false)
  const validatingRef = useRef(false)

  const validateStepBeforeNext = useCallback(
    async (stepIndex: number): Promise<{ ok: boolean; message: string }> => {
      try {
        const list = await studiesApi.list()
        const tutorialStudy = list.studies?.find((s) => s.shortCode === tutorialShortCode)
        const studyId = tutorialStudy?.id

        switch (stepIndex) {
          case 0:
            return { ok: true, message: '' }
          case 1: {
            if (tutorialStudy) {
              return { ok: true, message: '' }
            }
            return {
              ok: false,
              message: `Create the study first (title: Tutorial Study, short code: ${tutorialShortCode}), then click Next.`,
            }
          }
          case 2: {
            if (!studyId) {
              return { ok: false, message: `Create study ${tutorialShortCode} first, then import subjects.` }
            }
            const subjects = await studiesApi.getSubjects(studyId)
            const count = subjects.subjects?.length ?? 0
            if (count > 0) {
              return { ok: true, message: '' }
            }
            return {
              ok: false,
              message: `Import at least one subject for ${tutorialShortCode} (Subjects only, CSV with study_short_code and subject_name), then click Next.`,
            }
          }
          case 3: {
            if (!studyId) {
              return { ok: false, message: 'Complete the previous steps first.' }
            }
            const summary = await studiesApi.getSummary(studyId)
            const total = summary.summary?.totalSpecimens ?? 0
            if (total > 0) {
              return { ok: true, message: '' }
            }
            return {
              ok: false,
              message: `Import at least one specimen for ${tutorialShortCode}, then click Next.`,
            }
          }
          case 4: {
            const pathname = locationRef.current.pathname
            const match = pathname.match(/^\/studies\/(\d+)$/)
            if (!match) {
              return {
                ok: false,
                message: `Open the Tutorial Study (${tutorialShortCode}) from the Studies page, then click Next.`,
              }
            }
            const id = parseInt(match[1], 10)
            const study = await studiesApi.get(id)
            if (study.study?.shortCode === tutorialShortCode) {
              return { ok: true, message: '' }
            }
            return {
              ok: false,
              message: `Open the Tutorial Study (${tutorialShortCode}), then click Next.`,
            }
          }
          case 5:
            return { ok: true, message: '' }
          default:
            return { ok: true, message: '' }
        }
      } catch (e) {
        return { ok: false, message: 'Could not verify this step. Try again.' }
      }
    },
    [tutorialShortCode]
  )

  useEffect(() => {
    if (!active) {
      if (driverRef.current) {
        driverRef.current.destroy()
        driverRef.current = null
      }
      return
    }

    const step = steps[currentStep]
    if (!step) return

    advancingRef.current = false
    let cancelled = false

    waitForElement(step.selector).then((effectiveSelector) => {
      if (cancelled) return

      const driverObj = driver({
        showProgress: true,
        steps: [
          {
            element: effectiveSelector,
            popover: {
              title: step.title,
              description: step.description,
              showButtons: ['previous', 'next', 'close'],
              nextBtnText: currentStep === steps.length - 1 ? 'Done' : 'Next',
              onNextClick: async () => {
                if (validatingRef.current) return
                validatingRef.current = true
                try {
                  const result = await validateStepBeforeNext(currentStep)
                  if (!result.ok) {
                    toastError(result.message)
                    return
                  }
                  advancingRef.current = true
                  driverObj.destroy()
                  if (currentStep === steps.length - 1) {
                    setTutorialCompleted()
                    endTutorial()
                  } else {
                    nextStep()
                  }
                } finally {
                  validatingRef.current = false
                }
              },
              onPrevClick: () => {
                advancingRef.current = true
                driverObj.destroy()
                prevStep()
              },
              onCloseClick: () => {
                driverObj.destroy()
                endTutorial()
              },
            },
          },
        ],
        onDestroyed: () => {
          driverRef.current = null
          if (!advancingRef.current) {
            endTutorial()
          }
        },
        allowClose: true,
      })

      driverRef.current = driverObj
      driverObj.drive(0)
    })

    return () => {
      cancelled = true
      if (driverRef.current) {
        driverRef.current.destroy()
        driverRef.current = null
      }
    }
  }, [active, currentStep, steps, nextStep, prevStep, endTutorial, setTutorialCompleted, validateStepBeforeNext, toastError])

  return null
}
