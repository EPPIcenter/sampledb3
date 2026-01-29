import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from './UserContext'

const TUTORIAL_STORAGE_KEY = 'sampledb-tutorial-completed'

/** Short code prefix for tutorial namespace. Matches API: studies with short code starting with this can be deleted by any user. */
export const TUTORIAL_SHORT_CODE_PREFIX = 'TUT'

const TUTORIAL_STEP_TEMPLATES: Array<{
  id: string
  route: string
  selector: string
  title: string
  description: string
}> = [
  {
    id: 'create-study-start',
    route: '/studies',
    selector: '[data-tutorial="new-study"]',
    title: 'Create a study',
    description:
      "Click New Study to open the form. On the next page, use title 'Tutorial Study' and short code {{CODE}}, then click Create Study.",
  },
  {
    id: 'create-study-form',
    route: '/studies/new',
    selector: '[data-tutorial="create-study-form"]',
    title: 'Create the study',
    description:
      "Use title 'Tutorial Study' and short code {{CODE}}. Then click Create Study.",
  },
  {
    id: 'import-subjects',
    route: '/import',
    selector: '[data-tutorial="import-type"]',
    title: 'Import subjects',
    description:
      "Select 'Subjects only', upload a CSV with study_short_code and subject_name (e.g. {{CODE}}). Validate and import.",
  },
  {
    id: 'import-specimens',
    route: '/import',
    selector: '[data-tutorial="import-upload"]',
    title: 'Import specimens',
    description:
      "Switch to 'Subjects with Specimens (Combined)' or 'Specimens only', upload your CSV, then validate and import.",
  },
  {
    id: 'view-study',
    route: '/studies',
    selector: 'body',
    title: 'View your study',
    description:
      'Go to Studies and open the Tutorial Study ({{CODE}}) to see subjects and specimens.',
  },
  {
    id: 'cleanup',
    route: '/studies',
    selector: '[data-tutorial="delete-study"]',
    title: 'Clean up',
    description:
      'On the study page, click Delete study and type {{CODE}} to confirm. This removes all tutorial data. Any user can delete the tutorial study.',
  },
]

export interface TutorialStep {
  id: string
  route: string
  selector: string
  title: string
  description: string
}

function stepsWithShortCode(shortCode: string): TutorialStep[] {
  return TUTORIAL_STEP_TEMPLATES.map((t) => ({
    ...t,
    description: t.description.replace(/\{\{CODE\}\}/g, shortCode),
  }))
}

interface TutorialContextValue {
  active: boolean
  currentStep: number
  steps: TutorialStep[]
  tutorialShortCode: string
  isTutorialCompleted: boolean
  startTutorial: () => void
  endTutorial: () => void
  goToStep: (index: number) => void
  nextStep: () => void
  prevStep: () => void
  setTutorialCompleted: () => void
}

const TutorialContext = createContext<TutorialContextValue | null>(null)

function getStoredTutorialCompleted(): boolean {
  try {
    return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function TutorialProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const { user } = useUser()
  const [active, setActive] = useState(false)
  const [currentStep, setCurrentStep] = useState(0)
  const [isTutorialCompleted, setIsTutorialCompleted] = useState(getStoredTutorialCompleted)

  const tutorialShortCode = useMemo(() => {
    if (user?.id != null) {
      return `TUT-${user.id}`
    }
    return 'TUT01'
  }, [user?.id])

  const steps = useMemo(() => stepsWithShortCode(tutorialShortCode), [tutorialShortCode])

  const setTutorialCompleted = useCallback(() => {
    try {
      localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
    } catch {
      /* ignore */
    }
    setIsTutorialCompleted(true)
  }, [])

  const startTutorial = useCallback(() => {
    setActive(true)
    setCurrentStep(0)
    navigate(TUTORIAL_STEP_TEMPLATES[0].route)
  }, [navigate])

  const endTutorial = useCallback(() => {
    setActive(false)
    setCurrentStep(0)
  }, [])

  const goToStep = useCallback(
    (index: number) => {
      const step = TUTORIAL_STEP_TEMPLATES[index]
      if (!step) return
      setCurrentStep(index)
      navigate(step.route)
    },
    [navigate]
  )

  const nextStep = useCallback(() => {
    const next = currentStep + 1
    if (next >= TUTORIAL_STEP_TEMPLATES.length) {
      setTutorialCompleted()
      endTutorial()
      return
    }
    goToStep(next)
  }, [currentStep, goToStep, endTutorial, setTutorialCompleted])

  const prevStep = useCallback(() => {
    if (currentStep <= 0) return
    goToStep(currentStep - 1)
  }, [currentStep, goToStep])

  const value = useMemo<TutorialContextValue>(
    () => ({
      active,
      currentStep,
      steps,
      tutorialShortCode,
      isTutorialCompleted,
      startTutorial,
      endTutorial,
      goToStep,
      nextStep,
      prevStep,
      setTutorialCompleted,
    }),
    [
      active,
      currentStep,
      steps,
      tutorialShortCode,
      isTutorialCompleted,
      startTutorial,
      endTutorial,
      goToStep,
      nextStep,
      prevStep,
      setTutorialCompleted,
    ]
  )

  return (
    <TutorialContext.Provider value={value}>{children}</TutorialContext.Provider>
  )
}

export function useTutorial() {
  const ctx = useContext(TutorialContext)
  if (!ctx) {
    throw new Error('useTutorial must be used within TutorialProvider')
  }
  return ctx
}

export function useTutorialOptional() {
  return useContext(TutorialContext)
}

