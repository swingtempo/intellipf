# IntelliPF — Agent Guidelines

## 1. Project Overview

IntelliPF is a self-hosted personal finance web app (code name: **oryxen**). It provides a GUI over user finances, Plaid bank integration, Quicken QIF import, Alpha Vantage/Strasmore asset allocations, and an LLM chat assistant with context of the user's data.

- Framework: TanStack Start (SSR, file-based routes, server functions)
- UI framework: React 19
- Router: TanStack Router (file-based)
- Language: TypeScript (strict; `verbatimModuleSyntax`, `noUnusedLocals`, `noUncheckedSideEffectImports`)
- Styling: Tailwind CSS v4 + shadcn-style `ui/` components
- Database: SQLite (`better-sqlite3`) + Drizzle ORM (`drizzle-orm`)
- LLM providers: OpenAI, Anthropic, OpenRouter
- i18n: `i18next` + `react-i18next`, single `en.json`
- Tests: Vitest (node environment)

### Key Scripts

```
npm run dev          # Vite dev server on port 3000
npm run build        # Production build
npm test             # vitest run
npm run typecheck    # tsc --noEmit
npm run db:migrate   # drizzle-kit migrate
npm run db:generate  # drizzle-kit generate
npm run db:seed      # seed the database
```

---

## 2. Hard Rule: Tests for Production Code Changes

**Any change to a production file (`src/` excluding test files) MUST be accompanied by unit tests.**

- New service functions → new `*.test.ts` file or extend existing one.
- Schema changes → ensure the test database fixture matches (e.g., add columns, constraints).
- API endpoint changes → update or add server-side tests.
- Do NOT ship a production change with only "the build passes" as verification — run `npm test` and confirm zero regressions.

Pre-existing typecheck errors in unrelated files (`qif.test.ts`, `monteCarlo.test.ts`, `sqlRunner.test.ts`) are **out of scope** — do not touch them unless directly related to the task.

---

## 3. Code Conventions

### TypeScript
- Always target strict mode; `noUnusedLocals` and `noUnusedParameters` are enabled.
- Use explicit return types on exported functions.
- Prefer `const` over `let`; avoid type assertions (`as`) unless necessary — use proper interfaces instead.
- When a variable is intentionally unused, prefix with `_`.

### Path Aliases
```ts
import { getDb, schema } from '#/server/db'        // #/* → src/*
import { formatCurrency } from '#/lib/format'
```
Both `#/*` and `@/*` resolve to `./src/*`. Use `#/` in source files.

### Naming
- **Tables**: snake_case (`stock_prices`, `security_allocations`).
- **Schema fields**: camelCase in TS, snake_case in SQL (Drizzle handles mapping).
- **Services**: `camelCase.ts` with matching export names.
- **Routes**: file-based under `src/routes/`. Dynamic segments use `$name.tsx` (e.g., `security/$ticker.tsx`).
- **API server functions**: named exports like `getSecurityDetail`, `fetchYahooPrices`.

### Imports
- No default imports from libraries unless the library requires it.
- Use named imports for vitest: `import { describe, it, expect, vi, beforeEach } from 'vitest'`
- Keep path aliases consistent within a file — don't mix `#/` and `@/`.

---

## 4. Database & Migrations

### Schema (`src/server/db/schema.ts`)
- Define all tables in this single file; export them.
- Use `sqliteTable`, `text`, `real`, `integer`, `uniqueIndex`, `index`.
- All timestamp columns use the shared `now` helper: `sql\`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))\``
- Add unique constraints on fields that will be upserted (e.g., `securities.ticker`).

### Migrations (`drizzle/`)
- New schema changes require a new migration file: `npx drizzle-kit generate`
- Then run: `npm run db:migrate`
- The `_journal.json` tracks applied entries — do not edit manually.

### Test Database Fixtures
- Tests that use the real Drizzle instance create an in-memory SQLite DB and exec raw SQL to set up tables.
- **Always mirror schema changes** in test fixture DDL (e.g., add new columns, UNIQUE constraints).
- Use `beforeEach` to truncate all tables before each test.
- Mock external fetch with `vi.fn()` — match the exact call order when a function makes multiple API calls.

---

## 5. Server Functions & APIs

