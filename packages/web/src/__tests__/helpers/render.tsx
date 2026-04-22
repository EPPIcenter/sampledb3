import { ReactElement } from 'react'
import { act, render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter, MemoryRouter } from 'react-router-dom'
import { ThemeProvider } from '../../contexts/ThemeContext'
import { ToastProvider } from '../../contexts/ToastContext'
import { UserProvider } from '../../contexts/UserContext'

// Create a test query client
function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  })
}

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  queryClient?: QueryClient
  /** When set, use MemoryRouter with these entries so useSearchParams() etc. see the given URL */
  initialEntries?: string[]
}

export async function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), initialEntries, ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    const router =
      initialEntries !== undefined ? (
        <MemoryRouter initialEntries={initialEntries}>
          <ThemeProvider>
            <UserProvider>
              <ToastProvider>{children}</ToastProvider>
            </UserProvider>
          </ThemeProvider>
        </MemoryRouter>
      ) : (
        <BrowserRouter>
          <ThemeProvider>
            <UserProvider>
              <ToastProvider>{children}</ToastProvider>
            </UserProvider>
          </ThemeProvider>
        </BrowserRouter>
      )
    return <QueryClientProvider client={queryClient}>{router}</QueryClientProvider>
  }

  const result = {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  }
  // Flush microtasks so UserProvider's getCurrentUser().then(...) runs inside act
  await act(async () => {
    await Promise.resolve()
  })
  return result
}

// Re-export everything
export * from '@testing-library/react'
export { renderWithProviders as render }



