# Frontend Testing Guide

## Important: Known Vitest Issue

**Stack Overflow During Worker Cleanup (Non-Blocking)**

When running tests, you may see a `RangeError: Maximum call stack size exceeded` error after all tests complete. This is a **known non-blocking issue** with Vitest/tinypool during worker cleanup.

- **Impact**: None - all tests pass successfully before the error occurs
- **When it happens**: Only during worker cleanup/teardown, after all tests complete
- **Action required**: None - this can be safely ignored
- **Status**: All frontend tests pass; this is a cosmetic cleanup issue

**Do not attempt to "fix" this error** - it's a known Vitest/tinypool bug that doesn't affect test results.

## Setup

Tests use Vitest + React Testing Library. Run tests with:

```bash
bun test          # Run once
bun test:watch    # Watch mode
bun test:ui       # UI mode
bun test:coverage # With coverage
```

## Test Structure

- `__tests__/helpers/` - Test utilities
  - `render.tsx`: Custom render function with providers (QueryClient, BrowserRouter, ToastProvider)
  - `mock-api.ts`: `createMockedApi()` — `importActual` + global `authApi` / `tableViewConfigurationsApi` defaults + per-test overrides
  - `mock-api-templates.ts`: domain presets (`statisticsPageMock`, `studiesPageMock`, etc.) for common page/hook tests
  - `setup.ts`: Global test setup (IntersectionObserver, in-memory localStorage, default `createMockedApi()` for `lib/api`)
- `__tests__/fixtures/` - Test data fixtures
- `lib/__tests__/` - Lib unit tests (e.g. commands, constants, plate-filename-match, container-types, localUserHistory, hotkeys, error-logger)
- `components/__tests__/` - Component tests (e.g. BulkImportFlow, ContainerDerivationModal)
- `components/forms/__tests__/` - Form tests (SubjectForm, StudyForm, ControlDefinitionForm, SpecimenForm)
- `components/wizards/__tests__/` - Wizard step tests (e.g. BatchInfoStep)
- `hooks/__tests__/` - Custom hook tests
- `pages/__tests__/` - Page smoke tests

## Test Utilities

### Custom Render Function

The `render` function from `helpers/render.tsx` automatically wraps components with:
- `QueryClientProvider` (React Query)
- `BrowserRouter` (React Router)

```typescript
import { render, screen } from '../../__tests__/helpers/render'
import MyComponent from '../MyComponent'

it('renders component', () => {
  render(<MyComponent />)
  expect(screen.getByText('Hello')).toBeInTheDocument()
})
```

### Mocking API Calls

Use `createMockedApi` so tests get `importActual` types/exports, global auth + table-view mocks, and only the domains you override:

```typescript
import { vi } from 'vitest'
import * as api from '../../lib/api'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
    studiesApi: {
      list: vi.fn(),
      get: vi.fn(),
    },
  })
})

// studiesApi methods return unwrapped data (not AxiosResponse)
vi.mocked(api.studiesApi.list).mockResolvedValue({
  studies: [],
  pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
})
```

Replace whole `*Api` objects in overrides (do not patch single methods on the real object). For pages that use `import api from '../lib/api'`, pass a `default` stub:

```typescript
vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({
    default: { get: vi.fn() },
    derivationsApi: { listFromContainer: vi.fn().mockResolvedValue({ derivations: [] }) },
  })
})
```

Use dynamic `import()` inside the factory (not a top-level `createMockedApi` import) when the test file also imports `helpers/render` — Vitest hoists `vi.mock` and causes a TDZ error otherwise.

All `lib/api` mocks in page, component, and hook tests use this pattern (see any `*.test.tsx` under `src/`). Prefer `mock-api-templates` for repeated page setups:

```typescript
const { statisticsPageMock } = await import('../../__tests__/helpers/mock-api-templates')
return createMockedApi(statisticsPageMock())
```

Production code should import from domain modules (`../lib/api/studies`, `../lib/api/client`, etc.). `src/lib/api.ts` remains a deprecated barrel re-export. Vitest aliases domain paths to the barrel so `vi.mock('../../lib/api')` still applies in tests.

## Writing Tests

### Component Tests

```typescript
import { describe, it, expect } from 'vitest'
import { render, screen } from '../../__tests__/helpers/render'
import userEvent from '@testing-library/user-event'
import MyComponent from '../MyComponent'

describe('MyComponent', () => {
  it('renders correctly', () => {
    render(<MyComponent />)
    expect(screen.getByText('Hello')).toBeInTheDocument()
  })

  it('handles user interaction', async () => {
    const user = userEvent.setup()
    render(<MyComponent />)
    
    const button = screen.getByRole('button')
    await user.click(button)
    
    expect(screen.getByText('Clicked')).toBeInTheDocument()
  })
})
```

### React Query Hook Tests

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactNode } from 'react'
import { useStudies } from '../useStudies'
import * as api from '../../lib/api'

vi.mock('../../lib/api', async () => {
  const { createMockedApi } = await import('../../__tests__/helpers/mock-api')
  return createMockedApi({ studiesApi: { list: vi.fn() } })
})

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  })

  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  )
}

describe('useStudies', () => {
  it('should fetch studies', async () => {
    vi.mocked(api.studiesApi.list).mockResolvedValue({
      studies: [],
      pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
    })

    const { result } = renderHook(() => useStudies(), {
      wrapper: createWrapper(),
    })

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true)
    })
  })
})
```

## Coverage

Coverage excludes `src/**/*.css` and `src/lib/api.ts` (api.ts is exercised via hooks and page tests). Thresholds are set to a baseline and can be raised toward 90% as more tests are added.

Run coverage reports:

```bash
bun test:coverage
```

Coverage reports are generated in:
- `coverage/` directory (HTML, JSON, text formats)

## Running Tests From Repo Root

From the repository root you can run all package tests and coverage:

```bash
bun run test          # Run API and web tests
bun run test:coverage # Run API and web tests with coverage
```

## New Tests and Failing Behavior

New tests are allowed to **fail** initially if they correctly express expected behavior. Follow-up work will update the implementation to satisfy the tests. Do not remove or relax assertions solely to make tests pass; fix the code under test instead.

## Best Practices

1. **Use custom render**: Always use `render` from `helpers/render.tsx` for components
2. **Mock API calls**: Use `vi.mock` to mock API modules in hook tests
3. **Test user interactions**: Use `@testing-library/user-event` for user interactions
4. **Test loading/error states**: Include tests for loading and error states
5. **Test cache invalidation**: For mutations, verify that queries are invalidated
6. **Use waitFor**: For async operations, use `waitFor` or `findBy` queries
7. **Test accessibility**: Use semantic queries (`getByRole`, `getByLabelText`) when possible