### Location
- Server functions live in `src/server/api/*.ts`.
- Services (business logic) live in `src/server/services/*.ts`.

### Pattern
```ts
import { createServerFn } from '@tanstack/react-start'

export const getSecurityDetail = createServerFn({ method: 'GET' }).handler(async ({ ticker }) => {
  // ...
})
```

### User Scoping
- Use `await ensureUserScoped()` to verify the caller is authenticated and scoped to their data. Do not bind the result unless needed.

---

## 6. Routes & UI Components

### Route Files
- Placed in `src/routes/` — TanStack generates the route tree automatically.
- Re-run `npm run generate-routes` only when adding/removing route files.
- Data fetching uses either a `loader` on the route or calls a server function from a component.

### Components
- Shared UI primitives live in `src/components/ui/` (badge, button, card, dialog, table, etc.).
- Chart components are in `src/components/charts/`. Inline SVG is used instead of Recharts (Recharts is installed but unused).
- i18n keys go in `src/i18n/locales/en.json`; use the `t()` hook from `react-i18next`.

---

## 7. Environment Variables

Read via:
```ts
function getEnv(key: string): string | undefined {
  return (import.meta.env?.[key] as string | undefined) ?? process.env[key]
}
```

Key vars: `DATABASE_URL`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `ANTHROPIC_API_KEY`, `OPENROUTER_API_KEY`, `PLAID_CLIENT_ID`, `PLAID_SECRET`.

---

## 8. Testing Patterns

### Structure
```ts
import { describe, expect, it, vi, beforeEach } from 'vitest'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '#/server/db/schema'

function createTestDb() {
  const sqlite = new Database(':memory:')
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.exec(`CREATE TABLE ...`)   // mirror production schema exactly
  return sqlite
}

const testDb = createTestDb()
const dbInstance = drizzle(testDb, { schema })

vi.mock('#/server/db', () => ({ getDb: () => dbInstance, schema }))

describe('serviceName', () => {
  beforeEach(() => {
    testDb.exec('DELETE FROM ...')   // truncate all relevant tables
    vi.clearAllMocks()
  })

  it('does the thing', async () => { /* ... */ })
})
```

### Mocking External Fetch
- When a service calls multiple endpoints (e.g., chart + search), queue responses with `mockResolvedValueOnce` in exact call order.
- Example:
  ```ts
  globalThis.fetch = vi.fn()
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(chartResponse) })
    .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve(searchResponse) })
  ```

### Verifying DB State
- After calling a service, use `testDb.prepare('SELECT ...').all(...)` to assert rows were inserted/updated.
- For idempotency tests, call the function twice and verify no duplicate rows.

---

## 9. Key Directories

| Path | Purpose |
|---|---|
| `src/server/db/schema.ts` | All Drizzle table definitions |
| `src/server/db/index.ts` | DB connection factory (`getDb`, `resetDbForTests`) |
| `src/server/services/*.ts` | Business logic (fetch, compute, transform) |
| `src/server/api/*.ts` | Server functions exposed to routes |
| `src/routes/` | TanStack file-based routes |
| `src/components/ui/` | Shared shadcn-style primitives |
| `src/components/charts/` | Inline SVG chart components |
| `src/i18n/locales/en.json` | Translation strings |
| `drizzle/` | Migration SQL files + journal |
| `vitest.config.ts` | Test config (alias `#/` → `./src`) |

---

## 10. Common Pitfalls to Avoid

1. **Missing UNIQUE constraint before upsert** — Drizzle's `onConflictDoUpdate` requires a PRIMARY KEY or UNIQUE constraint on the target column(s). Add it in both schema and migration, and mirror in test DDL.
2. **Out-of-order fetch mocks** — Vitest matches `mockResolvedValueOnce` calls in sequence. If a function makes 4 API calls (2 per ticker), provide exactly 4 mock responses.
3. **Unused variables** — `noUnusedLocals` is strict. Remove or prefix with `_`.
4. **Stale test DB schema** — When adding columns to a table, update the test fixture DDL too, or inserts will fail with "no such column".
5. **Forgetting to regenerate routes** — After adding/removing `src/routes/*.tsx`, run `npm run generate-routes`.
6. **Using Recharts** — It's installed but unused; use inline SVG via existing chart components instead.
