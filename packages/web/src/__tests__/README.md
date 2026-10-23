# Frontend testing guide

Web tests run on Vitest with jsdom and React Testing Library. `src/__tests__/setup.ts` runs before every file. It stubs `IntersectionObserver`, `scrollIntoView` and `localStorage` and mocks the `auth` and `settings` domain modules; override those per file as needed.

This guide covers the helpers. The rules are under Web tests in `CODING_STANDARDS.md`.

## Rendering

`render` from `helpers/render.tsx` wraps the component in a fresh `QueryClient` (no retries), a router, and the theme, user, and toast providers. It is async because it flushes the user provider's first fetch. Pass `initialEntries` to use a `MemoryRouter` at a given URL.

```typescript
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import MyComponent from '../MyComponent'

it('handles a click', async () => {
  const user = userEvent.setup()
  await render(<MyComponent />)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(screen.getByText('Saved')).toBeInTheDocument()
})
```

## Mocking the API

`createMockedDomainModule(domain, overrides)` in `helpers/mock-api.ts` loads the real module with `vi.importActual` and replaces each export named in `overrides`. What to pass is under Web tests in `CODING_STANDARDS.md`:

```typescript
import { studiesApi } from '../../lib/api/studies'

vi.mock('../../lib/api/studies', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  return createMockedDomainModule('studies', {
    studiesApi: { list: vi.fn(), get: vi.fn() },
  })
})

vi.mocked(studiesApi.list).mockResolvedValue({
  studies: [],
  pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
})
```

Import `createMockedDomainModule` with a dynamic `import()` inside the factory. Vitest hoists `vi.mock` above the file's imports, so a top-level import hits a TDZ error when the file also imports `helpers/render`.

For raw axios calls, mock `lib/api/client` with `createMockedDomainModule('client', { default: { get: vi.fn() } })`.

`helpers/mock-api-templates.ts` has presets for common pages and hooks (`statisticsPageMock`, `studiesHooksMock`, and others). Use one `vi.mock` per affected domain:

```typescript
vi.mock('../../lib/api/statistics', async () => {
  const { createMockedDomainModule } = await import('../../__tests__/helpers/mock-api')
  const { statisticsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
  return createMockedDomainModule('statistics', statisticsPageMock())
})
```

`helpers/settings-mocks.ts` builds settings values and `settingsApi.getValue` mocks.

## React Query hooks

Hook tests use `renderHook` with a wrapper that provides a fresh `QueryClient` with retries off, as in `hooks/__tests__/useStudies.test.tsx`:

```typescript
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } },
  })
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

const { result } = renderHook(() => useStudies(), { wrapper: createWrapper() })
await waitFor(() => expect(result.current.isSuccess).toBe(true))
```
