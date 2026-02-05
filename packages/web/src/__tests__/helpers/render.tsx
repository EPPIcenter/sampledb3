import { ReactElement } from 'react'
import { act, render, RenderOptions } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
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
}

export async function renderWithProviders(
  ui: ReactElement,
  { queryClient = createTestQueryClient(), ...renderOptions }: CustomRenderOptions = {}
) {
  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <UserProvider>
            <ToastProvider>
              {children}
            </ToastProvider>
          </UserProvider>
        </BrowserRouter>
      </QueryClientProvider>
    )
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



