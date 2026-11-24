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
  expect(await screen.findByRole('alert')).toHaveTextContent('Saved')
})
```

## Mocking the API

`createMockedDomainModule(domain, overrides)` in `helpers/mock-api.ts` loads the real module with `vi.importActual` and replaces the exports that `overrides` names, as listed in `MODULE_API_KEYS` (`helpers/mock-api-domains.ts`) for that domain. Passing any other key throws an error naming the invalid key and the valid keys for that domain, so a new export needs an entry in `MODULE_API_KEYS` before the helper will replace it. For `'auth'` without an `authApi` override, the helper also replaces `authApi.getCurrentUser` with a mock that resolves to a default admin user. What to pass is under Web tests in `CODING_STANDARDS.md`:

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

To mock `api`, the client whose methods resolve to the response body, mock `lib/api/client` with `createMockedDomainModule('client', { default: { get: vi.fn() } })`. For `'client'`, `default` is the only valid override key; passing any other key (including `api`) throws. The helper copies the real `api` object and swaps in the methods you pass, so make each mock resolve to a response body. Methods you leave out stay real.

The helper leaves `axiosApi`, the raw axios instance, as the real one. To test code that calls `axiosApi` directly, either replace `axiosApi.defaults.adapter` in the test and restore it afterwards, as `lib/api/__tests__/client.test.ts` does, or mock `lib/api/client` with a hand-written factory, as `lib/__tests__/error-logger.test.ts` does.

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
