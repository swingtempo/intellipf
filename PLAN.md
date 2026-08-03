# IntelliPF - Intelligent Personal Finance

> This document is a specification an LLM can follow to create the **IntelliPF**
> personal finance web app from scratch. It describes the current behavior of the
> reference implementation (TanStack Start + React 19 + SQLite/Drizzle + Plaid + LLM
> chat), including its data model, server API, services, UI, and the behavioral
> details that are easy to get wrong.
> Code name for this is "oryxen"

---

## 1. Product Intent

A self-hosted personal finance web app that gives a **GUI over the user's finances** and lets
the user **ask an LLM to reason over that data**. Three explicit requirements:

1. **GUI to user finances** — dashboard, accounts/assets/transactions, net worth, budgets,
   retirement planner, savings goals.
   For transactions, we need to handle both checking/savings/card non-investment accounts, as well as brokerage accounts.
   Brokerage accounts need a view of the portfolio.
   Securities need asset allocations.
2. **Plaid integration** — link bank accounts via Plaid Link, sync transactions and balances.
3. **Quicken integrateion** -  Ability to import Quicken QIF files.
4. **Alpha Vantage** - the ability to get asset allocations (use this first)
5. **Strasmore integration** - the ability to get asset allocations (have this as a backup)
6. **LLM reasoning over the content** — a chat assistant with context of the user's data.
   - Providers: **OpenAI**, **OpenRouter**, **Anthropic**, selected via env config.
   - Deployments must be able to override the OpenAI **endpoint/URL** and **model** from the
     `.env` file (`OPENAI_BASE_URL`, `OPENAI_MODEL`) so a self-hosted/relay endpoint can be used.
  - The LLM can be used to invoke tools on the client side that will run sql queries to gather more info for reasoning purposes. Write these custom tools as well.
7. Ensure there can be multiple users (login). No need to do it now but sometime in the future we will want OAUTH integration with either Google or Microsoft. 

Design constraints honored throughout the reference:
- Balances/transactions are stored locally in SQLite; Plaid tokens live in the DB.
- Everything runs server-side; the LLM providers and Monte Carlo run on the server.


---

## 2. Tech Stack (as built)

** FEEL FREE TO USE A DIFFERENT TECH STACK IF YOU BELIEVE IT IS BETTER **

| Area | Choice |
|---|---|
| Framework | TanStack Start (SSR, file-based routes, server functions) |
| UI framework | React 19 |
| Router | TanStack Router (file-based, `routeTree.gen.ts` generated) |
| Language | TypeScript (strict; `verbatimModuleSyntax`, `noUnusedLocals`) |
| Styling | Tailwind CSS v4 (`@tailwindcss/vite`) + custom CSS variables + shadcn-style `ui/` components |
| Database | SQLite (`better-sqlite3`) + Drizzle ORM (`drizzle-orm`) |
| Auth | Not wired (schema only; `@auth/core` + `@auth/drizzle-adapter` installed, unused) |
| Banking | `plaid` (server SDK) + `react-plaid-link` (client modal) |
| LLM SDKs | `openai`, `@anthropic-ai/sdk` (OpenRouter uses the OpenAI SDK with a custom baseURL) |
| Charts | Recharts is a dependency but **unused**; charts are CSS-based or placeholder |
| i18n | `i18next` + `react-i18next` (browser language detector), single `en.json` |
| Validation | `zod` (some modules use `import { z } from 'zod/v4'`) |
| Date utils | `date-fns` |
| Icons | `lucide-react` |
| Path aliases | `#/*` -> `./src/*` (package.json `imports`), `@/*` -> `./src/*` (tsconfig) |
| Build | Vite 8 + `tanstackStart()` + `nitro()` plugins |

`package.json` scripts:
```
dev  = vite dev --port 3000
build= vite build
start= node .output/server/index.mjs
test = vitest run
db:generate / db:migrate / db:push / db:seed / db:studio (drizzle-kit)
```

---

## 3. Environment Variables (`.env` / `.env.example`)

```
DATABASE_URL=data/sqlite.db
AUTH_SECRET, AUTH_URL                      # reserved for future auth
GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET     # reserved
GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET     # reserved
PLAID_CLIENT_ID, PLAID_SECRET, PLAID_ENV   # PLAID_ENV=sandbox default
OPENAI_API_KEY
OPENAI_BASE_URL                            # optional; overrides OpenAI endpoint (deployment/relay)
OPENAI_MODEL                               # optional; default 'gpt-4o' (read by code, not in .env.example)
ANTHROPIC_API_KEY
OPENROUTER_API_KEY
OPENROUTER_MODEL                           # default 'anthropic/claude-sonnet-4'
LLM_PROVIDER                               # 'openrouter' | 'openai' | 'anthropic' (default 'openrouter')
FINNHUB_API_KEY
PRICE_PROVIDER                             # 'finnhub' | 'simulated' (default 'simulated')
```

Env access pattern (used throughout, because code runs in Vite SSR and production Node):
```ts
function getEnv(key: string): string | undefined {
  return (import.meta.env?.[key] as string | undefined) ?? process.env[key];
}
```

---


