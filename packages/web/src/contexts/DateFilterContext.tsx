import { createContext, useContext, useState, ReactNode } from 'react'

interface DateFilterSettings {
  minDate: string // ISO date string (YYYY-MM-DD)
  maxDate: string // ISO date string (YYYY-MM-DD) or empty string
}

interface DateFilterContextType {
  settings: DateFilterSettings
  setMinDate: (date: string) => void
  setMaxDate: (date: string) => void
  reset: () => void
}

export const defaultMinDate = '2000-01-01'

const DateFilterContext = createContext<DateFilterContextType | undefined>(undefined)

export function DateFilterProvider({ children }: { children: ReactNode }) {
  const [minDate, setMinDate] = useState<string>(defaultMinDate)
  const [maxDate, setMaxDate] = useState<string>('')

  const reset = () => {
    setMinDate(defaultMinDate)
    setMaxDate('')
  }

  return (
    <DateFilterContext.Provider
      value={{
        settings: {
          minDate,
          maxDate,
        },
        setMinDate,
        setMaxDate,
        reset,
      }}
    >
      {children}
    </DateFilterContext.Provider>
  )
}

export function useDateFilter() {
  const context = useContext(DateFilterContext)
  if (context === undefined) {
    throw new Error('useDateFilter must be used within a DateFilterProvider')
  }
  return context
}

